import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { FeatureEntity } from '../database/entities/feature.entity';
import { MetadataService } from '../metadata/metadata.service';
import {
  normalizeProperties,
  validateProperties,
} from './field-types/field-type.registry';
import {
  buildUnitHints,
  fieldsForImportValidation,
} from './utils/import-validation.util';
import { resolvePointFromLatLngFields } from './utils/lat-lng-geometry.util';
import type { PointGeoJson } from './utils/lat-lng-geometry.util';
import { RecordDisplayService } from './record-display.service';
import {
  parseRecordListQuery,
  ParsedRecordListQuery,
  RecordListQueryInput,
} from './utils/record-list-query.util';

export type RecordListQuery = RecordListQueryInput;
export type { ParsedRecordListQuery };

@Injectable()
export class RecordsService implements OnModuleInit {
  private readonly logger = new Logger(RecordsService.name);

  constructor(
    @InjectRepository(FeatureEntity)
    private readonly featuresRepository: Repository<FeatureEntity>,
    private readonly metadataService: MetadataService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly recordDisplayService: RecordDisplayService,
  ) {}

  async onModuleInit() {
    const tenantId = this.configService.get('tenant.defaultId', { infer: true });
    try {
      const synced = await this.backfillLatLngGeometries(tenantId);
      if (synced > 0) {
        this.logger.log(`Đã đồng bộ geometry cho ${synced} bản ghi lat/lng`);
      }
    } catch (error) {
      this.logger.warn(
        `Backfill lat/lng geometry: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  async listRecords(
    tenantId: string,
    layerId: string,
    query: RecordListQuery,
  ) {
    await this.metadataService.getLayerById(tenantId, layerId);

    const { page, pageSize, sortBy, sortOrder, q } = parseRecordListQuery(query);
    const skip = (page - 1) * pageSize;
    const tableContext = await this.recordDisplayService.buildListTableContext(
      tenantId,
      layerId,
    );

    const qb = this.featuresRepository
      .createQueryBuilder('feature')
      .where('feature.tenantId = :tenantId', { tenantId })
      .andWhere('feature.layerId = :layerId', { layerId });

    if (q) {
      qb.andWhere('feature.properties::text ILIKE :q', { q: `%${q}%` });
    }

    const sortColumn =
      sortBy === 'updatedAt' ? 'feature.updatedAt' : 'feature.createdAt';
    qb.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    const [items, total] = await qb.skip(skip).take(pageSize).getManyAndCount();

    return {
      items: items.map((feature) => ({
        ...this.toRecordResponse(feature),
        cells: this.recordDisplayService.buildTableCells(
          tableContext,
          feature.properties,
        ),
      })),
      columns: tableContext.columns,
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async getRecord(tenantId: string, layerId: string, recordId: string) {
    const feature = await this.findFeature(tenantId, layerId, recordId);
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    let schemaFields: Array<{
      code: string;
      fieldType: string;
      sortOrder?: number;
    }> = [];

    try {
      const schema = await this.metadataService.getPublishedSchema(
        tenantId,
        layerId,
      );
      schemaFields = schema.fields;
    } catch {
      schemaFields = [];
    }

    let geometry = await this.loadGeometryGeoJson(feature.id);
    if (
      !geometry &&
      layer.geometryKind === 'point' &&
      schemaFields.some((field) => field.fieldType === 'lat_lng')
    ) {
      geometry =
        resolvePointFromLatLngFields(schemaFields, feature.properties) ?? null;
    }

    const display = await this.recordDisplayService.buildDisplay(
      tenantId,
      layerId,
      recordId,
      feature.properties,
    );

    return { ...this.toRecordResponse(feature), geometry, display };
  }

  async getRecordDisplay(tenantId: string, layerId: string, recordId: string) {
    const feature = await this.findFeature(tenantId, layerId, recordId);
    const display = await this.recordDisplayService.buildDisplay(
      tenantId,
      layerId,
      recordId,
      feature.properties,
    );
    return display;
  }

  async createRecord(
    tenantId: string,
    layerId: string,
    userId: string,
    body: {
      properties?: Record<string, unknown>;
      geometry?: unknown;
      administrativeUnitId?: string;
    },
  ) {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(tenantId, layerId);

    const properties = body.properties ?? {};
    const errors = validateProperties(schema.fields, properties);
    if (errors.length > 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', details: errors });
    }

    const normalized = normalizeProperties(schema.fields, properties);

    let geometry = body.geometry;
    let locationStatus = geometry ? 'located' : 'unlocated';
    let geometrySource: string | null = geometry ? 'drawn' : null;

    if (!geometry && (layer.geometryKind === 'point' || layer.geometryType === 'point')) {
      const pointFromField = resolvePointFromLatLngFields(
        schema.fields,
        normalized,
      );
      if (pointFromField) {
        geometry = pointFromField;
        locationStatus = 'located';
        geometrySource = 'geocoded';
      }
    }

    const feature = this.featuresRepository.create({
      tenantId,
      layerId,
      schemaVersionId: schema.schemaVersionId,
      properties: normalized,
      administrativeUnitId: body.administrativeUnitId ?? null,
      createdBy: userId,
      updatedBy: userId,
      locationStatus,
      geometrySource,
    });

    const saved = await this.featuresRepository.save(feature);

    if (geometry) {
      await this.syncPointGeometry(saved.id, geometry as PointGeoJson);
    }

    return this.getRecord(tenantId, layerId, saved.id);
  }

  async createRecordFromImport(
    tenantId: string,
    layerId: string,
    userId: string,
    body: {
      properties?: Record<string, unknown>;
      geometry?: unknown;
      administrativeUnitId?: string;
    },
  ) {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    const schema = await this.metadataService.getPublishedSchema(tenantId, layerId);

    const properties = body.properties ?? {};
    const importFields = fieldsForImportValidation(schema.fields);
    const errors = validateProperties(
      importFields,
      properties,
      buildUnitHints(schema.fields),
    );
    if (errors.length > 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', details: errors });
    }

    const normalized = normalizeProperties(
      schema.fields,
      properties,
      buildUnitHints(schema.fields),
    );

    let geometry = body.geometry;
    let locationStatus = geometry ? 'located' : 'unlocated';
    let geometrySource: string | null = geometry ? 'drawn' : null;

    if (!geometry && (layer.geometryKind === 'point' || layer.geometryType === 'point')) {
      const pointFromField = resolvePointFromLatLngFields(
        schema.fields,
        normalized,
      );
      if (pointFromField) {
        geometry = pointFromField;
        locationStatus = 'located';
        geometrySource = 'geocoded';
      }
    }

    const feature = this.featuresRepository.create({
      tenantId,
      layerId,
      schemaVersionId: schema.schemaVersionId,
      properties: normalized,
      administrativeUnitId: body.administrativeUnitId ?? null,
      createdBy: userId,
      updatedBy: userId,
      locationStatus,
      geometrySource,
    });

    const saved = await this.featuresRepository.save(feature);

    if (geometry) {
      await this.syncPointGeometry(saved.id, geometry as PointGeoJson);
    }

    return this.getRecord(tenantId, layerId, saved.id);
  }

  async updateRecord(
    tenantId: string,
    layerId: string,
    recordId: string,
    userId: string,
    body: {
      properties?: Record<string, unknown>;
      geometry?: unknown | null;
      rowVersion?: number;
    },
  ) {
    const feature = await this.findFeature(tenantId, layerId, recordId);
    const schema = await this.metadataService.getPublishedSchema(tenantId, layerId);
    const layer = await this.metadataService.getLayerById(tenantId, layerId);

    if (body.rowVersion !== undefined && body.rowVersion !== feature.rowVersion) {
      throw new BadRequestException({
        code: 'VERSION_CONFLICT',
        message: 'Bản ghi đã được cập nhật bởi người khác',
      });
    }

    if (body.properties) {
      const merged = { ...feature.properties, ...body.properties };
      const errors = validateProperties(schema.fields, merged);
      if (errors.length > 0) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', details: errors });
      }
      feature.properties = normalizeProperties(schema.fields, merged);
    }

    feature.updatedBy = userId;
    feature.rowVersion += 1;

    if (body.geometry !== undefined) {
      if (body.geometry === null) {
        await this.clearGeometry(feature.id);
        feature.locationStatus = 'unlocated';
        feature.geometrySource = null;
      } else {
        await this.updateGeometry(feature.id, body.geometry, layer.geometryKind);
        feature.locationStatus = 'located';
        feature.geometrySource = 'drawn';
      }
    } else if (
      body.properties &&
      layer.geometryKind === 'point' &&
      schema.fields.some(
        (field) => field.fieldType === 'lat_lng' && field.code in body.properties!,
      )
    ) {
      const pointFromField = resolvePointFromLatLngFields(
        schema.fields,
        feature.properties,
      );
      if (pointFromField) {
        await this.syncPointGeometry(feature.id, pointFromField);
        feature.locationStatus = 'located';
        feature.geometrySource = 'geocoded';
      } else {
        await this.clearGeometry(feature.id);
        feature.locationStatus = 'unlocated';
        feature.geometrySource = null;
      }
    }

    await this.featuresRepository.save(feature);
    return this.getRecord(tenantId, layerId, recordId);
  }

  async deleteRecord(tenantId: string, layerId: string, recordId: string, userId: string) {
    const feature = await this.findFeature(tenantId, layerId, recordId);
    await this.featuresRepository.softDelete(feature.id);
    await this.dataSource.query(
      `UPDATE features SET deleted_by = $2 WHERE id = $1`,
      [feature.id, userId],
    );
    return { id: recordId, deleted: true };
  }

  async findByProperty(
    tenantId: string,
    layerId: string,
    propertyKey: string,
    propertyValue: string,
  ) {
    return this.featuresRepository
      .createQueryBuilder('f')
      .where('f.tenant_id = :tenantId', { tenantId })
      .andWhere('f.layer_id = :layerId', { layerId })
      .andWhere('f.deleted_at IS NULL')
      .andWhere(`f.properties->>:key = :value`, {
        key: propertyKey,
        value: propertyValue,
      })
      .getMany();
  }

  async createFeatureRelation(
    tenantId: string,
    relationCode: string,
    sourceFeatureId: string,
    targetFeatureId: string,
  ) {
    await this.dataSource.query(
      `
      INSERT INTO feature_relations (
        tenant_id,
        relation_definition_id,
        source_feature_id,
        target_feature_id
      )
      SELECT $1, rd.id, $3, $4
      FROM relation_definitions rd
      WHERE rd.tenant_id = $1 AND rd.code = $2
      ON CONFLICT (relation_definition_id, source_feature_id, target_feature_id) DO NOTHING
      `,
      [tenantId, relationCode, sourceFeatureId, targetFeatureId],
    );
  }

  async getGeoJson(
    tenantId: string,
    layerId: string,
    options: {
      bbox?: string;
      includeUnlocated?: boolean;
    },
  ) {
    const layer = await this.metadataService.getLayerById(tenantId, layerId);
    let schemaFields: Array<{
      code: string;
      fieldType: string;
      sortOrder?: number;
    }> = [];

    try {
      const schema = await this.metadataService.getPublishedSchema(
        tenantId,
        layerId,
      );
      schemaFields = schema.fields;
    } catch {
      schemaFields = [];
    }

    const useLatLngFallback =
      layer.geometryKind === 'point' &&
      schemaFields.some((field) => field.fieldType === 'lat_lng');

    const params: unknown[] = [tenantId, layerId];
    let spatialFilter = '';

    if (options.bbox && !useLatLngFallback) {
      const parts = options.bbox.split(',').map(Number);
      if (parts.length !== 4 || parts.some(Number.isNaN)) {
        throw new BadRequestException('bbox phải là minLng,minLat,maxLng,maxLat');
      }
      spatialFilter = `AND (
        (geometry IS NOT NULL AND ST_Intersects(geometry, ST_MakeEnvelope($3, $4, $5, $6, 4326)))
        ${options.includeUnlocated ? 'OR geometry IS NULL' : ''}
      )`;
      params.push(parts[0], parts[1], parts[2], parts[3]);
    } else if (!options.includeUnlocated && !useLatLngFallback) {
      spatialFilter = 'AND geometry IS NOT NULL';
    }

    const rows = await this.dataSource.query(
      `
      SELECT
        f.id,
        ST_AsGeoJSON(f.geometry)::json AS geometry,
        f.properties,
        f.location_status
      FROM features f
      WHERE f.tenant_id = $1
        AND f.layer_id = $2
        AND f.deleted_at IS NULL
        ${spatialFilter}
      ORDER BY f.created_at DESC
      `,
      params,
    );

    const features = await Promise.all(
      rows.map(async (row: {
        id: string;
        geometry: unknown;
        properties: Record<string, unknown>;
        location_status: string;
      }) => {
        let geometry = row.geometry;
        if (!geometry && useLatLngFallback) {
          geometry =
            resolvePointFromLatLngFields(schemaFields, row.properties) ?? null;
          if (geometry) {
            void this.syncPointGeometry(row.id, geometry as PointGeoJson);
          }
        }

        let popupSummary: Array<{
          code: string;
          label: string;
          displayValue: string;
          popupStyle?: {
            bold?: boolean;
            fontSize?: string;
            color?: string;
          };
        }> = [];
        try {
          const summary = await this.recordDisplayService.buildPopupSummary(
            tenantId,
            layerId,
            row.properties,
          );
          popupSummary = summary.fields.map((field) => ({
            code: field.code,
            label: field.label,
            displayValue: field.displayValue,
            ...(field.popupStyle ? { popupStyle: field.popupStyle } : {}),
          }));
        } catch {
          popupSummary = [];
        }

        return {
          type: 'Feature' as const,
          id: row.id,
          geometry,
          properties: {
            ...row.properties,
            location_status: row.location_status,
            _recordId: row.id,
            _layerId: layerId,
            popupSummary,
          },
        };
      }),
    );

    let result = features;

    if (!options.includeUnlocated) {
      result = result.filter((feature) => feature.geometry !== null);
    }

    if (options.bbox) {
      const parts = options.bbox.split(',').map(Number);
      const [minLng, minLat, maxLng, maxLat] = parts;
      result = result.filter((feature) => {
        if (!feature.geometry) return options.includeUnlocated === true;
        const coords = (feature.geometry as { coordinates?: number[] }).coordinates;
        if (!coords || coords.length < 2) return false;
        const [lng, lat] = coords;
        return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
      });
    }

    return {
      type: 'FeatureCollection' as const,
      features: result,
    };
  }

  async backfillLatLngGeometries(tenantId: string): Promise<number> {
    const rows = await this.dataSource.query<
      Array<{ id: string; layer_id: string; properties: Record<string, unknown> }>
    >(
      `
      SELECT f.id, f.layer_id, f.properties
      FROM features f
      INNER JOIN layers l ON l.id = f.layer_id AND l.tenant_id = f.tenant_id
      WHERE f.tenant_id = $1
        AND f.deleted_at IS NULL
        AND f.geometry IS NULL
        AND l.geometry_kind = 'point'
      `,
      [tenantId],
    );

    let synced = 0;
    for (const row of rows) {
      try {
        const schema = await this.metadataService.getPublishedSchema(
          tenantId,
          row.layer_id,
        );
        const point = resolvePointFromLatLngFields(schema.fields, row.properties);
        if (point) {
          await this.syncPointGeometry(row.id, point);
          synced += 1;
        }
      } catch {
        // layer chưa publish schema
      }
    }

    return synced;
  }

  private async findFeature(tenantId: string, layerId: string, recordId: string) {
    const feature = await this.featuresRepository.findOne({
      where: { id: recordId, tenantId, layerId },
    });
    if (!feature) {
      throw new NotFoundException('Bản ghi không tồn tại');
    }
    return feature;
  }

  private toRecordResponse(feature: FeatureEntity) {
    return {
      id: feature.id,
      layerId: feature.layerId,
      schemaVersionId: feature.schemaVersionId,
      properties: feature.properties,
      status: feature.status,
      locationStatus: feature.locationStatus,
      rowVersion: feature.rowVersion,
      createdAt: feature.createdAt,
      updatedAt: feature.updatedAt,
    };
  }

  private async loadGeometryGeoJson(featureId: string) {
    const rows = await this.dataSource.query(
      `SELECT ST_AsGeoJSON(geometry)::json AS geometry FROM features WHERE id = $1`,
      [featureId],
    );
    return rows[0]?.geometry ?? null;
  }

  private async clearGeometry(featureId: string) {
    await this.dataSource.query(
      `UPDATE features
       SET geometry = NULL,
           geometry_area_m2 = NULL,
           location_status = 'unlocated',
           geometry_source = NULL
       WHERE id = $1`,
      [featureId],
    );
  }

  private async syncPointGeometry(featureId: string, geometry: PointGeoJson) {
    await this.dataSource.query(
      `
      UPDATE features
      SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
          geometry_area_m2 = NULL,
          location_status = 'located',
          geometry_source = 'geocoded'
      WHERE id = $1
      `,
      [featureId, JSON.stringify(geometry)],
    );
  }

  private async updateGeometry(
    featureId: string,
    geometry: unknown,
    geometryKind: string,
  ) {
    await this.dataSource.query(
      `
      UPDATE features
      SET geometry = ST_SetSRID(ST_GeomFromGeoJSON($2), 4326),
          geometry_area_m2 = CASE
            WHEN ST_GeometryType(ST_GeomFromGeoJSON($2)) IN ('ST_Polygon', 'ST_MultiPolygon')
            THEN ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)::geography)
            ELSE NULL
          END,
          location_status = 'located',
          geometry_source = COALESCE(geometry_source, 'drawn')
      WHERE id = $1
      `,
      [featureId, JSON.stringify(geometry)],
    );
  }
}
