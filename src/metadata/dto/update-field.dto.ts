import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { FIELD_TYPES } from '../constants/metadata.constants';

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @IsOptional()
  @IsIn([...FIELD_TYPES])
  fieldType?: string;

  @IsOptional()
  @IsObject()
  dataSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  uiSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  displaySchema?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
