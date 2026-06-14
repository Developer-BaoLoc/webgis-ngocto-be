import { Transform } from 'class-transformer';
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
import { LAYER_GEOMETRY_TYPES } from '../constants/layer-geometry.constants';
import { LayerStyleInput, stripStyleNoise } from './create-layer.dto';

export class UpdateLayerDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn([...LAYER_GEOMETRY_TYPES])
  geometryType?: 'point' | 'line' | 'polygon';

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @Transform(({ value }) => stripStyleNoise(value))
  @IsObject()
  style?: LayerStyleInput;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
