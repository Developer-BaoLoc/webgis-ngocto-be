import { Module } from '@nestjs/common';
import { MetadataModule } from '../metadata/metadata.module';
import { SavedViewsModule } from '../saved-views/saved-views.module';
import { DatasetsModule } from '../datasets/datasets.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { SpatialAnalyticsService } from './spatial-analytics.service';

@Module({
  imports: [MetadataModule, SavedViewsModule, DatasetsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, SpatialAnalyticsService],
  exports: [AnalyticsService, SpatialAnalyticsService],
})
export class AnalyticsModule {}
