import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import * as path from 'path';
import { chain } from 'stream-chain';
import { randomUUID } from 'crypto';
import { MetadataService } from '../metadata/metadata.service';
import { WardBoundaryService } from '../ward-boundary/ward-boundary.service';
import {
  normalizeProperties,
  validateProperties,
} from '../records/field-types/field-type.registry';
import { GeoJsonGeometry } from '../common/interfaces/geojson.interface';
import {
  GeoJsonImportOptionsDto,
  GeoJsonImportPreviewDto,
} from './dto/geojson-import.dto';
import { buildImportColumnAnalysis } from './import-column-discovery';
import type {
  ImportColumnAnalysis,
  ImportDetectedColumn,
} from './import-column-discovery';
import { RelationshipService } from '../metadata/relationship.service';
import { isLineFieldType } from '../records/utils/line-geometry.util';
import {
  isPolygonFieldType,
  normalizePolygonGeometryValue,
} from '../records/utils/area-polygon-geometry.util';
import {
  IMPORT_UPLOAD_DIR,
  resolveImportFilePath,
  safeDeleteImportFile,
} from './import-file.util';

const { pick } = require('stream-json/filters/pick.js') as {
  pick: (options: { filter: string }) => NodeJS.ReadWriteStream;
};
const { parser } = require('stream-json/parser.js') as {
  parser: () => NodeJS.ReadWriteStream;
};
const { streamValues } = require('stream-json/streamers/stream-values.js') as {
  streamValues: () => NodeJS.ReadWriteStream;
};
const { streamArray } = require('stream-json/streamers/stream-array.js') as {
  streamArray: () => NodeJS.ReadWriteStream;
};

type SchemaFieldLike = {
  code: string;
  label: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
};

type GeoJsonFeatureLike = {
  type?: string;
  properties?: Record<string, unknown> | null;
  geometry?: GeoJsonGeometry | null;
};

type PreparedFeature = {
  rowNumber: number;
  properties: Record<string, unknown>;
  geometry: GeoJsonGeometry;
  warnings: string[];
};

const GEOJSON_GEOMETRY_SOURCE_KEYS = new Set(['geometry', '__geometry__']);

type ImportContext = {
  tenantId: string;
  layerId: string;
  userId: string;
  layer: {
    id: string;
    code: string;
    name: string;
    geometryKind: string;
  };
  schema: {
    schemaVersionId: string;
    fields: SchemaFieldLike[];
  };
  options: Required<Pick<GeoJsonImportOptionsDto, 'batchSize'>> &
    Omit<GeoJsonImportOptionsDto, 'batchSize'>;
  boundaryGeometry: GeoJsonGeometry | null;
};

export type GeoJsonImportSampleItem = {
  rowNumber: number;
  geometryType: string;
  properties: Record<string, unknown>;
};

export type GeoJsonImportErrorItem = {
  rowNumber: number;
  reason: string;
};

export type GeoJsonImportWarningItem = {
  rowNumber: number;
  message: string;
};

export type GeoJsonPolygonStats = {
  total: number;
  valid: number;
  autoClosed: number;
  invalid: number;
};

export type GeoJsonImportSummary = {
  importId: string;
  layerId: string;
  totalFeatures: number;
  accepted: number;
  rejected: number;
  inserted?: number;
  geometryTypes: Record<string, number>;
  polygonStats: GeoJsonPolygonStats;
  sample: GeoJsonImportSampleItem[];
  errors: GeoJsonImportErrorItem[];
  warnings: GeoJsonImportWarningItem[];
  detectedColumns?: string[];
  existingFields?: string[];
  unknownColumns?: string[];
  columnSuggestions?: ImportColumnAnalysis['columnSuggestions'];
};

@Injectable()
export class GeoJsonImportService {
  private readonly logger = new Logger(GeoJsonImportService.name);
  private readonly uploadDir = IMPORT_UPLOAD_DIR;

  constructor(
    private readonly metadataService: MetadataService,
    private readonly wardBoundaryService: WardBoundaryService,
    private readonly dataSource: DataSource,
    private readonly relationshipService: RelationshipService,
  ) {
    mkdirSync(this.uploadDir, { recursive: true });
  }

  async upload(tenantId: string, layerId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Thiếu file GeoJSON');
    }

    try {
      await this.metadataService.getLayerById(tenantId, layerId);
      const schema = await this.metadataService.getPublishedSchema(
        tenantId,
        layerId,
      );

      const ext = path.extname(file.originalname).toLowerCase();
      if (!['.geojson', '.json'].includes(ext)) {
        throw new BadRequestException('Chỉ hỗ trợ file .geojson hoặc .json');
      }

      await this.assertFeatureCollection(file.path);

      return {
        importId: path.basename(file.path),
        fileName: file.originalname,
        layerId,
        status: 'uploaded',
        ...(await this.analyzeGeoJsonColumns(file.path, schema)),
      };
    } catch (error) {
      this.logRetainedImportFile(file.path, error);
      throw error;
    }
  }

  async preview(
    tenantId: string,
    layerId: string,
    dto: GeoJsonImportPreviewDto,
  ): Promise<GeoJsonImportSummary> {
    const context = await this.buildContext(tenantId, layerId, '', dto);
    const summary = await this.processFile(context, {
      sampleSize: dto.sampleSize ?? 20,
      insert: false,
    });
    return {
      ...summary,
      ...(await this.analyzeGeoJsonColumns(
        this.resolveFilePath(dto.importId),
        context.schema,
      )),
    };
  }

  async execute(
    tenantId: string,
    layerId: string,
    userId: string,
    dto: GeoJsonImportOptionsDto,
  ): Promise<GeoJsonImportSummary> {
    const filePath = this.resolveFilePath(dto.importId);

    try {
      const newFields = dto.newFields ?? [];
      if (newFields.length > 0) {
        await this.metadataService.addFieldsToLayerSchema(
          tenantId,
          layerId,
          userId,
          newFields.map((field) => ({
            code: field.code,
            label: field.label,
            fieldType: field.fieldType,
            required: field.required,
            dataSchema: field.dataSchema,
            uiSchema: field.uiSchema,
            displaySchema: field.displaySchema,
          })),
        );
      }

      const context = await this.buildContext(tenantId, layerId, userId, dto);

      const summary = await this.dataSource.transaction(async (manager) =>
        this.processFile(context, {
          sampleSize: 20,
          insert: true,
          manager,
        }),
      );
      const result = {
        ...summary,
        ...(await this.analyzeGeoJsonColumns(filePath, context.schema)),
      };

      await safeDeleteImportFile(filePath, this.logger);
      return result;
    } catch (error) {
      this.logRetainedImportFile(filePath, error);
      throw error;
    }
  }

  private async buildContext(
    tenantId: string,
    layerId: string,
    userId: string,
    dto: GeoJsonImportOptionsDto,
  ): Promise<ImportContext> {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(
      tenantId,
      layerId,
    );
    const filePath = this.resolveFilePath(dto.importId);

    await this.assertFeatureCollection(filePath);

    return {
      tenantId,
      layerId,
      userId,
      layer: {
        id: layer.id,
        code: layer.code,
        name: layer.name,
        geometryKind: layer.geometryKind,
      },
      schema,
      options: {
        ...dto,
        batchSize: dto.batchSize ?? 1000,
      },
      boundaryGeometry: this.resolveBoundaryGeometry(dto),
    };
  }

  private async processFile(
    context: ImportContext,
    options: {
      sampleSize: number;
      insert: boolean;
      manager?: EntityManager;
    },
  ): Promise<GeoJsonImportSummary> {
    const filePath = this.resolveFilePath(context.options.importId);
    const geometryTypes: Record<string, number> = {};
    const polygonStats: GeoJsonPolygonStats = {
      total: 0,
      valid: 0,
      autoClosed: 0,
      invalid: 0,
    };
    const sample: GeoJsonImportSampleItem[] = [];
    const errors: GeoJsonImportErrorItem[] = [];
    const warnings: GeoJsonImportWarningItem[] = [];
    let totalFeatures = 0;
    let accepted = 0;
    let rejected = 0;
    let inserted = 0;
    let batch: PreparedFeature[] = [];

    const flush = async () => {
      if (batch.length === 0) return;

      const spatialAccepted = await this.applySpatialFilter(
        batch,
        context.boundaryGeometry,
        options.manager,
      );
      const acceptedKeys = new Set(
        spatialAccepted.map((feature) => feature.rowNumber),
      );
      const spatialRejected = batch.filter(
        (feature) => !acceptedKeys.has(feature.rowNumber),
      );

      rejected += spatialRejected.length;
      for (const feature of spatialRejected.slice(
        0,
        Math.max(0, 50 - errors.length),
      )) {
        errors.push({
          rowNumber: feature.rowNumber,
          reason: 'Không giao với boundary filter',
        });
      }

      accepted += spatialAccepted.length;
      for (const feature of spatialAccepted) {
        if (sample.length < options.sampleSize) {
          sample.push({
            rowNumber: feature.rowNumber,
            geometryType: feature.geometry.type,
            properties: feature.properties,
          });
        }
      }

      if (options.insert && spatialAccepted.length > 0) {
        inserted += await this.insertBatch(
          context,
          spatialAccepted,
          options.manager,
        );
      }

      batch = [];
    };

    for await (const feature of this.iterateFeatures(filePath)) {
      totalFeatures += 1;
      const rawGeometryType = feature?.geometry?.type;
      if (rawGeometryType && this.isPolygonGeometryType(rawGeometryType)) {
        polygonStats.total += 1;
      }
      const prepared = await this.prepareFeature(
        feature,
        totalFeatures,
        context,
      );
      const geometryType = rawGeometryType;
      if (geometryType) {
        geometryTypes[geometryType] = (geometryTypes[geometryType] ?? 0) + 1;
      }

      if ('error' in prepared) {
        if (rawGeometryType && this.isPolygonGeometryType(rawGeometryType)) {
          polygonStats.invalid += 1;
        }
        rejected += 1;
        if (errors.length < 50) {
          errors.push({
            rowNumber: totalFeatures,
            reason: prepared.error,
          });
        }
        continue;
      }

      if (this.isPolygonGeometry(prepared.feature.geometry)) {
        polygonStats.valid += 1;
        if (prepared.feature.warnings.length > 0) {
          polygonStats.autoClosed += 1;
        }
      }
      for (const message of prepared.feature.warnings.slice(
        0,
        Math.max(0, 50 - warnings.length),
      )) {
        warnings.push({
          rowNumber: prepared.feature.rowNumber,
          message,
        });
      }

      batch.push(prepared.feature);
      if (batch.length >= context.options.batchSize) {
        await flush();
      }
    }

    await flush();

    return {
      importId: context.options.importId,
      layerId: context.layerId,
      totalFeatures,
      accepted,
      rejected,
      ...(options.insert ? { inserted } : {}),
      geometryTypes,
      polygonStats,
      sample,
      errors,
      warnings,
    };
  }

  private async prepareFeature(
    feature: GeoJsonFeatureLike,
    rowNumber: number,
    context: ImportContext,
  ): Promise<{ feature: PreparedFeature } | { error: string }> {
    if (!feature || feature.type !== 'Feature') {
      return { error: 'Item không phải GeoJSON Feature' };
    }

    if (!feature.geometry) {
      return { error: 'Feature thiếu geometry' };
    }

    const normalizedGeometry = this.normalizeFeatureGeometry(feature.geometry);
    if ('error' in normalizedGeometry) {
      return { error: normalizedGeometry.error };
    }

    const geometryError = this.validateGeometry(
      normalizedGeometry.geometry,
      context.layer.geometryKind,
    );
    if (geometryError) {
      return { error: geometryError };
    }

    const mappedProperties = this.mapProperties(
      feature.properties ?? {},
      context.schema.fields,
      context.options.propertyMapping ?? {},
      normalizedGeometry.geometry,
    );
    const { rows, errors: relationshipErrors } =
      await this.relationshipService.normalizeImportRows(
        context.tenantId,
        context.schema.fields,
        [{ rowNumber, properties: mappedProperties }],
      );
    if (relationshipErrors.length > 0) {
      return {
        error: relationshipErrors.map((err) => err.message).join('; '),
      };
    }

    const resolvedProperties = rows[0]?.properties ?? mappedProperties;
    const errors = validateProperties(
      context.schema.fields,
      resolvedProperties,
    );
    if (errors.length > 0) {
      return {
        error: errors
          .map((err) => `${err.field || 'field'}: ${err.message}`)
          .join('; '),
      };
    }

    return {
      feature: {
        rowNumber,
        properties: normalizeProperties(
          context.schema.fields,
          resolvedProperties,
        ),
        geometry: normalizedGeometry.geometry,
        warnings: normalizedGeometry.warnings,
      },
    };
  }

  private mapProperties(
    source: Record<string, unknown>,
    fields: SchemaFieldLike[],
    override: Record<string, string>,
    geometry: GeoJsonGeometry,
  ): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    const sourceKeys = Object.keys(source);
    const normalizedSource = new Map(
      sourceKeys.map((key) => [normalizeKey(key), key]),
    );

    for (const field of fields) {
      const overrideKey = override[field.code];
      if (
        isLineFieldType(field.fieldType) &&
        this.isLineGeometry(geometry) &&
        (!overrideKey || GEOJSON_GEOMETRY_SOURCE_KEYS.has(overrideKey))
      ) {
        mapped[field.code] = geometry;
        continue;
      }
      if (
        isPolygonFieldType(field.fieldType) &&
        this.isPolygonGeometry(geometry) &&
        (!overrideKey || GEOJSON_GEOMETRY_SOURCE_KEYS.has(overrideKey))
      ) {
        mapped[field.code] = geometry;
        continue;
      }

      const sourceKey =
        (overrideKey && overrideKey in source ? overrideKey : null) ??
        this.findAutoSourceKey(field, sourceKeys, normalizedSource);

      if (!sourceKey) continue;
      const value = source[sourceKey];
      if (value !== null && value !== undefined && value !== '') {
        mapped[field.code] = value;
      }
    }

    return mapped;
  }

  private findAutoSourceKey(
    field: SchemaFieldLike,
    sourceKeys: string[],
    normalizedSource: Map<string, string>,
  ): string | null {
    const candidates = [
      field.code,
      field.label,
      ...(isLineFieldType(field.fieldType) ||
      isPolygonFieldType(field.fieldType)
        ? ['geometry', '__geometry__']
        : []),
      ...this.osmAliasesForField(field.code),
    ];

    for (const candidate of candidates) {
      const exact = sourceKeys.find((key) => key === candidate);
      if (exact) return exact;
      const normalized = normalizedSource.get(normalizeKey(candidate));
      if (normalized) return normalized;
    }

    return null;
  }

  private osmAliasesForField(fieldCode: string): string[] {
    const aliases: Record<string, string[]> = {
      ten: ['name', 'name:vi', 'official_name'],
      loai_duong: ['highway', 'road', 'class'],
      mat_duong: ['surface'],
      so_lan: ['lanes'],
      cau: ['bridge'],
      mot_chieu: ['oneway'],
      loai_song: ['waterway'],
    };
    return aliases[fieldCode] ?? [];
  }

  private validateGeometry(
    geometry: GeoJsonGeometry,
    geometryKind: string,
  ): string | null {
    if (!geometry || typeof geometry.type !== 'string') {
      return 'Geometry không hợp lệ';
    }
    if (geometry.type === 'GeometryCollection') {
      return 'Không hỗ trợ GeometryCollection';
    }
    if (!SUPPORTED_GEOMETRIES.has(geometry.type)) {
      return `Không hỗ trợ geometry type ${geometry.type}`;
    }
    if (!geometryMatchesKind(geometry.type, geometryKind)) {
      return `Geometry type ${geometry.type} không khớp layer geometry_kind ${geometryKind}`;
    }
    return null;
  }

  private normalizeFeatureGeometry(
    geometry: GeoJsonGeometry,
  ): { geometry: GeoJsonGeometry; warnings: string[] } | { error: string } {
    if (this.isPolygonGeometry(geometry)) {
      const normalized = normalizePolygonGeometryValue(geometry);
      if (!normalized) {
        return {
          error:
            'Polygon/MultiPolygon không hợp lệ: ring phải có ít nhất 3 đỉnh, mỗi điểm là [lng, lat], và hệ thống sẽ tự đóng vòng nếu thiếu điểm cuối',
        };
      }

      return {
        geometry: normalized.geometry,
        warnings:
          normalized.autoClosedRings > 0
            ? [
                `Polygon đã được tự động đóng ${normalized.autoClosedRings} vòng tọa độ.`,
              ]
            : [],
      };
    }

    return { geometry, warnings: [] };
  }

  private isLineGeometry(geometry: GeoJsonGeometry): boolean {
    return (
      geometry.type === 'LineString' || geometry.type === 'MultiLineString'
    );
  }

  private isPolygonGeometry(geometry: GeoJsonGeometry): boolean {
    return this.isPolygonGeometryType(geometry.type);
  }

  private isPolygonGeometryType(geometryType: string): boolean {
    return geometryType === 'Polygon' || geometryType === 'MultiPolygon';
  }

  private async applySpatialFilter(
    batch: PreparedFeature[],
    boundary: GeoJsonGeometry | null,
    manager?: EntityManager,
  ): Promise<PreparedFeature[]> {
    if (!boundary) return batch;
    if (batch.length === 0) return [];

    const rows = await (manager ?? this.dataSource).query(
      `
      SELECT x.row_number
      FROM jsonb_to_recordset($1::jsonb)
        AS x(row_number int, geometry jsonb)
      WHERE ST_Intersects(
        ST_SetSRID(ST_GeomFromGeoJSON(x.geometry::text), 4326),
        ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)
      )
      `,
      [
        JSON.stringify(
          batch.map((feature) => ({
            row_number: feature.rowNumber,
            geometry: feature.geometry,
          })),
        ),
        JSON.stringify(boundary),
      ],
    );
    const accepted = new Set(
      rows.map((row: { row_number: number }) => row.row_number),
    );
    return batch.filter((feature) => accepted.has(feature.rowNumber));
  }

  private async insertBatch(
    context: ImportContext,
    batch: PreparedFeature[],
    manager?: EntityManager,
  ): Promise<number> {
    const rows = await (manager ?? this.dataSource).query(
      `
      INSERT INTO features (
        tenant_id,
        layer_id,
        schema_version_id,
        properties,
        geometry,
        location_status,
        geometry_source,
        created_by,
        updated_by
      )
      SELECT
        $1::uuid,
        $2::uuid,
        $3::uuid,
        x.properties,
        ST_SetSRID(ST_GeomFromGeoJSON(x.geometry::text), 4326),
        'located',
        'imported',
        $4::uuid,
        $4::uuid
      FROM jsonb_to_recordset($5::jsonb)
        AS x(properties jsonb, geometry jsonb)
      RETURNING id
      `,
      [
        context.tenantId,
        context.layerId,
        context.schema.schemaVersionId,
        context.userId,
        JSON.stringify(
          batch.map((feature) => ({
            properties: feature.properties,
            geometry: feature.geometry,
          })),
        ),
      ],
    );
    return rows.length;
  }

  private resolveBoundaryGeometry(
    dto: GeoJsonImportOptionsDto,
  ): GeoJsonGeometry | null {
    if (dto.filterBoundary) {
      this.assertBoundaryGeometry(dto.filterBoundary);
      return dto.filterBoundary;
    }

    if (dto.filterMode === 'current_ward') {
      const boundary = this.wardBoundaryService.getBoundaryGeoJson();
      const geometry = boundary.features[0]?.geometry;
      if (!geometry) {
        throw new BadRequestException(
          'Không tìm thấy ranh giới phường hiện tại',
        );
      }
      return geometry;
    }

    return null;
  }

  private assertBoundaryGeometry(geometry: GeoJsonGeometry) {
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
      throw new BadRequestException(
        'filterBoundary chỉ hỗ trợ GeoJSON Polygon hoặc MultiPolygon',
      );
    }
  }

  private resolveFilePath(importId: string) {
    let filePath: string;
    try {
      filePath = resolveImportFilePath(importId);
    } catch {
      throw new BadRequestException('Đường dẫn file GeoJSON không hợp lệ');
    }
    if (!existsSync(filePath)) {
      throw new NotFoundException('File GeoJSON không tồn tại hoặc đã hết hạn');
    }
    return filePath;
  }

  private logRetainedImportFile(filePath: string, error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.error(
      `[geojson-import] Import lỗi, giữ lại file để debug: ${filePath}. Lỗi: ${detail}`,
    );
  }

  private async assertFeatureCollection(filePath: string) {
    const shape = await this.readFeatureCollectionShape(filePath);
    if (shape.type !== 'FeatureCollection' || !shape.hasFeaturesArray) {
      throw new BadRequestException(
        'GeoJSON phải có dạng { "type": "FeatureCollection", "features": [...] }',
      );
    }

    try {
      const iterator = this.iterateFeatures(filePath);
      const first = await iterator.next();
      if (!first.done && first.value?.type !== 'Feature') {
        throw new BadRequestException('features phải là mảng GeoJSON Feature');
      }
      if (iterator.return) await iterator.return(undefined);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'features phải là mảng GeoJSON Feature',
      );
    }
  }

  private async readFeatureCollectionShape(
    filePath: string,
  ): Promise<{ type: string | null; hasFeaturesArray: boolean }> {
    const pipeline = chain([createReadStream(filePath), parser()] as any[]);
    let depth = 0;
    let pendingTopLevelKey: string | null = null;
    let type: string | null = null;
    let hasFeaturesArray = false;

    for await (const token of pipeline as AsyncIterable<{
      name: string;
      value?: unknown;
    }>) {
      if (token.name === 'keyValue' && depth === 1) {
        pendingTopLevelKey =
          typeof token.value === 'string' ? token.value : null;
        continue;
      }

      if (pendingTopLevelKey === 'type' && token.name === 'stringValue') {
        type = typeof token.value === 'string' ? token.value : null;
        pendingTopLevelKey = null;
      }

      if (pendingTopLevelKey === 'features') {
        hasFeaturesArray = token.name === 'startArray';
        pendingTopLevelKey = null;
      }

      if (token.name === 'startObject' || token.name === 'startArray') {
        depth += 1;
      }
      if (token.name === 'endObject' || token.name === 'endArray') {
        depth -= 1;
      }

      if (type && hasFeaturesArray) {
        break;
      }
    }

    return { type, hasFeaturesArray };
  }

  private async readTopLevelType(filePath: string): Promise<string | null> {
    const pipeline = chain([
      createReadStream(filePath),
      parser(),
      pick({ filter: 'type' }),
      streamValues(),
    ] as any[]);

    for await (const item of pipeline as AsyncIterable<{ value: unknown }>) {
      return typeof item.value === 'string' ? item.value : null;
    }
    return null;
  }

  private async *iterateFeatures(
    filePath: string,
  ): AsyncGenerator<GeoJsonFeatureLike> {
    const pipeline = chain([
      createReadStream(filePath),
      parser(),
      pick({ filter: 'features' }),
      streamArray(),
    ] as any[]);

    for await (const item of pipeline as AsyncIterable<{
      value: GeoJsonFeatureLike;
    }>) {
      yield item.value;
    }
  }

  private async analyzeGeoJsonColumns(
    filePath: string,
    schema: { fields: SchemaFieldLike[] },
    sampleSize = 20,
  ): Promise<ImportColumnAnalysis> {
    const columns = new Map<string, ImportDetectedColumn>();
    let sampled = 0;
    const hasLineField = schema.fields.some((field) =>
      isLineFieldType(field.fieldType),
    );
    const hasPolygonField = schema.fields.some((field) =>
      isPolygonFieldType(field.fieldType),
    );

    for await (const feature of this.iterateFeatures(filePath)) {
      if (
        feature.geometry &&
        this.isLineGeometry(feature.geometry) &&
        !hasLineField
      ) {
        const current =
          columns.get('geometry') ??
          ({
            code: 'geometry',
            label: 'Geometry',
            values: [],
          } satisfies ImportDetectedColumn);
        if (current.values.length < sampleSize) {
          current.values.push(feature.geometry);
        }
        columns.set('geometry', current);
      }
      if (
        feature.geometry &&
        this.isPolygonGeometry(feature.geometry) &&
        !hasPolygonField
      ) {
        const current =
          columns.get('geometry') ??
          ({
            code: 'geometry',
            label: 'Geometry',
            values: [],
          } satisfies ImportDetectedColumn);
        if (current.values.length < sampleSize) {
          current.values.push(feature.geometry);
        }
        columns.set('geometry', current);
      }

      for (const [key, value] of Object.entries(feature.properties ?? {})) {
        const current =
          columns.get(key) ??
          ({
            code: key,
            label: key,
            values: [],
          } satisfies ImportDetectedColumn);
        if (current.values.length < sampleSize) {
          current.values.push(value);
        }
        columns.set(key, current);
      }

      sampled += 1;
      if (sampled >= sampleSize) break;
    }

    return buildImportColumnAnalysis([...columns.values()], schema.fields);
  }
}

const SUPPORTED_GEOMETRIES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function geometryMatchesKind(
  geometryType: string,
  geometryKind: string,
): boolean {
  switch (geometryKind) {
    case 'point':
      return geometryType === 'Point';
    case 'multipoint':
      return geometryType === 'Point' || geometryType === 'MultiPoint';
    case 'linestring':
      return geometryType === 'LineString';
    case 'multilinestring':
      return (
        geometryType === 'LineString' || geometryType === 'MultiLineString'
      );
    case 'polygon':
      return geometryType === 'Polygon' || geometryType === 'MultiPolygon';
    case 'multipolygon':
      return geometryType === 'Polygon' || geometryType === 'MultiPolygon';
    default:
      return false;
  }
}
