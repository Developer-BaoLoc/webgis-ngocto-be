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
import { GisModule } from './gis/gis.module';
import { HealthModule } from './health/health.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    TenantsModule,
    OrganizationsModule,
    HealthModule,
    MetadataModule,
    RecordsModule,
    DictionariesModule,
    ImportModule,
    GisModule,
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
