import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class AnalyticsFilterDto {
  @IsString()
  fieldCode: string;

  @IsOptional()
  @IsIn([
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
  ])
  operator?: string;

  @Allow()
  value: unknown;
}

export class AnalyticsHavingFilterDto {
  @IsString()
  field: string;

  @IsIn(['count', 'sum', 'avg', 'min', 'max', 'top', 'records'])
  aggregation: string;

  @IsIn(['gt', 'gte', 'lt', 'lte', 'eq', 'neq'])
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq';

  @Allow()
  value: unknown;
}

export class AnalyticsFormulaDto {
  @IsOptional()
  enabled?: boolean;

  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsString()
  expression: string;

  @IsArray()
  @IsString({ each: true })
  fields: string[];
}

export class AnalyticsSortDto {
  @IsString()
  field: string;

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc';
}

export class AnalyticsTimeDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsString()
  dateField: string;

  @IsIn([
    'today',
    'this_week',
    'this_month',
    'this_quarter',
    'this_year',
    'last_7_days',
    'last_30_days',
    'last_90_days',
    'custom',
  ])
  preset:
    | 'today'
    | 'this_week'
    | 'this_month'
    | 'this_quarter'
    | 'this_year'
    | 'last_7_days'
    | 'last_30_days'
    | 'last_90_days'
    | 'custom';

  @IsOptional()
  @IsString()
  customFrom?: string;

  @IsOptional()
  @IsString()
  customTo?: string;

  @IsOptional()
  @IsIn(['none', 'previous_period', 'same_period_last_year'])
  compare?: 'none' | 'previous_period' | 'same_period_last_year';
}

export class AnalyticsQueryDto {
  @IsOptional()
  @IsUUID()
  datasetId?: string;

  @IsOptional()
  @IsUUID()
  layerId?: string;

  @IsOptional()
  @IsUUID()
  viewId?: string;

  @IsIn(['count', 'sum', 'avg', 'min', 'max', 'top', 'records'])
  aggregation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'top' | 'records';

  @IsOptional()
  @IsString()
  fieldCode?: string;

  @IsOptional()
  @IsString()
  metricField?: string;

  @IsOptional()
  @IsString()
  groupByFieldCode?: string;

  @IsOptional()
  @IsString()
  dimensionField?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  displayFields?: string[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AnalyticsSortDto)
  sort?: AnalyticsSortDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyticsFilterDto)
  filters?: AnalyticsFilterDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyticsHavingFilterDto)
  having?: AnalyticsHavingFilterDto[];

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AnalyticsFormulaDto)
  formula?: AnalyticsFormulaDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AnalyticsTimeDto)
  time?: AnalyticsTimeDto;

  @IsOptional()
  @IsObject()
  spatial?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnalyticsFilterDto)
  globalFilters?: AnalyticsFilterDto[];

  @IsOptional()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class WidgetAnalyticsQueryDto {
  @IsOptional()
  @IsObject()
  dataSourceConfig?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  globalFilters?: AnalyticsFilterDto[];
}
