import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDashboardDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['private', 'organization', 'public'])
  scope?: string;
}

export class DashboardWidgetInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsIn([
    'stat',
    'bar',
    'pie',
    'donut',
    'line',
    'table',
    'ranking',
    'map',
    'text',
    'global_filter',
    'timeline',
    'calendar',
    'progress',
    'milestone',
    'activity_history',
    'minimap',
    'progress_ring',
    'activity_feed',
    'treemap',
    'alert_center',
    'spatial_summary',
    'spatial_ranking',
    'thematic_map',
    'spatial_alert',
    'seasonal_calendar',
  ])
  widgetType: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsObject()
  layoutConfig: Record<string, unknown>;

  // @IsObject()
  // dataSourceConfig: Record<string, unknown>;
  @IsOptional()
  @IsObject()
  dataSourceConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  displayConfig?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  interactionConfig?: Record<string, unknown>;

  @IsOptional()
  sortOrder?: number;
}

export class UpdateDashboardDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  layoutConfig?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  filterConfig?: unknown[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DashboardWidgetInputDto)
  widgets?: DashboardWidgetInputDto[];
}
