import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportNewFieldDto } from './import-new-field.dto';

export class GeoJsonGeometryDto {
  @ApiProperty({ example: 'Polygon' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'GeoJSON coordinates array' })
  coordinates: unknown;
}

export class GeoJsonImportOptionsDto {
  @ApiProperty({ example: '9c0f3c6a-geojson-import.geojson' })
  @IsString()
  importId: string;

  @ApiPropertyOptional({
    enum: ['none', 'current_ward'],
    default: 'none',
    description:
      'current_ward filters by WARD_BOUNDARY_DATASET / WARD_BOUNDARY_ADMIN_CODE.',
  })
  @IsOptional()
  @IsIn(['none', 'current_ward'])
  filterMode?: 'none' | 'current_ward';

  @ApiPropertyOptional({
    description:
      'Field-code to GeoJSON property-name override. Example: { "ten": "name" }',
    example: { ten: 'name', loai_duong: 'highway' },
  })
  @IsOptional()
  @IsObject()
  propertyMapping?: Record<string, string>;

  @ApiPropertyOptional({
    description:
      'Optional GeoJSON Polygon/MultiPolygon geometry used as ST_Intersects boundary.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoJsonGeometryDto)
  filterBoundary?: GeoJsonGeometryDto;

  @ApiPropertyOptional({ default: 1000, minimum: 1, maximum: 5000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  batchSize?: number;

  @ApiPropertyOptional({
    type: [ImportNewFieldDto],
    description:
      'Fields to create and publish before executing the import. Preview ignores this.',
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ImportNewFieldDto)
  newFields?: ImportNewFieldDto[];
}

export class GeoJsonImportPreviewDto extends GeoJsonImportOptionsDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  sampleSize?: number;
}
