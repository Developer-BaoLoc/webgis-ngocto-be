import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const FIELD_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export const SAVED_VIEW_FILTER_OPERATORS = [
  'eq',
  'neq',
  'contains',
  'not_contains',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'not_empty',
] as const;

export class SavedViewFilterDto {
  @IsString()
  @Matches(FIELD_CODE_PATTERN)
  field: string;

  @IsIn(SAVED_VIEW_FILTER_OPERATORS)
  operator: (typeof SAVED_VIEW_FILTER_OPERATORS)[number];

  @IsOptional()
  value?: unknown;
}

export class SavedViewSortDto {
  @IsString()
  @Matches(FIELD_CODE_PATTERN)
  field: string;

  @IsIn(['asc', 'desc'])
  direction: 'asc' | 'desc';
}

export class SavedViewConfigDto {
  @IsOptional()
  @IsIn(['and'])
  filterMode?: 'and';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavedViewFilterDto)
  filters?: SavedViewFilterDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SavedViewSortDto)
  sorts?: SavedViewSortDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(FIELD_CODE_PATTERN, { each: true })
  visibleFields?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  previewLimit?: number;
}

export class PreviewSavedViewDto {
  @IsUUID()
  layerId: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SavedViewConfigDto)
  config: SavedViewConfigDto;
}

export class CreateSavedViewDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsUUID()
  layerId: string;

  @IsOptional()
  @IsIn(['table'])
  viewType?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => SavedViewConfigDto)
  config: SavedViewConfigDto;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateSavedViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsUUID()
  layerId?: string;

  @IsOptional()
  @IsIn(['table'])
  viewType?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SavedViewConfigDto)
  config?: SavedViewConfigDto;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class SavedViewListQueryDto {
  @IsOptional()
  @IsUUID()
  layerId?: string;
}
