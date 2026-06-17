import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetadataService } from '../metadata/metadata.service';
import {
  AnalyticsFilterDto,
  AnalyticsQueryDto,
} from './dto/analytics-query.dto';

const FIELD_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

type SchemaField = {
  code: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
};

export type AnalyticsRow = {
  label: string;
  value: number;
  rawLabel?: string;
};

export type AnalyticsQueryResult = {
  layerId: string;
  aggregation: string;
  fieldCode?: string;
  groupByFieldCode?: string;
  value?: number;
  rows?: AnalyticsRow[];
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly metadataService: MetadataService,
  ) {}

  async query(
    tenantId: string,
    dto: AnalyticsQueryDto,
  ): Promise<AnalyticsQueryResult> {
    await this.metadataService.getLayerById(tenantId, dto.layerId);

    let schemaFields: SchemaField[] = [];
    try {
      const schema = await this.metadataService.getPublishedSchema(
        tenantId,
        dto.layerId,
      );
      schemaFields = schema.fields;
    } catch {
      const draft = await this.metadataService.getDraftSchema(
        tenantId,
        dto.layerId,
      );
      schemaFields = draft.fields;
    }

    const fieldMap = new Map(schemaFields.map((field) => [field.code, field]));

    if (dto.aggregation !== 'count' && !dto.fieldCode) {
      throw new BadRequestException('fieldCode bắt buộc với sum/avg');
    }

    if (dto.fieldCode) {
      this.assertKnownField(fieldMap, dto.fieldCode, ['sum', 'avg']);
    }

    if (dto.groupByFieldCode) {
      this.assertKnownField(fieldMap, dto.groupByFieldCode, ['groupBy']);
    }

    const filters = [...(dto.filters ?? []), ...(dto.globalFilters ?? [])];
    for (const filter of filters) {
      this.assertKnownField(fieldMap, filter.fieldCode, ['filter']);
    }

    const params: unknown[] = [tenantId, dto.layerId];
    let paramIndex = 3;

    const whereParts = [
      'f.tenant_id = $1',
      'f.layer_id = $2',
      'f.deleted_at IS NULL',
    ];

    for (const filter of filters) {
      const field = fieldMap.get(filter.fieldCode)!;
      const operator = filter.operator ?? 'eq';
      const extract = this.buildTextExtract(filter.fieldCode);

      if (operator === 'in') {
        if (!Array.isArray(filter.value) || filter.value.length === 0) {
          throw new BadRequestException(
            `Filter ${filter.fieldCode}: value phải là mảng không rỗng`,
          );
        }
        whereParts.push(`${extract} = ANY($${paramIndex}::text[])`);
        params.push(filter.value.map((item) => String(item)));
        paramIndex += 1;
        continue;
      }

      const normalizedValue = this.normalizeFilterValue(field, filter.value);
      if (operator === 'neq') {
        whereParts.push(`${extract} IS DISTINCT FROM $${paramIndex}`);
      } else {
        whereParts.push(`${extract} = $${paramIndex}`);
      }
      params.push(normalizedValue);
      paramIndex += 1;
    }

    const whereClause = whereParts.join(' AND ');

    if (!dto.groupByFieldCode) {
      const valueSql = this.buildAggregationSql(
        dto.aggregation,
        dto.fieldCode,
        dto.fieldCode ? fieldMap.get(dto.fieldCode) : undefined,
      );

      const rows = await this.dataSource.query<
        Array<{ value: string | number | null }>
      >(
        `SELECT ${valueSql} AS value FROM features f WHERE ${whereClause}`,
        params,
      );

      return {
        layerId: dto.layerId,
        aggregation: dto.aggregation,
        fieldCode: dto.fieldCode,
        value: Number(rows[0]?.value ?? 0),
      };
    }

    const groupField = fieldMap.get(dto.groupByFieldCode)!;
    const groupExtract = this.buildGroupLabelExtract(
      dto.groupByFieldCode,
      groupField,
    );
    const valueSql = this.buildAggregationSql(
      dto.aggregation,
      dto.fieldCode,
      dto.fieldCode ? fieldMap.get(dto.fieldCode) : undefined,
    );
    const limit = dto.limit ?? 50;
    const fromClause = this.buildFromClause(dto.groupByFieldCode, groupField);

    const rows = await this.dataSource.query<
      Array<{ raw_label: string | null; value: string | number | null }>
    >(
      `
      SELECT
        ${groupExtract} AS raw_label,
        ${valueSql} AS value
      ${fromClause}
      WHERE ${whereClause}
      GROUP BY 1
      ORDER BY value DESC NULLS LAST, raw_label ASC NULLS LAST
      LIMIT ${limit}
      `,
      params,
    );

    const dictionaryLabels = await this.resolveDictionaryLabels(
      tenantId,
      fieldMap.get(dto.groupByFieldCode)!,
      rows.map((row) => row.raw_label).filter(Boolean) as string[],
    );

    return {
      layerId: dto.layerId,
      aggregation: dto.aggregation,
      fieldCode: dto.fieldCode,
      groupByFieldCode: dto.groupByFieldCode,
      rows: rows.map((row) => {
        const rawLabel = row.raw_label ?? '';
        return {
          rawLabel,
          label: dictionaryLabels[rawLabel] ?? (rawLabel || '(Trống)'),
          value: Number(row.value ?? 0),
        };
      }),
    };
  }

  async queryFromWidgetConfig(
    tenantId: string,
    dataSourceConfig: Record<string, unknown> | undefined,
    globalFilters?: AnalyticsFilterDto[],
  ): Promise<AnalyticsQueryResult> {
    if (!dataSourceConfig?.layerId) {
      throw new BadRequestException('dataSourceConfig.layerId là bắt buộc');
    }

    const dto: AnalyticsQueryDto = {
      layerId: String(dataSourceConfig.layerId),
      aggregation:
        (dataSourceConfig.aggregation as AnalyticsQueryDto['aggregation']) ??
        'count',
      fieldCode: dataSourceConfig.fieldCode
        ? String(dataSourceConfig.fieldCode)
        : undefined,
      groupByFieldCode: dataSourceConfig.groupByFieldCode
        ? String(dataSourceConfig.groupByFieldCode)
        : undefined,
      filters:
        (dataSourceConfig.filters as AnalyticsFilterDto[] | undefined) ?? [],
      globalFilters,
      limit:
        typeof dataSourceConfig.limit === 'number'
          ? dataSourceConfig.limit
          : undefined,
    };

    if (!['count', 'sum', 'avg'].includes(dto.aggregation)) {
      throw new BadRequestException('aggregation không hợp lệ');
    }

    return this.query(tenantId, dto);
  }

  private assertKnownField(
    fieldMap: Map<string, SchemaField>,
    fieldCode: string,
    context: string[],
  ) {
    if (!FIELD_CODE_PATTERN.test(fieldCode)) {
      throw new BadRequestException(`fieldCode không hợp lệ: ${fieldCode}`);
    }

    const field = fieldMap.get(fieldCode);
    if (!field) {
      throw new NotFoundException(`Field không tồn tại: ${fieldCode}`);
    }

    if (context.includes('sum') || context.includes('avg')) {
      const numericTypes = [
        'integer',
        'money',
        'measurement',
        'quantity',
        'number',
        'decimal',
      ];
      if (!numericTypes.includes(field.fieldType)) {
        throw new BadRequestException(
          `Field ${fieldCode} (${field.fieldType}) không hỗ trợ sum/avg`,
        );
      }
    }
  }

  private assertFieldCode(fieldCode: string) {
    if (!FIELD_CODE_PATTERN.test(fieldCode)) {
      throw new BadRequestException(`fieldCode không hợp lệ: ${fieldCode}`);
    }
  }

  private buildTextExtract(fieldCode: string): string {
    this.assertFieldCode(fieldCode);
    return `NULLIF(TRIM(f.properties->>'${fieldCode}'), '')`;
  }

  private buildNumericExtract(fieldCode: string, field?: SchemaField): string {
    this.assertFieldCode(fieldCode);
    const jsonPath = `f.properties->'${fieldCode}'`;

    switch (field?.fieldType) {
      case 'money':
        return `COALESCE((${jsonPath}->>'sourceValue')::numeric, (${jsonPath}->>'amount')::numeric, (f.properties->>'${fieldCode}')::numeric)`;
      case 'measurement':
      case 'quantity':
        return `COALESCE((${jsonPath}->>'normalizedValue')::numeric, (${jsonPath}->>'value')::numeric, (f.properties->>'${fieldCode}')::numeric)`;
      default:
        return `(f.properties->>'${fieldCode}')::numeric`;
    }
  }

  private buildFromClause(fieldCode: string, field: SchemaField): string {
    if (field.fieldType === 'multi_category') {
      this.assertFieldCode(fieldCode);
      return `
      FROM features f
      LEFT JOIN LATERAL (
        SELECT jsonb_array_elements_text(
          CASE
            WHEN jsonb_typeof(f.properties->'${fieldCode}') = 'array'
            THEN f.properties->'${fieldCode}'
            ELSE '[]'::jsonb
          END
        ) AS elem
      ) expanded ON TRUE`;
    }

    return 'FROM features f';
  }

  private buildGroupLabelExtract(
    fieldCode: string,
    field: SchemaField,
  ): string {
    this.assertFieldCode(fieldCode);

    if (field.fieldType === 'multi_category') {
      return `COALESCE(NULLIF(TRIM(expanded.elem), ''), '(Trống)')`;
    }

    return `COALESCE(${this.buildTextExtract(fieldCode)}, '(Trống)')`;
  }

  private buildAggregationSql(
    aggregation: string,
    fieldCode: string | undefined,
    field?: SchemaField,
  ): string {
    if (aggregation === 'count') {
      return 'COUNT(*)';
    }

    if (!fieldCode) {
      throw new BadRequestException('fieldCode bắt buộc');
    }

    const numericExpr = this.buildNumericExtract(fieldCode, field);
    if (aggregation === 'sum') {
      return `COALESCE(SUM(${numericExpr}), 0)`;
    }
    if (aggregation === 'avg') {
      return `COALESCE(AVG(${numericExpr}), 0)`;
    }

    throw new BadRequestException('aggregation không hợp lệ');
  }

  private normalizeFilterValue(field: SchemaField, value: unknown): string {
    if (field.fieldType === 'multi_category') {
      throw new BadRequestException(
        'Filter multi_category chưa hỗ trợ trong MVP',
      );
    }

    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'object' && value !== null && 'code' in value) {
      return String(value.code);
    }

    return String(value);
  }

  private async resolveDictionaryLabels(
    tenantId: string,
    field: SchemaField,
    codes: string[],
  ): Promise<Record<string, string>> {
    if (
      field.fieldType !== 'category' &&
      field.fieldType !== 'multi_category'
    ) {
      return {};
    }

    const dictionaryCode = field.dataSchema.dictionary;
    if (!dictionaryCode || codes.length === 0) {
      return {};
    }

    try {
      const items = await this.dataSource.query<
        Array<{ code: string; label: string }>
      >(
        `
        SELECT di.code, di.label
        FROM dictionary_items di
        JOIN dictionaries d ON d.id = di.dictionary_id
        WHERE d.tenant_id = $1 AND d.code = $2 AND di.code = ANY($3::text[])
        `,
        [tenantId, dictionaryCode, codes],
      );

      return Object.fromEntries(items.map((item) => [item.code, item.label]));
    } catch {
      return {};
    }
  }
}
