import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetadataService } from '../metadata/metadata.service';
import { SavedViewsService } from '../saved-views/saved-views.service';
import { DatasetsService } from '../datasets/datasets.service';
import {
  AnalyticsFilterDto,
  AnalyticsFormulaDto,
  AnalyticsHavingFilterDto,
  AnalyticsQueryDto,
  AnalyticsTimeDto,
} from './dto/analytics-query.dto';
import { SpatialAnalyticsService } from './spatial-analytics.service';

const FIELD_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const NUMERIC_FIELD_TYPES = new Set([
  'integer',
  'money',
  'measurement',
  'quantity',
  'number',
  'decimal',
]);
const DATASET_NUMERIC_FIELD_TYPES = new Set([
  'number',
  'integer',
  'decimal',
  'currency',
]);
const DATASET_GROUPABLE_FIELD_TYPES = new Set([
  'text',
  'date',
  'boolean',
  'select',
]);
const FORMULA_FIELD_CODE = '__formula';

type SchemaField = {
  code: string;
  label?: string;
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

type TimeRange = { from: string; to: string };

type ResolvedAnalyticsQuery = {
  viewId?: string;
  layerId: string;
  aggregation: AnalyticsQueryDto['aggregation'];
  fieldCode?: string;
  groupByFieldCode?: string;
  filters: AnalyticsFilterDto[];
  having: AnalyticsHavingFilterDto[];
  time?: AnalyticsTimeDto;
  sorts: Array<{ field: string; direction: 'asc' | 'desc' }>;
  resultLimit: number;
};

export type AnalyticsRow = {
  label: string;
  value: number;
  rawLabel?: string;
};

export type AnalyticsQueryResult = {
  datasetId?: string;
  viewId?: string;
  layerId?: string;
  aggregation: string;
  fieldCode?: string;
  groupByFieldCode?: string;
  value?: number;
  rows?: AnalyticsRow[];
  records?: Array<Record<string, unknown>>;
  fieldLabels?: Record<string, string>;
  comparison?: {
    currentValue?: number;
    previousValue?: number;
    delta?: number;
    deltaPercent?: number | null;
    label: string;
    currentRange?: { from: string; to: string };
    previousRange?: { from: string; to: string };
  };
};

class FormulaEvaluator {
  private readonly tokens: string[];
  private index = 0;

  constructor(
    expression: string,
    private readonly readField: (field: string) => number | null,
  ) {
    this.tokens =
      expression.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[+\-*/()]/g) ??
      [];
  }

  evaluate() {
    const value = this.parseExpression();
    if (this.index !== this.tokens.length) {
      throw new BadRequestException('Formula không hợp lệ');
    }
    return value;
  }

  private parseExpression(): number | null {
    let value = this.parseTerm();
    while (this.peek() === '+' || this.peek() === '-') {
      const operator = this.next();
      const right = this.parseTerm();
      value =
        value === null || right === null
          ? null
          : operator === '+'
            ? value + right
            : value - right;
    }
    return value;
  }

  private parseTerm(): number | null {
    let value = this.parseFactor();
    while (this.peek() === '*' || this.peek() === '/') {
      const operator = this.next();
      const right = this.parseFactor();
      if (value === null || right === null || (operator === '/' && right === 0)) {
        value = null;
      } else {
        value = operator === '*' ? value * right : value / right;
      }
    }
    return value;
  }

  private parseFactor(): number | null {
    const token = this.next();
    if (!token) throw new BadRequestException('Formula không hợp lệ');
    if (token === '-') {
      const value = this.parseFactor();
      return value === null ? null : -value;
    }
    if (token === '(') {
      const value = this.parseExpression();
      if (this.next() !== ')') {
        throw new BadRequestException('Formula thiếu dấu ngoặc đóng');
      }
      return value;
    }
    if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) return this.readField(token);
    throw new BadRequestException('Formula không hợp lệ');
  }

  private peek() {
    return this.tokens[this.index];
  }

  private next() {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly metadataService: MetadataService,
    private readonly savedViewsService: SavedViewsService,
    private readonly datasetsService: DatasetsService,
    private readonly spatialAnalyticsService: SpatialAnalyticsService,
  ) {}

  async query(
    tenantId: string,
    dto: AnalyticsQueryDto,
  ): Promise<AnalyticsQueryResult> {
    if (dto.spatial && typeof dto.spatial === 'object') {
      return this.spatialAnalyticsService.queryFromConfig(tenantId, dto.spatial);
    }
    dto.time = this.normalizeTimeInput(dto.time);
    if (dto.datasetId && (dto.viewId || dto.layerId)) {
      throw new BadRequestException(
        'datasetId không được dùng cùng viewId hoặc layerId',
      );
    }
    if (dto.formula?.enabled && !dto.datasetId) {
      throw new BadRequestException(
        'Formula hiện chỉ hỗ trợ truy vấn Dataset',
      );
    }
    if (this.shouldCompareScalar(dto)) {
      return this.queryScalarComparison(tenantId, dto);
    }
    if (dto.datasetId) {
      return this.queryDataset(tenantId, dto);
    }
    if (dto.aggregation === 'top') {
      throw new BadRequestException('Top N hiện chỉ hỗ trợ nguồn Dataset');
    }
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
    const fieldLabels = Object.fromEntries(
      schemaFields.map((field) => [field.code, field.label ?? field.code]),
    );

    if (!['count', 'records'].includes(query.aggregation) && !query.fieldCode) {
      throw new BadRequestException(
        'metricField (hoặc fieldCode cũ) bắt buộc với sum/avg/min/max',
      );
    }

    if (query.fieldCode) {
      this.assertKnownField(fieldMap, query.fieldCode, [query.aggregation]);
    }

    if (query.groupByFieldCode) {
      this.assertKnownField(fieldMap, query.groupByFieldCode, ['groupBy']);
    }

    for (const filter of query.filters) {
      this.assertKnownField(fieldMap, filter.fieldCode, ['filter']);
    }
    for (const filter of query.having) {
      this.assertKnownField(fieldMap, filter.field, [filter.aggregation]);
    }
    if (query.time?.enabled) {
      this.assertKnownField(fieldMap, query.time.dateField, ['filter']);
    }
    for (const sort of query.sorts) {
      this.assertKnownField(fieldMap, sort.field, ['sort']);
    }
    const displayFields = dto.displayFields?.length
      ? dto.displayFields
      : schemaFields.map((field) => field.code);
    if (query.aggregation === 'records') {
      for (const field of displayFields) {
        this.assertKnownField(fieldMap, field, ['display']);
      }
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

    if (query.time?.enabled) {
      const range = this.resolveTimeRange(
        query.time.preset,
        query.time.customFrom,
        query.time.customTo,
      );
      const dateExtract = this.buildDateExtract(query.time.dateField);
      whereParts.push(
        `${dateExtract} >= $${paramIndex}::date`,
        `${dateExtract} <= $${paramIndex + 1}::date`,
      );
      params.push(range.from, range.to);
      paramIndex += 2;
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

    if (query.aggregation === 'records') {
      const rows = await this.dataSource.query<
        Array<{ record: Record<string, unknown> }>
      >(
        `${viewFeaturesCte}
         SELECT f.properties AS record
         FROM view_features f
         ${sortClause}
         LIMIT ${query.resultLimit}`,
        params,
      );
      return {
        viewId: query.viewId,
        layerId: query.layerId,
        aggregation: 'records',
        fieldLabels,
        records: rows.map(({ record }) =>
          Object.fromEntries(
            displayFields.map((field) => [field, record?.[field]]),
          ),
        ),
      };
    }

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
        fieldLabels,
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
    const havingClause = this.buildSqlHavingClause(
      query.having,
      valueSql,
      query,
      params,
      paramIndex,
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
      ${havingClause.sql}
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
      fieldLabels,
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
    if (dataSourceConfig?.spatial && typeof dataSourceConfig.spatial === 'object') {
      return this.spatialAnalyticsService.queryFromConfig(
        tenantId,
        dataSourceConfig.spatial as Record<string, unknown>,
      );
    }

    if (
      !dataSourceConfig?.datasetId &&
      !dataSourceConfig?.viewId &&
      !dataSourceConfig?.layerId
    ) {
      throw new BadRequestException(
        'dataSourceConfig.viewId là bắt buộc (layerId cũ vẫn được hỗ trợ)',
      );
    }

    const dto: AnalyticsQueryDto = {
      datasetId: this.readConfigString(dataSourceConfig.datasetId, 'datasetId'),
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
      having: this.readHavingFiltersFromConfig(dataSourceConfig),
      formula: this.readFormulaFromConfig(dataSourceConfig),
      time: this.readTimeFromConfig(dataSourceConfig),
      globalFilters,
      limit:
        typeof dataSourceConfig.limit === 'number'
          ? dataSourceConfig.limit
          : undefined,
      displayFields: Array.isArray(dataSourceConfig.displayFields)
        ? dataSourceConfig.displayFields.filter(
            (field): field is string => typeof field === 'string',
          )
        : undefined,
      sort:
        dataSourceConfig.sort && typeof dataSourceConfig.sort === 'object'
          ? (dataSourceConfig.sort as AnalyticsQueryDto['sort'])
          : undefined,
    };

    if (
      !['count', 'sum', 'avg', 'min', 'max', 'top', 'records'].includes(
        dto.aggregation,
      )
    ) {
      throw new BadRequestException('aggregation không hợp lệ');
    }

    return this.query(tenantId, dto);
  }

  private shouldCompareScalar(dto: AnalyticsQueryDto) {
    return (
      dto.time?.enabled === true &&
      dto.time.compare !== undefined &&
      dto.time.compare !== 'none' &&
      dto.aggregation !== 'records' &&
      dto.aggregation !== 'top' &&
      !dto.dimensionField &&
      !dto.groupByFieldCode
    );
  }

  private async queryScalarComparison(
    tenantId: string,
    dto: AnalyticsQueryDto,
  ): Promise<AnalyticsQueryResult> {
    const currentRange = this.resolveTimeRange(
      dto.time!.preset,
      dto.time!.customFrom,
      dto.time!.customTo,
    );
    const previousRange = this.resolvePreviousTimeRange(
      currentRange,
      dto.time!.compare!,
    );
    const currentDto: AnalyticsQueryDto = {
      ...dto,
      time: { ...dto.time!, compare: 'none' },
    };
    const previousDto: AnalyticsQueryDto = {
      ...dto,
      time: {
        ...dto.time!,
        preset: 'custom',
        customFrom: previousRange.from,
        customTo: previousRange.to,
        compare: 'none',
      },
    };
    const [current, previous] = await Promise.all([
      this.query(tenantId, currentDto),
      this.query(tenantId, previousDto),
    ]);
    const currentValue = Number(current.value ?? 0);
    const previousValue = Number(previous.value ?? 0);
    const delta = currentValue - previousValue;
    const deltaPercent =
      previousValue === 0 ? null : (delta / Math.abs(previousValue)) * 100;
    return {
      ...current,
      comparison: {
        currentValue,
        previousValue,
        delta,
        deltaPercent,
        label:
          dto.time!.compare === 'same_period_last_year'
            ? 'So với cùng kỳ năm trước'
            : 'So với kỳ trước',
        currentRange,
        previousRange,
      },
    };
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
      sorts: [
        ...(dto.sort ? [dto.sort] : []),
        ...viewSorts.filter((sort) => sort.field !== dto.sort?.field),
      ],
      having: dto.having ?? [],
      time: dto.time?.enabled ? dto.time : undefined,
      resultLimit: Math.min(500, Math.max(1, dto.limit ?? 50)),
    };
  }

  private async queryDataset(
    tenantId: string,
    dto: AnalyticsQueryDto,
  ): Promise<AnalyticsQueryResult> {
    const resolved = await this.datasetsService.resolveDataset(
      tenantId,
      dto.datasetId!,
    );
    const fieldMap = new Map(
      resolved.fields.map((field) => [field.key, field]),
    );
    const fieldLabels = Object.fromEntries(
      resolved.fields.map((field) => [field.key, field.label]),
    );
    const formula = dto.formula?.enabled ? dto.formula : undefined;
    if (formula) {
      this.assertDatasetFormula(formula, fieldMap);
      fieldLabels[FORMULA_FIELD_CODE] = formula.label;
    }
    const metricField = formula ? FORMULA_FIELD_CODE : dto.metricField ?? dto.fieldCode;
    const dimensionField = dto.dimensionField ?? dto.groupByFieldCode;
    const isFormulaField = (field: string | undefined) =>
      Boolean(formula && field === FORMULA_FIELD_CODE);
    const hasDatasetField = (field: string | undefined) =>
      Boolean(field && (fieldMap.has(field) || isFormulaField(field)));
    if (metricField && !hasDatasetField(metricField)) {
      throw new NotFoundException(
        `Dataset field không tồn tại: ${metricField}`,
      );
    }
    if (dimensionField && !fieldMap.has(dimensionField)) {
      throw new NotFoundException(
        `Dataset field không tồn tại: ${dimensionField}`,
      );
    }
    if (dto.time?.enabled && !fieldMap.has(dto.time.dateField)) {
      throw new NotFoundException(
        `Dataset field không tồn tại: ${dto.time.dateField}`,
      );
    }
    const datasetFilters = [...(dto.filters ?? []), ...(dto.globalFilters ?? [])];
    const filteredRows = this.filterDatasetRows(
      resolved.rows,
      datasetFilters,
      fieldMap,
    );
    const timeFilteredRows = dto.time?.enabled
      ? this.filterDatasetRowsByTime(filteredRows, dto.time)
      : filteredRows;
    if (dto.aggregation === 'records') {
      const displayFields = dto.displayFields?.length
        ? dto.displayFields
        : resolved.fields.map((field) => field.key);
      for (const field of displayFields) {
        if (!hasDatasetField(field)) {
          throw new NotFoundException(`Dataset field không tồn tại: ${field}`);
        }
      }
      const sortField = dto.sort?.field;
      if (sortField && !hasDatasetField(sortField)) {
        throw new NotFoundException(
          `Dataset field không tồn tại: ${sortField}`,
        );
      }
      const formulaRows = formula
        ? this.applyDatasetFormula(timeFilteredRows, formula, fieldMap)
        : timeFilteredRows;
      const sourceRows = sortField
        ? [...formulaRows].sort((a, b) =>
            this.compareDatasetValues(
              a[sortField],
              b[sortField],
              dto.sort?.direction === 'desc' ? 'desc' : 'asc',
            ),
          )
        : formulaRows;
      return {
        datasetId: dto.datasetId,
        aggregation: 'records',
        fieldLabels,
        records: sourceRows
          .slice(0, dto.limit ?? 50)
          .map((row) =>
            Object.fromEntries(
              displayFields.map((field) => [field, row[field]]),
            ),
          ),
      };
    }
    if (dto.aggregation !== 'count' && !metricField) {
      throw new BadRequestException('metricField là bắt buộc với Dataset');
    }
    if (
      metricField &&
      dto.aggregation !== 'count' &&
      !isFormulaField(metricField) &&
      !DATASET_NUMERIC_FIELD_TYPES.has(fieldMap.get(metricField)!.type)
    ) {
      throw new BadRequestException(
        `Dataset field ${metricField} phải là number/integer/decimal/currency`,
      );
    }
    if (
      dimensionField &&
      !DATASET_GROUPABLE_FIELD_TYPES.has(fieldMap.get(dimensionField)!.type)
    ) {
      throw new BadRequestException(
        `Dataset field ${dimensionField} không hỗ trợ group by`,
      );
    }

    if (dto.aggregation === 'top') {
      const sortField = dto.sort?.field ?? metricField!;
      if (!hasDatasetField(sortField)) {
        throw new NotFoundException(
          `Dataset field không tồn tại: ${sortField}`,
        );
      }
      const direction = dto.sort?.direction === 'asc' ? 'asc' : 'desc';
      const displayFields = dto.displayFields?.length
        ? dto.displayFields
        : resolved.fields.map((field) => field.key);
      for (const field of displayFields) {
        if (!hasDatasetField(field)) {
          throw new NotFoundException(`Dataset field không tồn tại: ${field}`);
        }
      }
      const formulaRows = formula
        ? this.applyDatasetFormula(timeFilteredRows, formula, fieldMap)
        : timeFilteredRows;
      const records = [...formulaRows]
        .sort((a, b) =>
          this.compareDatasetValues(a[sortField], b[sortField], direction),
        )
        .slice(0, dto.limit ?? 10)
        .map((row) =>
          Object.fromEntries(displayFields.map((field) => [field, row[field]])),
        );
      return {
        datasetId: dto.datasetId,
        aggregation: 'top',
        fieldLabels,
        fieldCode: metricField,
        records,
      };
    }

    if (dimensionField) {
      const groupSortField = dto.sort?.field;
      if (
        groupSortField &&
        !['value', metricField, dimensionField].includes(groupSortField)
      ) {
        throw new BadRequestException(
          `Dataset sort field không hợp lệ khi group by: ${groupSortField}`,
        );
      }
      const groups = new Map<string, Array<number | null>>();
      const formulaRows = formula
        ? this.applyDatasetFormula(timeFilteredRows, formula, fieldMap)
        : timeFilteredRows;
      for (const row of formulaRows) {
        const label = this.datasetText(row[dimensionField], '(Trống)');
        const values = groups.get(label) ?? [];
        values.push(
          dto.aggregation === 'count'
            ? 1
            : this.datasetNumber(row[metricField!]),
        );
        groups.set(label, values);
      }
      const aggregatedRows = [...groups.entries()].map(([label, values]) => ({
        label,
        rawLabel: label,
        value: this.aggregateDatasetValues(values, dto.aggregation),
      }));
      const rows = this.applyDatasetHavingFilters(aggregatedRows, dto.having ?? [], {
        aggregation: dto.aggregation,
        fieldCode: metricField,
      })
        .sort((a, b) => {
          const direction = dto.sort?.direction === 'asc' ? 1 : -1;
          if (groupSortField === dimensionField) {
            return direction * a.label.localeCompare(b.label);
          }
          return (
            direction * (a.value - b.value) || a.label.localeCompare(b.label)
          );
        })
        .slice(0, dto.limit ?? 50);
      return {
        datasetId: dto.datasetId,
        aggregation: dto.aggregation,
        fieldCode: metricField,
        groupByFieldCode: dimensionField,
        fieldLabels,
        rows,
      };
    }

    const formulaRows = formula
      ? this.applyDatasetFormula(timeFilteredRows, formula, fieldMap)
      : timeFilteredRows;
    const values = formulaRows.map((row) =>
      dto.aggregation === 'count' ? 1 : this.datasetNumber(row[metricField!]),
    );
    return {
      datasetId: dto.datasetId,
      aggregation: dto.aggregation,
      fieldCode: metricField,
      fieldLabels,
      value: this.aggregateDatasetValues(values, dto.aggregation),
    };
  }

  private applyDatasetHavingFilters(
    rows: AnalyticsRow[],
    filters: AnalyticsHavingFilterDto[],
    query: Pick<ResolvedAnalyticsQuery, 'aggregation' | 'fieldCode'>,
  ) {
    if (filters.length === 0) return rows;
    return rows.filter((row) =>
      filters.every((filter) => {
        this.assertCompatibleHavingFilter(filter, query);
        const comparison = this.havingComparisonOperator(filter.operator);
        const value = this.normalizeHavingValue(filter);
        if (comparison === '>') return row.value > value;
        if (comparison === '>=') return row.value >= value;
        if (comparison === '<') return row.value < value;
        if (comparison === '<=') return row.value <= value;
        if (comparison === '=') return row.value === value;
        if (comparison === '<>') return row.value !== value;
        return false;
      }),
    );
  }

  private assertDatasetFormula(
    formula: AnalyticsFormulaDto,
    fieldMap: Map<string, { key: string; type: string }>,
  ) {
    const fields = this.extractFormulaFields(formula.expression);
    if (fields.length === 0) {
      throw new BadRequestException('Formula cần ít nhất một field số');
    }
    for (const field of fields) {
      const datasetField = fieldMap.get(field);
      if (!datasetField) {
        throw new BadRequestException(`Formula field không tồn tại: ${field}`);
      }
      if (!DATASET_NUMERIC_FIELD_TYPES.has(datasetField.type)) {
        throw new BadRequestException(`Formula field không phải số: ${field}`);
      }
    }
  }

  private applyDatasetFormula(
    rows: Array<Record<string, unknown>>,
    formula: AnalyticsFormulaDto,
    fieldMap: Map<string, { key: string; type: string }>,
  ) {
    const fields = new Set(this.extractFormulaFields(formula.expression));
    for (const field of fields) {
      if (!fieldMap.has(field)) {
        throw new BadRequestException(`Formula field không tồn tại: ${field}`);
      }
    }
    return rows.map((row) => ({
      ...row,
      [FORMULA_FIELD_CODE]: this.evaluateFormulaExpression(
        formula.expression,
        row,
        fields,
      ),
    }));
  }

  private evaluateFormulaExpression(
    expression: string,
    row: Record<string, unknown>,
    fields: Set<string>,
  ) {
    try {
      const evaluator = new FormulaEvaluator(expression, (field) => {
        if (!fields.has(field)) {
          throw new BadRequestException(`Formula field không hợp lệ: ${field}`);
        }
        return this.datasetNumber(row[field]);
      });
      const value = evaluator.evaluate();
      return Number.isFinite(value) ? value : null;
    } catch {
      return null;
    }
  }

  private extractFormulaFields(expression: string) {
    const tokens = expression.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[+\-*/()]/g) ?? [];
    const compactTokens = tokens.join('');
    const compactExpression = expression.replace(/\s+/g, '');
    if (compactTokens !== compactExpression) {
      throw new BadRequestException(
        'Formula chỉ hỗ trợ field key, số, toán tử + - * / và ngoặc',
      );
    }
    return Array.from(
      new Set(
        tokens.filter((token) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(token)),
      ),
    );
  }

  private filterDatasetRows(
    rows: Array<Record<string, unknown>>,
    filters: AnalyticsFilterDto[],
    fieldMap: Map<string, { key: string; type: string }>,
  ) {
    if (filters.length === 0) return rows;
    for (const filter of filters) {
      if (!filter.fieldCode || !FIELD_CODE_PATTERN.test(filter.fieldCode)) {
        throw new BadRequestException(
          `Dataset filter fieldCode không hợp lệ: ${filter.fieldCode}`,
        );
      }
      if (!fieldMap.has(filter.fieldCode)) {
        throw new NotFoundException(
          `Dataset field không tồn tại: ${filter.fieldCode}`,
        );
      }
    }
    return rows.filter((row) =>
      filters.every((filter) =>
        this.matchesDatasetFilter(row, filter, fieldMap),
      ),
    );
  }

  private matchesDatasetFilter(
    row: Record<string, unknown>,
    filter: AnalyticsFilterDto,
    fieldMap: Map<string, { key: string; type: string }>,
  ) {
    const field = fieldMap.get(filter.fieldCode)!;
    const operator = filter.operator ?? 'eq';
    const value = row[filter.fieldCode];

    if (operator === 'empty') return this.isDatasetEmptyValue(value);
    if (operator === 'not_empty') return !this.isDatasetEmptyValue(value);

    if (filter.value === undefined || filter.value === null) {
      throw new BadRequestException(
        `Dataset filter ${filter.fieldCode}: value là bắt buộc`,
      );
    }

    if (operator === 'in') {
      const candidates = Array.isArray(filter.value)
        ? filter.value
        : [filter.value];
      if (candidates.length === 0) {
        throw new BadRequestException(
          `Dataset filter ${filter.fieldCode}: value phải có ít nhất một giá trị`,
        );
      }
      const normalizedValue = this.datasetFilterText(value);
      return candidates.some(
        (candidate) => this.datasetFilterText(candidate) === normalizedValue,
      );
    }

    if (operator === 'contains' || operator === 'not_contains') {
      const haystack = this.datasetFilterText(value);
      const needle = this.datasetFilterText(filter.value);
      const matched = needle !== '' && haystack.includes(needle);
      return operator === 'contains' ? matched : !matched;
    }

    if (['gt', 'gte', 'lt', 'lte'].includes(operator)) {
      return this.compareDatasetFilterValue(
        value,
        filter.value,
        field.type,
        operator,
      );
    }

    if (operator === 'eq' || operator === 'neq') {
      const matched =
        DATASET_NUMERIC_FIELD_TYPES.has(field.type)
          ? this.datasetNumber(value) === this.datasetNumber(filter.value)
          : field.type === 'date'
            ? this.datasetDateKey(value) === this.datasetDateKey(filter.value)
            : this.datasetFilterText(value) ===
              this.datasetFilterText(filter.value);
      return operator === 'eq' ? matched : !matched;
    }

    throw new BadRequestException(`Filter operator không hỗ trợ: ${operator}`);
  }

  private compareDatasetFilterValue(
    left: unknown,
    right: unknown,
    fieldType: string,
    operator: string,
  ) {
    const leftValue =
      fieldType === 'date'
        ? this.datasetDateTime(left)
        : this.datasetNumber(left);
    const rightValue =
      fieldType === 'date'
        ? this.datasetDateTime(right)
        : this.datasetNumber(right);
    if (leftValue === null || rightValue === null) return false;
    if (operator === 'gt') return leftValue > rightValue;
    if (operator === 'gte') return leftValue >= rightValue;
    if (operator === 'lt') return leftValue < rightValue;
    if (operator === 'lte') return leftValue <= rightValue;
    return false;
  }

  private isDatasetEmptyValue(value: unknown) {
    return (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private datasetFilterText(value: unknown) {
    const scalar = this.unwrapDatasetFilterScalar(value);
    return String(scalar ?? '').trim().toLowerCase();
  }

  private unwrapDatasetFilterScalar(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }
    const record = value as Record<string, unknown>;
    return (
      record.code ??
      record.value ??
      record.key ??
      record.id ??
      record.label ??
      JSON.stringify(value)
    );
  }

  private datasetDateKey(value: unknown) {
    const time = this.datasetDateTime(value);
    if (time === null) return '';
    return new Date(time).toISOString().slice(0, 10);
  }

  private datasetDateTime(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = this.parseDateValue(value);
    if (!parsed) return null;
    const time = parsed.getTime();
    return Number.isFinite(time) ? time : null;
  }

  private parseDateValue(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    }
    const text = String(value).trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) {
      const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return Number.isFinite(date.getTime()) ? date : null;
    }
    const vn = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (vn) {
      const date = new Date(Number(vn[3]), Number(vn[2]) - 1, Number(vn[1]));
      return Number.isFinite(date.getTime()) ? date : null;
    }
    const parsed = new Date(text);
    const time = parsed.getTime();
    return Number.isFinite(time) ? parsed : null;
  }

  private filterDatasetRowsByTime(
    rows: Array<Record<string, unknown>>,
    time: AnalyticsTimeDto,
  ) {
    const range = this.resolveTimeRange(
      time.preset,
      time.customFrom,
      time.customTo,
    );
    const from = this.parseDateValue(range.from);
    const to = this.parseDateValue(range.to);
    if (!from || !to) return rows;
    const fromTime = this.startOfDay(from).getTime();
    const toTime = this.endOfDay(to).getTime();
    return rows.filter((row) => {
      return this.isDateInRange(row[time.dateField], { fromTime, toTime });
    });
  }

  private isDateInRange(
    value: unknown,
    range: { fromTime: number; toTime: number },
  ) {
    const date = this.parseDateValue(value);
    if (!date) return false;
    const time = date.getTime();
    return time >= range.fromTime && time <= range.toTime;
  }

  private resolveTimeRange(
    preset: AnalyticsTimeDto['preset'],
    customFrom?: string,
    customTo?: string,
    now = new Date(),
  ): TimeRange {
    // TODO: move to a shared Asia/Ho_Chi_Minh timezone helper if the project adds one.
    const today = this.startOfDay(now);
    if (preset === 'custom') {
      if (!customFrom || !customTo) {
        throw new BadRequestException('customFrom/customTo là bắt buộc');
      }
      const from = this.parseDateValue(customFrom);
      const to = this.parseDateValue(customTo);
      if (!from || !to) {
        throw new BadRequestException('customFrom/customTo không hợp lệ');
      }
      if (this.startOfDay(from).getTime() > this.startOfDay(to).getTime()) {
        throw new BadRequestException('customFrom phải nhỏ hơn hoặc bằng customTo');
      }
      return { from: this.dateKey(from), to: this.dateKey(to) };
    }
    if (preset === 'today') {
      return { from: this.dateKey(today), to: this.dateKey(today) };
    }
    if (preset === 'this_week') {
      const day = today.getDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      return {
        from: this.dateKey(this.addDays(today, mondayOffset)),
        to: this.dateKey(today),
      };
    }
    if (preset === 'this_month') {
      return {
        from: this.dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: this.dateKey(today),
      };
    }
    if (preset === 'this_quarter') {
      const quarterMonth = Math.floor(today.getMonth() / 3) * 3;
      return {
        from: this.dateKey(new Date(today.getFullYear(), quarterMonth, 1)),
        to: this.dateKey(today),
      };
    }
    if (preset === 'this_year') {
      return {
        from: this.dateKey(new Date(today.getFullYear(), 0, 1)),
        to: this.dateKey(today),
      };
    }
    const rollingDays = {
      last_7_days: 6,
      last_30_days: 29,
      last_90_days: 89,
    }[preset];
    if (rollingDays !== undefined) {
      return {
        from: this.dateKey(this.addDays(today, -rollingDays)),
        to: this.dateKey(today),
      };
    }
    throw new BadRequestException('time preset không hợp lệ');
  }

  private resolvePreviousTimeRange(
    currentRange: TimeRange,
    compare: NonNullable<AnalyticsTimeDto['compare']>,
  ) {
    const from = this.parseDateValue(currentRange.from);
    const to = this.parseDateValue(currentRange.to);
    if (!from || !to) {
      throw new BadRequestException('Khoảng thời gian không hợp lệ');
    }
    if (compare === 'same_period_last_year') {
      return {
        from: this.dateKey(new Date(from.getFullYear() - 1, from.getMonth(), from.getDate())),
        to: this.dateKey(new Date(to.getFullYear() - 1, to.getMonth(), to.getDate())),
      };
    }
    const days = Math.max(
      1,
      Math.round((this.startOfDay(to).getTime() - this.startOfDay(from).getTime()) / 86400000) + 1,
    );
    const previousTo = this.addDays(this.startOfDay(from), -1);
    const previousFrom = this.addDays(previousTo, -(days - 1));
    return {
      from: this.dateKey(previousFrom),
      to: this.dateKey(previousTo),
    };
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private endOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private dateKey(date: Date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private aggregateDatasetValues(
    values: Array<number | null>,
    aggregation: string,
  ) {
    if (aggregation === 'count') return values.length;
    const valid = values.filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
    if (valid.length === 0) return 0;
    if (aggregation === 'sum')
      return valid.reduce((sum, value) => sum + value, 0);
    if (aggregation === 'avg') {
      return valid.reduce((sum, value) => sum + value, 0) / valid.length;
    }
    if (aggregation === 'min') return Math.min(...valid);
    if (aggregation === 'max') return Math.max(...valid);
    throw new BadRequestException(`aggregation không hợp lệ: ${aggregation}`);
  }

  private datasetNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private compareDatasetValues(
    left: unknown,
    right: unknown,
    direction: 'asc' | 'desc',
  ) {
    const leftMissing = left === null || left === undefined || left === '';
    const rightMissing = right === null || right === undefined || right === '';
    if (leftMissing || rightMissing) {
      if (leftMissing && rightMissing) return 0;
      return leftMissing ? 1 : -1;
    }
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    const comparison =
      Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
        ? leftNumber - rightNumber
        : this.datasetText(left, '').localeCompare(this.datasetText(right, ''));
    return direction === 'asc' ? comparison : -comparison;
  }

  private datasetText(value: unknown, fallback: string) {
    if (value === null || value === undefined || value === '') return fallback;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return `${value}`;
    }
    return JSON.stringify(value);
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

  private readHavingFiltersFromConfig(
    dataSourceConfig: Record<string, unknown>,
  ): AnalyticsHavingFilterDto[] {
    const topLevel = this.readHavingFilters(dataSourceConfig.having);
    if (topLevel.length > 0) return topLevel;
    const advancedQuery =
      dataSourceConfig.advancedQuery &&
      typeof dataSourceConfig.advancedQuery === 'object'
        ? (dataSourceConfig.advancedQuery as Record<string, unknown>)
        : null;
    return this.readHavingFilters(advancedQuery?.having);
  }

  private readFormulaFromConfig(
    dataSourceConfig: Record<string, unknown>,
  ): AnalyticsFormulaDto | undefined {
    const topLevel = this.readFormula(dataSourceConfig.formula);
    if (topLevel) return topLevel;
    const advancedQuery =
      dataSourceConfig.advancedQuery &&
      typeof dataSourceConfig.advancedQuery === 'object'
        ? (dataSourceConfig.advancedQuery as Record<string, unknown>)
        : null;
    return this.readFormula(advancedQuery?.formula);
  }

  private readTimeFromConfig(
    dataSourceConfig: Record<string, unknown>,
  ): AnalyticsTimeDto | undefined {
    return this.normalizeTimeInput(dataSourceConfig.time);
  }

  private normalizeTimeInput(value: unknown): AnalyticsTimeDto | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const config = value as Record<string, unknown>;
    if (config.enabled !== true) return undefined;
    const dateField = this.readConfigString(config.dateField, 'time.dateField');
    if (!dateField) {
      throw new BadRequestException('time.dateField là bắt buộc');
    }
    const preset = this.readConfigString(config.preset, 'time.preset') ?? 'this_month';
    if (
      ![
        'today',
        'this_week',
        'this_month',
        'this_quarter',
        'this_year',
        'last_7_days',
        'last_30_days',
        'last_90_days',
        'custom',
      ].includes(preset)
    ) {
      throw new BadRequestException('time.preset không hợp lệ');
    }
    const compare =
      this.readConfigString(config.compare, 'time.compare') ?? 'none';
    if (
      !['none', 'previous_period', 'same_period_last_year'].includes(compare)
    ) {
      throw new BadRequestException('time.compare không hợp lệ');
    }
    return {
      enabled: true,
      dateField,
      preset: preset as AnalyticsTimeDto['preset'],
      customFrom: this.readConfigString(config.customFrom, 'time.customFrom'),
      customTo: this.readConfigString(config.customTo, 'time.customTo'),
      compare: compare as AnalyticsTimeDto['compare'],
    };
  }

  private readFormula(value: unknown): AnalyticsFormulaDto | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const config = value as Record<string, unknown>;
    if (config.enabled !== true) return undefined;
    const expression = this.readConfigString(
      config.expression,
      'formula.expression',
    );
    const label = this.readConfigString(config.label, 'formula.label');
    if (!expression || !label) {
      throw new BadRequestException('Formula cần label và expression');
    }
    const fields = Array.isArray(config.fields)
      ? config.fields.filter((field): field is string => typeof field === 'string')
      : [];
    return {
      enabled: true,
      label,
      unit: this.readConfigString(config.unit, 'formula.unit'),
      expression,
      fields,
    };
  }

  private readHavingFilters(value: unknown): AnalyticsHavingFilterDto[] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const config = value as Record<string, unknown>;
    if (config.combinator !== 'and' || !Array.isArray(config.rules)) return [];
    return config.rules.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new BadRequestException('Having filter không hợp lệ');
      }
      const rule = item as Record<string, unknown>;
      const value = Number(rule.value);
      if (!Number.isFinite(value)) {
        throw new BadRequestException('Having filter value phải là số');
      }
      return {
        field: this.readConfigString(rule.field, 'having.field') ?? '',
        aggregation:
          this.readConfigString(rule.aggregation, 'having.aggregation') ??
          'sum',
        operator:
          rule.operator === 'gte' ||
          rule.operator === 'lt' ||
          rule.operator === 'lte' ||
          rule.operator === 'eq' ||
          rule.operator === 'neq'
            ? rule.operator
            : 'gt',
        value,
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
      (context.includes('sum') ||
        context.includes('avg') ||
        context.includes('min') ||
        context.includes('max')) &&
      !NUMERIC_FIELD_TYPES.has(field.fieldType)
    ) {
      throw new BadRequestException(
        `Field ${fieldCode} (${field.fieldType}) không hỗ trợ sum/avg/min/max`,
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

  private buildDateExtract(fieldCode: string): string {
    const textExtract = this.buildTextExtract(fieldCode);
    return `(
      CASE
        WHEN ${textExtract} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN LEFT(${textExtract}, 10)::date
        WHEN ${textExtract} ~ '^\\d{1,2}/\\d{1,2}/\\d{4}$' THEN to_date(${textExtract}, 'DD/MM/YYYY')
        ELSE NULL
      END
    )`;
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
    if (aggregation === 'min') {
      return `COALESCE(MIN(${numericExpr}), 0)`;
    }
    if (aggregation === 'max') {
      return `COALESCE(MAX(${numericExpr}), 0)`;
    }
    throw new BadRequestException('aggregation không hợp lệ');
  }

  private buildSqlHavingClause(
    filters: AnalyticsHavingFilterDto[],
    valueSql: string,
    query: ResolvedAnalyticsQuery,
    params: unknown[],
    startParamIndex: number,
  ) {
    if (filters.length === 0) return { sql: '', nextParamIndex: startParamIndex };
    let paramIndex = startParamIndex;
    const parts = filters.map((filter) => {
      this.assertCompatibleHavingFilter(filter, query);
      const comparison = this.havingComparisonOperator(filter.operator);
      params.push(this.normalizeHavingValue(filter));
      const clause = `${valueSql} ${comparison} $${paramIndex}`;
      paramIndex += 1;
      return clause;
    });
    return {
      sql: `HAVING ${parts.join(' AND ')}`,
      nextParamIndex: paramIndex,
    };
  }

  private assertCompatibleHavingFilter(
    filter: AnalyticsHavingFilterDto,
    query: Pick<ResolvedAnalyticsQuery, 'aggregation' | 'fieldCode'>,
  ) {
    if (filter.field !== query.fieldCode) {
      throw new BadRequestException(
        `Having field không khớp metricField: ${filter.field}`,
      );
    }
    if (filter.aggregation !== query.aggregation) {
      throw new BadRequestException(
        `Having aggregation không khớp truy vấn: ${filter.aggregation}`,
      );
    }
  }

  private havingComparisonOperator(operator: string) {
    const comparison = {
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      eq: '=',
      neq: '<>',
    }[operator];
    if (!comparison) {
      throw new BadRequestException(`Having operator không hợp lệ: ${operator}`);
    }
    return comparison;
  }

  private normalizeHavingValue(filter: AnalyticsHavingFilterDto) {
    const value = Number(filter.value);
    if (!Number.isFinite(value)) {
      throw new BadRequestException(
        `Having filter ${filter.field}: value phải là số`,
      );
    }
    return value;
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
