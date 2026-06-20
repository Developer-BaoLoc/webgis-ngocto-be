import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
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

const KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export class DatasetFieldDto {
  @IsString()
  @Matches(KEY_PATTERN)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  label: string;

  @IsIn([
    'text',
    'number',
    'integer',
    'decimal',
    'currency',
    'date',
    'boolean',
    'select',
  ])
  type: string;
}

export class DatasetSourceDto {
  @IsUUID()
  viewId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sourceLabel: string;

  @IsObject()
  mapping: Record<string, string>;
}

export class DatasetConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DatasetFieldDto)
  fields: DatasetFieldDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DatasetSourceDto)
  sources: DatasetSourceDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  previewLimit?: number;
}

export class CreateDatasetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsObject()
  @ValidateNested()
  @Type(() => DatasetConfigDto)
  config: DatasetConfigDto;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateDatasetDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DatasetConfigDto)
  config?: DatasetConfigDto;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class PreviewDatasetDto {
  @IsObject()
  @ValidateNested()
  @Type(() => DatasetConfigDto)
  config: DatasetConfigDto;
}
