import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { GisLayersService } from './gis-layers.service';

@Public()
@Controller('layers')
export class GisLayersController {
  constructor(private readonly gisLayersService: GisLayersService) {}

  @Get()
  getCatalog() {
    return this.gisLayersService.getCatalog();
  }
}
