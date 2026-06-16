import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const IMPORT_NEW_FIELD_TYPES = [
  'text',
  'decimal',
  'boolean',
  'date',
] as const;

export type ImportNewFieldType = (typeof IMPORT_NEW_FIELD_TYPES)[number];

export class ImportNewFieldDto {
  @ApiProperty({ example: 'duong_kinh' })
  @IsString()
  @MaxLength(128)
  code: string;

  @ApiProperty({ example: 'Đường kính' })
  @IsString()
  @MaxLength(255)
  label: string;

  @ApiProperty({
    enum: IMPORT_NEW_FIELD_TYPES,
    example: 'decimal',
    description: 'Kiểu field đơn giản được phép tạo trực tiếp từ import.',
  })
  @IsIn([...IMPORT_NEW_FIELD_TYPES])
  fieldType: ImportNewFieldType;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({
    description: 'Tuỳ chọn nâng cao; nếu bỏ trống backend chỉ set required.',
  })
  @IsOptional()
  @IsObject()
  dataSchema?: Record<string, unknown>;
}

export class ImportNewFieldsDto {
  @ApiPropertyOptional({ type: [ImportNewFieldDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ImportNewFieldDto)
  newFields?: ImportNewFieldDto[];
}
