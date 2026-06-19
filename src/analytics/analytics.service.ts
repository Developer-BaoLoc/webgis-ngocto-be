import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetadataService } from '../metadata/metadata.service';
import { SavedViewsService } from '../saved-views/saved-views.service';
import {
  AnalyticsFilterDto,
  AnalyticsQueryDto,
} from './dto/analytics-query.dto';

const FIELD_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const NUMERIC_FIELD_TYPES = new Set([
  'integer',
  'money',
  'measurement',
  'quantity',
  'number',
  'decimal',
]);

type SchemaField = {
  code: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
};

type ViewFilter = {
  field?: unknown;
  fieldCode?: unknown;
  operator?: unknown;
  value?: unknown;
};

type ViewSort = {
  field?: unknown;
  direction?: unknown;
};

type ResolvedAnalyticsQuery = {
  viewId?: string;
  layerId: string;
  aggregation: AnalyticsQueryDto['aggregation'];
  fieldCode?: string;
  groupByFieldCode?: string;
  filters: AnalyticsFilterDto[];
  sorts: Array<{ field: string; direction: 'asc' | 'desc' }>;
  resultLimit: number;
};

export type AnalyticsRow = {
  label: string;
  value: number;
  rawLabel?: string;
};

export type AnalyticsQueryResult = {
  viewId?: string;
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
    private readonly savedViewsService: SavedViewsService,
  ) {}

  async query(
    tenantId: string,
    dto: AnalyticsQueryDto,
  ): Promise<AnalyticsQueryResult> {
    const query = await this.resolveQuery(tenantId, dto);
    await this.metadataService.getLayerById(tenantId, query.layerId);

    let schemaFields: SchemaField[] = [];
    try {
      const schema = await this.metadataService.getPublishedSchema(
        tenantId,
        query.layerId,
      );
      schemaFields = schema.fields;
    } catch {
      const draft = await this.metadataService.getDraftSchema(
        tenantId,
        query.layerId,
      );
      schemaFields = draft.fields;
    }

    const fieldMap = new Map(schemaFields.map((field) => [field.code, field]));

    if (query.aggregation !== 'count' && !query.fieldCode) {
      throw new BadRequestException(
        'metricField (hoặc fieldCode cũ) bắt buộc với sum/avg',
      );
    }

    if (query.fieldCode) {
      this.assertKnownField(fieldMap, query.fieldCode, ['sum', 'avg']);
    }

    if (query.groupByFieldCode) {
      this.assertKnownField(fieldMap, query.groupByFieldCode, ['groupBy']);
    }

    for (const filter of query.filters) {
      this.assertKnownField(fieldMap, filter.fieldCode, ['filter']);
    }
    for (const sort of query.sorts) {
      this.assertKnownField(fieldMap, sort.field, ['sort']);
    }

    const params: unknown[] = [tenantId, query.layerId];
    let paramIndex = 3;
    const whereParts = [
      'f.tenant_id = $1',
      'f.layer_id = $2',
      'f.deleted_at IS NULL',
    ];

    for (const filter of query.filters) {
      const field = fieldMap.get(filter.fieldCode)!;
      const operator = filter.operator ?? 'eq';
      const textExtract = this.buildTextExtract(filter.fieldCode);

      if (
        ![
          'eq',
          'neq',
          'in',
          'contains',
          'not_contains',
          'gt',
          'gte',
          'lt',
          'lte',
          'empty',
          'not_empty',
        ].includes(operator)
      ) {
        throw new BadRequestException(`Operator không hợp lệ: ${operator}`);
      }

      if (operator === 'empty') {
        whereParts.push(
          field.fieldType === 'multi_category'
            ? `(f.properties->'${filter.fieldCode}' IS NULL OR f.properties->'${filter.fieldCode}' = '[]'::jsonb)`
            : `${textExtract} IS NULL`,
        );
        continue;
      }
      if (operator === 'not_empty') {
        whereParts.push(
          field.fieldType === 'multi_category'
            ? `(f.properties->'${filter.fieldCode}' IS NOT NULL AND f.properties->'${filter.fieldCode}' <> '[]'::jsonb)`
            : `${textExtract} IS NOT NULL`,
        );
        continue;
      }
      if (field.fieldType === 'multi_category') {
        const expression = `(f.properties->'${filter.fieldCode}') ? $${paramIndex}`;
        whereParts.push(
          operator === 'neq' ? `NOT (${expression})` : expression,
        );
        params.push(this.normalizeFilterValue(field, filter.value));
        paramIndex += 1;
        continue;
      }
      if (operator === 'in') {
        if (!Array.isArray(filter.value) || filter.value.length === 0) {
          throw new BadRequestException(
            `Filter ${filter.fieldCode}: value phải là mảng không rỗng`,
          );
        }
        whereParts.push(`${textExtract} = ANY($${paramIndex}::text[])`);
        params.push(filter.value.map((item) => String(item)));
        paramIndex += 1;
        continue;
      }
      if (operator === 'contains' || operator === 'not_contains') {
        whereParts.push(
          `${textExtract} ${operator === 'not_contains' ? 'NOT ILIKE' : 'ILIKE'} $${paramIndex}`,
        );
        params.push(`%${this.normalizeFilterValue(field, filter.value)}%`);
        paramIndex += 1;
        continue;
      }
      if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
        const comparison = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[operator];
        const extract = NUMERIC_FIELD_TYPES.has(field.fieldType)
          ? this.buildNumericExtract(filter.fieldCode, field)
          : textExtract;
        whereParts.push(`${extract} ${comparison} $${paramIndex}`);
        params.push(
          NUMERIC_FIELD_TYPES.has(field.fieldType)
            ? this.normalizeNumericFilterValue(filter.fieldCode, filter.value)
            : this.normalizeFilterValue(field, filter.value),
        );
        paramIndex += 1;
        continue;
      }

      const isNumeric = NUMERIC_FIELD_TYPES.has(field.fieldType);
      const equalityExtract = isNumeric
        ? this.buildNumericExtract(filter.fieldCode, field)
        : textExtract;
      const normalizedValue = isNumeric
        ? this.normalizeNumericFilterValue(filter.fieldCode, filter.value)
        : this.normalizeFilterValue(field, filter.value);
      if (operator === 'neq') {
        whereParts.push(`${equalityExtract} IS DISTINCT FROM $${paramIndex}`);
      } else {
        whereParts.push(`${equalityExtract} = $${paramIndex}`);
      }
      params.push(normalizedValue);
      paramIndex += 1;
    }

    const sortClause = query.sorts.length
      ? `ORDER BY ${query.sorts
          .map((sort) => {
            const field = fieldMap.get(sort.field)!;
            const extract = NUMERIC_FIELD_TYPES.has(field.fieldType)
              ? this.buildNumericExtract(sort.field, field)
              : this.buildTextExtract(sort.field);
            return `${extract} ${sort.direction.toUpperCase()} NULLS LAST`;
          })
          .join(', ')}`
      : '';
    const viewFeaturesCte = `
      WITH view_features AS (
        SELECT f.*
        FROM features f
        WHERE ${whereParts.join(' AND ')}
        ${sortClause}
      )`;

    if (!query.groupByFieldCode) {
      const valueSql = this.buildAggregationSql(
        query.aggregation,
        query.fieldCode,
        query.fieldCode ? fieldMap.get(query.fieldCode) : undefined,
      );
      const rows = await this.dataSource.query<
        Array<{ value: string | number | null }>
      >(
        `${viewFeaturesCte}
         SELECT ${valueSql} AS value FROM view_features f`,
        params,
      );

      return {
        viewId: query.viewId,
        layerId: query.layerId,
        aggregation: query.aggregation,
        fieldCode: query.fieldCode,
        value: Number(rows[0]?.value ?? 0),
      };
    }

    const groupField = fieldMap.get(query.groupByFieldCode)!;
    const groupExtract = this.buildGroupLabelExtract(
      query.groupByFieldCode,
      groupField,
    );
    const valueSql = this.buildAggregationSql(
      query.aggregation,
      query.fieldCode,
      query.fieldCode ? fieldMap.get(query.fieldCode) : undefined,
    );
    const fromClause = this.buildFromClause(
      query.groupByFieldCode,
      groupField,
      'view_features',
    );

    const rows = await this.dataSource.query<
      Array<{ raw_label: string | null; value: string | number | null }>
    >(
      `
      ${viewFeaturesCte}
      SELECT
        ${groupExtract} AS raw_label,
        ${valueSql} AS value
      ${fromClause}
      GROUP BY 1
      ORDER BY value DESC NULLS LAST, raw_label ASC NULLS LAST
      LIMIT ${query.resultLimit}
      `,
      params,
    );

    const dictionaryLabels = await this.resolveDictionaryLabels(
      tenantId,
      groupField,
      rows.map((row) => row.raw_label).filter(Boolean) as string[],
    );

    return {
      viewId: query.viewId,
      layerId: query.layerId,
      aggregation: query.aggregation,
      fieldCode: query.fieldCode,
      groupByFieldCode: query.groupByFieldCode,
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
    if (!dataSourceConfig?.viewId && !dataSourceConfig?.layerId) {
      throw new BadRequestException(
        'dataSourceConfig.viewId là bắt buộc (layerId cũ vẫn được hỗ trợ)',
      );
    }

    const dto: AnalyticsQueryDto = {
      viewId: this.readConfigString(dataSourceConfig.viewId, 'viewId'),
      layerId: this.readConfigString(dataSourceConfig.layerId, 'layerId'),
      aggregation:
        (dataSourceConfig.aggregation as AnalyticsQueryDto['aggregation']) ??
        'count',
      metricField: this.readConfigString(
        dataSourceConfig.metricField,
        'metricField',
      ),
      fieldCode: this.readConfigString(dataSourceConfig.fieldCode, 'fieldCode'),
      dimensionField: this.readConfigString(
        dataSourceConfig.dimensionField,
        'dimensionField',
      ),
      groupByFieldCode: this.readConfigString(
        dataSourceConfig.groupByFieldCode,
        'groupByFieldCode',
      ),
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

  private async resolveQuery(
    tenantId: string,
    dto: AnalyticsQueryDto,
  ): Promise<ResolvedAnalyticsQuery> {
    if (!dto.viewId && !dto.layerId) {
      throw new BadRequestException('viewId hoặc layerId là bắt buộc');
    }

    let layerId = dto.layerId;
    let viewFilters: AnalyticsFilterDto[] = [];
    let viewSorts: Array<{ field: string; direction: 'asc' | 'desc' }> = [];

    if (dto.viewId) {
      const view = await this.savedViewsService.getForQuery(
        tenantId,
        dto.viewId,
      );
      if (layerId && layerId !== view.layerId) {
        throw new BadRequestException('layerId không khớp với Saved View');
      }
      layerId = view.layerId;
      const config = view.config ?? {};
      viewFilters = this.readViewFilters(config.filters);
      viewSorts = this.readViewSorts(config.sorts);
    }

    return {
      viewId: dto.viewId,
      layerId: layerId!,
      aggregation: dto.aggregation,
      fieldCode: dto.metricField ?? dto.fieldCode,
      groupByFieldCode: dto.dimensionField ?? dto.groupByFieldCode,
      filters: [
        ...viewFilters,
        ...(dto.filters ?? []),
        ...(dto.globalFilters ?? []),
      ],
      sorts: viewSorts,
      resultLimit: dto.limit ?? 50,
    };
  }

  private readViewFilters(value: unknown): AnalyticsFilterDto[] {
    if (!Array.isArray(value)) return [];
    return value.map((item: unknown) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Saved View chứa filter không hợp lệ');
      }
      const filter = item as ViewFilter;
      return {
        fieldCode:
          this.readConfigString(filter.field ?? filter.fieldCode, 'field') ??
          '',
        operator: this.readConfigString(filter.operator, 'operator') ?? 'eq',
        value: filter.value,
      };
    });
  }

  private readViewSorts(
    value: unknown,
  ): Array<{ field: string; direction: 'asc' | 'desc' }> {
    if (!Array.isArray(value)) return [];
    return value.map((item: unknown) => {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Saved View chứa sort không hợp lệ');
      }
      const sort = item as ViewSort;
      return {
        field: this.readConfigString(sort.field, 'sort.field') ?? '',
        direction: sort.direction === 'desc' ? 'desc' : 'asc',
      };
    });
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
    if (
      (context.includes('sum') || context.includes('avg')) &&
      !NUMERIC_FIELD_TYPES.has(field.fieldType)
    ) {
      throw new BadRequestException(
        `Field ${fieldCode} (${field.fieldType}) không hỗ trợ sum/avg`,
      );
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

  private buildFromClause(
    fieldCode: string,
    field: SchemaField,
    tableName = 'features',
  ): string {
    if (field.fieldType === 'multi_category') {
      this.assertFieldCode(fieldCode);
      return `
      FROM ${tableName} f
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
    return `FROM ${tableName} f`;
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
    if (aggregation === 'count') return 'COUNT(*)';
    if (!fieldCode) throw new BadRequestException('metricField là bắt buộc');
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
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && value !== null && 'code' in value) {
      return this.scalarToString(value.code, 'filter.value.code');
    }
    return this.scalarToString(value, 'filter.value');
  }

  private readConfigString(value: unknown, fieldName: string) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} phải là chuỗi`);
    }
    return value;
  }

  private scalarToString(value: unknown, fieldName: string): string {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return `${value}`;
    }
    throw new BadRequestException(`${fieldName} không hợp lệ`);
  }

  private normalizeNumericFilterValue(fieldCode: string, value: unknown) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException(
        `Filter ${fieldCode}: value phải là một số hợp lệ`,
      );
    }
    return numberValue;
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
    if (!dictionaryCode || codes.length === 0) return {};
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
