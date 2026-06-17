import {
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RelationshipOptionsQueryDto {
  @IsOptional()
  @IsString()
  targetLayerId?: string;

  @IsOptional()
  @IsString()
  targetTable?: string;

  @IsOptional()
  @IsString()
  targetLayerCode?: string;

  @IsOptional()
  @IsString()
  displayField?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ResolveRelationshipsDto {
  @IsOptional()
  @IsString()
  targetLayerId?: string;

  @IsOptional()
  @IsString()
  targetTable?: string;

  @IsOptional()
  @IsString()
  targetLayerCode?: string;

  @IsOptional()
  @IsString()
  matchField?: string;

  @IsOptional()
  @IsString()
  displayField?: string;

  @IsArray()
  values: string[];
}

export class CheckRelationshipDto {
  @IsString()
  sourceLayerId: string;

  @IsOptional()
  @IsString()
  fieldCode?: string;

  @IsOptional()
  @IsIn(['many-to-one', 'one-to-many', 'many-to-many'])
  relationType?: string;

  @IsOptional()
  @IsString()
  targetLayerId?: string;

  @IsOptional()
  @IsString()
  targetLayerCode?: string;

  @IsOptional()
  @IsString()
  targetTable?: string;

  @IsOptional()
  @IsString()
  foreignKey?: string;

  @IsOptional()
  @IsString()
  targetDisplayField?: string;

  @IsOptional()
  @IsString()
  matchField?: string;
}

export class ResolveAgainRelationshipDto {
  @IsString()
  sourceLayerId: string;

  @IsString()
  fieldCode: string;
}
