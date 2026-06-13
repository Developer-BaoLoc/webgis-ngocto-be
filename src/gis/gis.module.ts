import { Module } from '@nestjs/common';
import { AdministrativeBoundaryModule } from '../modules/administrative-boundary/administrative-boundary.module';
import { CooperativesModule } from '../modules/cooperatives/cooperatives.module';
import { CooperativeGroupsModule } from '../modules/cooperative-groups/cooperative-groups.module';
import { IrrigationModule } from '../modules/irrigation/irrigation.module';
import { GisLayersController } from './gis-layers.controller';
import { GisLayersService } from './gis-layers.service';

@Module({
  imports: [
    AdministrativeBoundaryModule,
    CooperativesModule,
    CooperativeGroupsModule,
    IrrigationModule,
  ],
  controllers: [GisLayersController],
  providers: [GisLayersService],
})
export class GisModule {}
