import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FieldEntity,
  LayerEntity,
  LayerSchemaVersionEntity,
  SchemaFieldVersionEntity,
} from '../database/entities/metadata.entity';
import { MetadataService } from './metadata.service';
import { LayersController } from './layers.controller';
import {
  MetadataCatalogController,
  SchemaDraftsController,
} from './schema-drafts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LayerEntity,
      FieldEntity,
      LayerSchemaVersionEntity,
      SchemaFieldVersionEntity,
    ]),
  ],
  controllers: [
    LayersController,
    SchemaDraftsController,
    MetadataCatalogController,
  ],
  providers: [MetadataService],
  exports: [MetadataService],
})
export class MetadataModule {}
