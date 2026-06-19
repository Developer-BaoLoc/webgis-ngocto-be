import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LayerEntity } from '../database/entities/metadata.entity';
import { SavedViewEntity } from '../database/entities/saved-view.entity';
import { MetadataModule } from '../metadata/metadata.module';
import { SavedViewsController } from './saved-views.controller';
import { SavedViewsService } from './saved-views.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavedViewEntity, LayerEntity]),
    MetadataModule,
  ],
  controllers: [SavedViewsController],
  providers: [SavedViewsService],
  exports: [SavedViewsService],
})
export class SavedViewsModule {}
