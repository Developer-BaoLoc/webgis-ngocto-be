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
import {
  FIELD_TYPES,
  FieldType,
} from '../../metadata/constants/metadata.constants';

export type ImportNewFieldType = FieldType;

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
    enum: FIELD_TYPES,
    example: 'decimal',
    description: 'Dùng chung danh sách FIELD_TYPES với màn hình tạo field.',
  })
  @IsIn([...FIELD_TYPES])
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  uiSchema?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  displaySchema?: Record<string, unknown>;
}

export class ImportNewFieldsDto {
  @ApiPropertyOptional({ type: [ImportNewFieldDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ImportNewFieldDto)
  newFields?: ImportNewFieldDto[];
}
