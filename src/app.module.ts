import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { MetadataModule } from './metadata/metadata.module';
import { RecordsModule } from './records/records.module';
import { DictionariesModule } from './dictionaries/dictionaries.module';
import { ImportModule } from './import/import.module';
import { AssetsModule } from './assets/assets.module';
import { GisModule } from './gis/gis.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WardBoundaryModule } from './ward-boundary/ward-boundary.module';
import { MapModule } from './map/map.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    WardBoundaryModule,
    AuthModule,
    TenantsModule,
    OrganizationsModule,
    HealthModule,
    MetadataModule,
    RecordsModule,
    DictionariesModule,
    ImportModule,
    AssetsModule,
    MapModule,
    GisModule,
    DashboardsModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
