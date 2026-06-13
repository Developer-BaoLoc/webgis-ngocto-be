import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { IrrigationService } from './irrigation.service';

@Public()
@Controller('layers/irrigation')
export class IrrigationController {
  constructor(private readonly irrigationService: IrrigationService) {}

  @Get()
  findAll() {
    return this.irrigationService.findAllAsGeoJson();
  }

  @Get('metadata')
  getMetadata() {
    return this.irrigationService.getMetadata();
  }
}
