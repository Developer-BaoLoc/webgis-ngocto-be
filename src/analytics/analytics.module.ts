import { Module } from '@nestjs/common';
import { MetadataModule } from '../metadata/metadata.module';
import { SavedViewsModule } from '../saved-views/saved-views.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [MetadataModule, SavedViewsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
