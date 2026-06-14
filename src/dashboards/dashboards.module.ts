import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DashboardEntity,
  DashboardRevisionEntity,
  DashboardWidgetEntity,
} from '../database/entities/analytics.entity';
import { MetadataModule } from '../metadata/metadata.module';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DashboardEntity,
      DashboardRevisionEntity,
      DashboardWidgetEntity,
    ]),
    MetadataModule,
  ],
  controllers: [DashboardsController],
  providers: [DashboardsService],
  exports: [DashboardsService],
})
export class DashboardsModule {}
