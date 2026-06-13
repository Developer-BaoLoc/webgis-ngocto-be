import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FeatureEntity } from '../database/entities/feature.entity';
import { MetadataService } from '../metadata/metadata.service';
import {
  normalizeProperties,
  validateProperties,
} from './field-types/field-type.registry';

export type RecordListQuery = {
  page?: number;
  pageSize?: number;
};

@Injectable()
export class RecordsService {
  constructor(
    @InjectRepository(FeatureEntity)
    private readonly featuresRepository: Repository<FeatureEntity>,
    private readonly metadataService: MetadataService,
    private readonly dataSource: DataSource,
  ) {}

  async listRecords(
    tenantId: string,
    layerId: string,
    query: RecordListQuery,
  ) {
    await this.metadataService.getLayerById(tenantId, layerId);

    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 200);
    const skip = (page - 1) * pageSize;

    const [items, total] = await this.featuresRepository.findAndCount({
      where: { tenantId, layerId },
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
    });

    return {
      items: items.map((f) => this.toRecordResponse(f)),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getRecord(tenantId: string, layerId: string, recordId: string) {
    const feature = await this.findFeature(tenantId, layerId, recordId);
    const geometry = await this.loadGeometryGeoJson(feature.id);
    return { ...this.toRecordResponse(feature), geometry };
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

    const feature = this.featuresRepository.create({
      tenantId,
      layerId,
      schemaVersionId: schema.schemaVersionId,
      properties: normalized,
      administrativeUnitId: body.administrativeUnitId ?? null,
      createdBy: userId,
      updatedBy: userId,
      locationStatus: body.geometry ? 'located' : 'unlocated',
      geometrySource: body.geometry ? 'drawn' : null,
    });

    const saved = await this.featuresRepository.save(feature);

    if (body.geometry) {
      await this.updateGeometry(saved.id, body.geometry, layer.geometryKind);
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
        await this.dataSource.query(
          `UPDATE features SET geometry = NULL, location_status = 'unlocated', geometry_source = NULL WHERE id = $1`,
          [feature.id],
        );
        feature.locationStatus = 'unlocated';
        feature.geometrySource = null;
      } else {
        const layer = await this.metadataService.getLayerById(tenantId, layerId);
        await this.updateGeometry(feature.id, body.geometry, layer.geometryKind);
        feature.locationStatus = 'located';
        feature.geometrySource = 'drawn';
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
    await this.metadataService.getLayerById(tenantId, layerId);
    const params: unknown[] = [tenantId, layerId];
    let spatialFilter = '';

    if (options.bbox) {
      const parts = options.bbox.split(',').map(Number);
      if (parts.length !== 4 || parts.some(Number.isNaN)) {
        throw new BadRequestException('bbox phải là minLng,minLat,maxLng,maxLat');
      }
      spatialFilter = `AND (
        (geometry IS NOT NULL AND ST_Intersects(geometry, ST_MakeEnvelope($3, $4, $5, $6, 4326)))
        ${options.includeUnlocated ? 'OR geometry IS NULL' : ''}
      )`;
      params.push(parts[0], parts[1], parts[2], parts[3]);
    } else if (!options.includeUnlocated) {
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

    return {
      type: 'FeatureCollection' as const,
      features: rows.map(
        (row: {
          id: string;
          geometry: unknown;
          properties: Record<string, unknown>;
          location_status: string;
        }) => ({
          type: 'Feature' as const,
          id: row.id,
          geometry: row.geometry,
          properties: {
            ...row.properties,
            location_status: row.location_status,
          },
        }),
      ),
    };
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
          END
      WHERE id = $1
      `,
      [featureId, JSON.stringify(geometry)],
    );
  }
}
