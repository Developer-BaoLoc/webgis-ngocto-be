import { Type } from 'class-transformer';
import {
  Allow,
  IsArray,
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

export class AnalyticsSortDto {
  @IsString()
  field: string;

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc';
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
