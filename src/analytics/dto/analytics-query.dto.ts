import { Type } from 'class-transformer';
import {
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
  @IsIn(['eq', 'neq', 'in'])
  operator?: string;

  value: unknown;
}

export class AnalyticsQueryDto {
  @IsUUID()
  layerId: string;

  @IsIn(['count', 'sum', 'avg'])
  aggregation: 'count' | 'sum' | 'avg';

  @IsOptional()
  @IsString()
  fieldCode?: string;

  @IsOptional()
  @IsString()
  groupByFieldCode?: string;

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
