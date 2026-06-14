import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureEntity } from '../database/entities/feature.entity';
import { DictionariesModule } from '../dictionaries/dictionaries.module';
import { MetadataModule } from '../metadata/metadata.module';
import { RecordsService } from './records.service';
import { RecordsController } from './records.controller';
import { RecordDisplayService } from './record-display.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeatureEntity]),
    MetadataModule,
    DictionariesModule,
  ],
  controllers: [RecordsController],
  providers: [RecordsService, RecordDisplayService],
  exports: [RecordsService, RecordDisplayService],
})
export class RecordsModule {}
