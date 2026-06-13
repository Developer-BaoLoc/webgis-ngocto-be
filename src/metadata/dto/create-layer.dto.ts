import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { GEOMETRY_KINDS } from '../constants/metadata.constants';

export class CreateLayerDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'code phải là snake_case (a-z, số, _)',
  })
  @MaxLength(64)
  code: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn([...GEOMETRY_KINDS])
  geometryKind: string;

  @IsOptional()
  @IsBoolean()
  geometryRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
