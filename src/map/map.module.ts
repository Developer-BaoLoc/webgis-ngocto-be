import { Module } from '@nestjs/common';
import { MetadataModule } from '../metadata/metadata.module';
import { RecordsModule } from '../records/records.module';
import { MapController } from './map.controller';
import { MapService } from './map.service';

@Module({
  imports: [MetadataModule, RecordsModule],
  controllers: [MapController],
  providers: [MapService],
})
export class MapModule {}
