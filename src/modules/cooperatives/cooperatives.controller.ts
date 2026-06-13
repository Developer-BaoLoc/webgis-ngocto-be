import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CooperativesService } from './cooperatives.service';

@Public()
@Controller('layers/cooperatives')
export class CooperativesController {
  constructor(private readonly cooperativesService: CooperativesService) {}

  @Get()
  findAll() {
    return this.cooperativesService.findAllAsGeoJson();
  }

  @Get('metadata')
  getMetadata() {
    return this.cooperativesService.getMetadata();
  }
}
