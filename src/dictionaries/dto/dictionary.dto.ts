import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Một giá trị lựa chọn trong danh mục (hiển thị trên select/checkbox của field lớp dữ liệu). */
export class CreateDictionaryValueDto {
  @IsString()
  @MaxLength(255)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateDictionaryDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isHierarchical?: boolean;

  /** Giá trị lựa chọn ban đầu — có thể thêm sau qua POST .../items */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDictionaryValueDto)
  values?: CreateDictionaryValueDto[];
}

export class CreateDictionaryItemsBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateDictionaryValueDto)
  values: CreateDictionaryValueDto[];
}

export class UpdateDictionaryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isHierarchical?: boolean;
}

export class CreateDictionaryItemDto {
  @IsString()
  @MaxLength(255)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  code?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateDictionaryItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
