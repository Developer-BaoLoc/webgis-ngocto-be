import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatasetEntity } from '../database/entities/dataset.entity';
import { SavedViewsModule } from '../saved-views/saved-views.module';
import { DatasetsController } from './datasets.controller';
import { DatasetsService } from './datasets.service';

@Module({
  imports: [TypeOrmModule.forFeature([DatasetEntity]), SavedViewsModule],
  controllers: [DatasetsController],
  providers: [DatasetsService],
  exports: [DatasetsService],
})
export class DatasetsModule {}
