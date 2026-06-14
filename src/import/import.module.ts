import { Module, OnModuleDestroy } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppConfig } from '../config/configuration';
import {
  ImportJobEntity,
  ImportTemplateEntity,
  JobExecutionEntity,
} from '../database/entities/import.entity';
import { LayerEntity } from '../database/entities/metadata.entity';
import { ImportController } from './import.controller';
import { ImportService, IMPORT_QUEUE } from './import.service';
import { ImportProcessor } from './import.processor';
import { RecordsModule } from '../records/records.module';
import { MetadataModule } from '../metadata/metadata.module';
import { DictionariesModule } from '../dictionaries/dictionaries.module';
import { LayerImportController } from './layer-import.controller';
import { LayerImportService } from './layer-import.service';
import { JobsController } from '../jobs/jobs.controller';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const redis = configService.get('redis', { infer: true });
        return {
          connection: {
            host: redis.host,
            port: redis.port,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: IMPORT_QUEUE }),
    TypeOrmModule.forFeature([
      ImportJobEntity,
      ImportTemplateEntity,
      JobExecutionEntity,
      LayerEntity,
    ]),
    RecordsModule,
    MetadataModule,
    DictionariesModule,
  ],
  controllers: [ImportController, JobsController, LayerImportController],
  providers: [
    ImportService,
    LayerImportService,
    ...(process.env.NODE_ENV === 'test' ? [] : [ImportProcessor]),
  ],
  exports: [ImportService, LayerImportService],
})
export class ImportModule implements OnModuleDestroy {
  constructor(@InjectQueue(IMPORT_QUEUE) private readonly importQueue: Queue) {}

  async onModuleDestroy() {
    await this.importQueue.close();
  }
}
