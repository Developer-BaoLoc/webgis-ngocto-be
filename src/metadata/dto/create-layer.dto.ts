import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { LAYER_GEOMETRY_TYPES } from '../constants/layer-geometry.constants';

export function stripStyleNoise(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const copy = { ...(value as Record<string, unknown>) };
  delete copy.geometryType;

  const icon = copy.icon;
  if (icon && typeof icon === 'object' && icon !== null && 'source' in icon) {
    const iconObj = icon as {
      source: string;
      attachmentId?: string;
      url?: string;
      name?: string;
    };
    if (iconObj.source === 'upload' && iconObj.attachmentId) {
      copy.iconAttachmentId ??= iconObj.attachmentId;
      copy.iconUrl ??= iconObj.url;
      delete copy.icon;
    } else if (iconObj.source === 'preset' && iconObj.name) {
      copy.icon = iconObj.name;
    } else {
      delete copy.icon;
    }
  }

  return copy;
}

/** Input style từ FE — validate business rules trong MetadataService */
export type LayerStyleInput = Record<string, unknown>;

export class CreateLayerDto {
  @IsIn([...LAYER_GEOMETRY_TYPES])
  geometryType: 'point' | 'line' | 'polygon' | 'sub_layer';

  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @Transform(({ value }) => stripStyleNoise(value))
  @IsObject()
  style: LayerStyleInput;
}
