import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { GisModule } from './gis/gis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [AppConfigModule, HealthModule, GisModule],
})
export class AppModule {}
