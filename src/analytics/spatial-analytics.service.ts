import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetadataService } from '../metadata/metadata.service';
import type { AnalyticsQueryResult, AnalyticsRow } from './analytics.service';

const FIELD_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const GEOMETRY_AREA_FIELD = '__geometry_area_m2';
const SPATIAL_MODES = new Set([
  'summary',
  'ranking',
  'thematic_map',
  'alert',
]);
const METRIC_AGGREGATIONS = new Set(['count', 'sum', 'avg', 'min', 'max']);

type SpatialMode = 'summary' | 'ranking' | 'thematic_map' | 'alert';
type MetricAggregation = 'count' | 'sum' | 'avg' | 'min' | 'max';

type SpatialConfig = {
  mode: SpatialMode;
  sourceLayerId: string;
  zoneLayerId: string;
  zoneLabelField?: string;
  metricAggregation: MetricAggregation;
  metricField?: string;
  limit: number;
};

type SpatialAggregateRow = {
  zone_id: string;
  zone_label: string | null;
  value: string | number | null;
  geometry?: Record<string, unknown> | null;
};

type SpatialFieldLabels = {
  zoneLabel: string;
  metricLabel: string;
};

@Injectable()
export class SpatialAnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly metadataService: MetadataService,
  ) {}

  async queryFromConfig(
    tenantId: string,
    rawConfig: Record<string, unknown>,
  ): Promise<AnalyticsQueryResult> {
    const config = this.normalizeConfig(rawConfig);
    const [sourceLayer, zoneLayer] = await Promise.all([
      this.metadataService.getLayerById(tenantId, config.sourceLayerId),
      this.metadataService.getLayerById(tenantId, config.zoneLayerId),
    ]);

    if (sourceLayer.geometryKind === 'none') {
      throw new BadRequestException('Layer nguồn chưa có hình học.');
    }
    if (!this.isPolygonLayer(zoneLayer.geometryKind)) {
      throw new BadRequestException('Layer phân vùng phải là kiểu vùng.');
    }

    const labels = await this.resolveFieldLabels(tenantId, config);

    let rows: SpatialAggregateRow[];
    try {
      rows = await this.querySpatialRows(
        tenantId,
        config,
        sourceLayer.geometryKind,
        config.mode === 'thematic_map',
      );
    } catch {
      throw new InternalServerErrorException(
        'Không thể tính phân tích không gian. Vui lòng kiểm tra geometry và cấu hình PostGIS.',
      );
    }

    if (config.mode === 'ranking') return this.toRankingResult(config, rows, labels);
    if (config.mode === 'thematic_map')
      return this.toThematicResult(config, rows, labels);
    if (config.mode === 'alert') return this.toAlertResult(config, rows, labels);
    return this.toSummaryResult(config, rows, labels);
  }

  private toSummaryResult(
    config: SpatialConfig,
    rows: SpatialAggregateRow[],
    labels: SpatialFieldLabels,
  ): AnalyticsQueryResult {
    return {
      layerId: config.sourceLayerId,
      aggregation: config.metricAggregation,
      fieldCode: config.metricField,
      groupByFieldCode: config.zoneLabelField,
      fieldLabels: {
        [config.zoneLabelField ?? 'area']: labels.zoneLabel,
        value: labels.metricLabel,
      },
      rows: rows.map((row): AnalyticsRow => {
        const label = row.zone_label ?? 'Chưa có tên khu vực';
        return { rawLabel: label, label, value: Number(row.value ?? 0) };
      }),
    };
  }

  private toRankingResult(
    config: SpatialConfig,
    rows: SpatialAggregateRow[],
    labels: SpatialFieldLabels,
  ): AnalyticsQueryResult {
    return {
      layerId: config.sourceLayerId,
      aggregation: 'top',
      fieldCode: 'value',
      fieldLabels: { area: labels.zoneLabel, value: labels.metricLabel },
      records: rows
        .filter((row) => Number(row.value ?? 0) > 0)
        .slice(0, config.limit)
        .map((row) => ({
          area: row.zone_label ?? 'Chưa có tên khu vực',
          value: Number(row.value ?? 0),
        })),
    };
  }

  private toThematicResult(
    config: SpatialConfig,
    rows: SpatialAggregateRow[],
    labels: SpatialFieldLabels,
  ): AnalyticsQueryResult {
    return {
      layerId: config.zoneLayerId,
      aggregation: 'records',
      fieldLabels: {
        area: labels.zoneLabel,
        value: labels.metricLabel,
        classLabel: 'Mức',
      },
      records: this.withQuantileClasses(rows).map((row) => ({
        area: row.zone_label ?? 'Chưa có tên khu vực',
        value: Number(row.value ?? 0),
        classKey: row.classKey,
        classLabel: row.classLabel,
        geometry: row.geometry,
      })),
    };
  }

  private toAlertResult(
    config: SpatialConfig,
    rows: SpatialAggregateRow[],
    labels: SpatialFieldLabels,
  ): AnalyticsQueryResult {
    return {
      layerId: config.sourceLayerId,
      aggregation: 'records',
      fieldLabels: {
        title: 'Cảnh báo',
        area: labels.zoneLabel,
        severity: 'Mức độ',
        value: labels.metricLabel,
      },
      records: rows
        .filter((row) => Number(row.value ?? 0) > 0)
        .slice(0, config.limit)
        .map((row) => {
          const value = Number(row.value ?? 0);
          const area = row.zone_label ?? 'Khu vực';
          return {
            title: `${area}: ${value.toLocaleString('vi-VN')} vấn đề cần xử lý`,
            area,
            severity: this.alertSeverity(value),
            value,
          };
        }),
    };
  }

  private normalizeConfig(raw: Record<string, unknown>): SpatialConfig {
    const mode = String(raw.mode ?? '');
    if (!SPATIAL_MODES.has(mode)) {
      throw new BadRequestException('spatial.mode không hợp lệ');
    }
    const metricAggregation = String(raw.metricAggregation ?? 'count');
    if (!METRIC_AGGREGATIONS.has(metricAggregation)) {
      throw new BadRequestException('spatial.metricAggregation không hợp lệ');
    }
    const metricField = this.optionalFieldCode(raw.metricField, true);
    if (metricAggregation !== 'count' && !metricField) {
      throw new BadRequestException('Chọn trường metric cho spatial widget');
    }
    return {
      mode: mode as SpatialMode,
      sourceLayerId: this.requiredString(raw.sourceLayerId, 'sourceLayerId'),
      zoneLayerId: this.requiredString(raw.zoneLayerId, 'zoneLayerId'),
      zoneLabelField: this.optionalFieldCode(raw.zoneLabelField),
      metricAggregation: metricAggregation as MetricAggregation,
      metricField,
      limit: Math.min(50, Math.max(1, Number(raw.limit ?? 10) || 10)),
    };
  }

  private async resolveFieldLabels(
    tenantId: string,
    config: SpatialConfig,
  ): Promise<SpatialFieldLabels> {
    const [sourceSchema, zoneSchema] = await Promise.all([
      this.getSchemaForAnalytics(tenantId, config.sourceLayerId),
      this.getSchemaForAnalytics(tenantId, config.zoneLayerId),
    ]);
    const sourceFields = new Map(
      sourceSchema.fields.map((field) => [field.code, field]),
    );
    const zoneFields = new Map(zoneSchema.fields.map((field) => [field.code, field]));
    if (
      config.metricField &&
      config.metricField !== GEOMETRY_AREA_FIELD &&
      !sourceFields.has(config.metricField)
    ) {
      throw new BadRequestException('Metric field không tồn tại trên layer nguồn');
    }
    if (config.zoneLabelField && !zoneFields.has(config.zoneLabelField)) {
      throw new BadRequestException('Field tên khu vực không tồn tại');
    }
    return {
      zoneLabel: config.zoneLabelField
        ? (zoneFields.get(config.zoneLabelField)?.label ?? config.zoneLabelField)
        : 'Khu vực',
      metricLabel:
        config.metricAggregation === 'count'
          ? 'Số lượng'
          : config.metricField === GEOMETRY_AREA_FIELD
            ? 'Diện tích'
            : config.metricField
              ? (sourceFields.get(config.metricField)?.label ?? config.metricField)
              : 'Giá trị',
    };
  }

  private async querySpatialRows(
    tenantId: string,
    config: SpatialConfig,
    sourceGeometryKind: string,
    includeGeometry: boolean,
  ) {
    const relationSql = this.spatialRelationSql(sourceGeometryKind);
    const valueSql = this.metricValueSql(config);
    const zoneLabelSql = config.zoneLabelField
      ? 'z.properties->>$4'
      : `COALESCE(z.properties->>'name', z.properties->>'ten', z.properties->>'ten_khu_vuc', z.id::text)`;
    const geometrySql = includeGeometry
      ? `, ST_AsGeoJSON(${this.geometrySql('z')})::json AS geometry`
      : '';
    const limit =
      config.mode === 'summary' || config.mode === 'thematic_map'
        ? 500
        : config.limit;
    return this.dataSource.query<SpatialAggregateRow[]>(
      `
      SELECT
        z.id AS zone_id,
        ${zoneLabelSql} AS zone_label,
        ${valueSql} AS value
        ${geometrySql}
      FROM features z
      LEFT JOIN features s
        ON s.tenant_id = z.tenant_id
       AND s.layer_id = $2
       AND s.deleted_at IS NULL
       AND s.geometry IS NOT NULL
       AND ${relationSql}
      WHERE z.tenant_id = $1
        AND z.layer_id = $3
        AND z.deleted_at IS NULL
        AND z.geometry IS NOT NULL
      GROUP BY z.id, z.properties, z.geometry
      ORDER BY value DESC NULLS LAST, zone_label ASC NULLS LAST
      LIMIT ${limit}
      `,
      [tenantId, config.sourceLayerId, config.zoneLayerId, config.zoneLabelField ?? null],
    );
  }

  private spatialRelationSql(sourceGeometryKind: string) {
    const sourceGeom = this.geometrySql('s');
    const zoneGeom = this.geometrySql('z');
    if (sourceGeometryKind === 'point' || sourceGeometryKind === 'multipoint') {
      return `(ST_Within(${sourceGeom}, ${zoneGeom}) OR ST_Contains(${zoneGeom}, ${sourceGeom}))`;
    }
    return `ST_Intersects(${sourceGeom}, ${zoneGeom})`;
  }

  private metricValueSql(config: SpatialConfig) {
    if (config.metricAggregation === 'count') return 'COUNT(s.id)::numeric';
    const value =
      config.metricField === GEOMETRY_AREA_FIELD
        ? `ST_Area(${this.geometrySql('s')}::geography)`
        : `NULLIF(regexp_replace(s.properties->>'${config.metricField}', '[^0-9.-]', '', 'g'), '')::numeric`;
    return `COALESCE(${config.metricAggregation.toUpperCase()}(${value}), 0)::numeric`;
  }

  private geometrySql(alias: 's' | 'z') {
    return `(CASE
      WHEN ST_SRID(${alias}.geometry) = 4326 THEN ${alias}.geometry
      WHEN ST_SRID(${alias}.geometry) > 0 THEN ST_Transform(${alias}.geometry, 4326)
      ELSE ST_SetSRID(${alias}.geometry, 4326)
    END)`;
  }

  private withQuantileClasses(rows: SpatialAggregateRow[]) {
    const sorted = rows
      .map((row) => Number(row.value ?? 0))
      .sort((left, right) => left - right);
    const labels = [
      ['very_low', 'Rất thấp'],
      ['low', 'Thấp'],
      ['medium', 'Trung bình'],
      ['high', 'Cao'],
      ['very_high', 'Rất cao'],
    ] as const;
    return rows.map((row) => {
      const value = Number(row.value ?? 0);
      const rank = sorted.findIndex((item) => item >= value);
      const bucket = Math.min(
        4,
        Math.max(0, Math.floor(((rank < 0 ? 0 : rank) / Math.max(1, sorted.length)) * 5)),
      );
      return { ...row, classKey: labels[bucket][0], classLabel: labels[bucket][1] };
    });
  }

  private alertSeverity(value: number) {
    if (value >= 20) return 'Khẩn cấp';
    if (value >= 10) return 'Cao';
    if (value >= 5) return 'Trung bình';
    return 'Thấp';
  }

  private isPolygonLayer(geometryKind: string) {
    return ['polygon', 'multipolygon'].includes(geometryKind);
  }

  private async getSchemaForAnalytics(tenantId: string, layerId: string) {
    try {
      return await this.metadataService.getPublishedSchema(tenantId, layerId);
    } catch {
      return this.metadataService.getDraftSchema(tenantId, layerId);
    }
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`spatial.${field} là bắt buộc`);
    }
    return value.trim();
  }

  private optionalFieldCode(value: unknown, allowGeometryArea = false) {
    if (value === undefined || value === null || value === '') return undefined;
    if (allowGeometryArea && value === GEOMETRY_AREA_FIELD) {
      return GEOMETRY_AREA_FIELD;
    }
    if (typeof value !== 'string' || !FIELD_CODE_PATTERN.test(value)) {
      throw new BadRequestException('Spatial field code không hợp lệ');
    }
    return value;
  }
}
