import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FieldEntity,
  LayerEntity,
  LayerSchemaVersionEntity,
  SchemaFieldVersionEntity,
} from '../database/entities/metadata.entity';
import { AssetsModule } from '../assets/assets.module';
import { DictionariesModule } from '../dictionaries/dictionaries.module';
import { AdministrativeBoundaryModule } from '../modules/administrative-boundary/administrative-boundary.module';
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
    AssetsModule,
    DictionariesModule,
    AdministrativeBoundaryModule,
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
