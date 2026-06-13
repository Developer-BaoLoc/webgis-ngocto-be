import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { FIELD_TYPES } from '../constants/metadata.constants';

export class CreateFieldDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'code phải là snake_case',
  })
  @MaxLength(128)
  code: string;

  @IsString()
  @MaxLength(255)
  label: string;

  @IsIn([...FIELD_TYPES])
  fieldType: string;

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
}
