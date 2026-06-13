import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeatureEntity } from '../database/entities/feature.entity';
import { MetadataModule } from '../metadata/metadata.module';
import { RecordsService } from './records.service';
import { RecordsController } from './records.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FeatureEntity]), MetadataModule],
  controllers: [RecordsController],
  providers: [RecordsService],
  exports: [RecordsService],
})
export class RecordsModule {}
