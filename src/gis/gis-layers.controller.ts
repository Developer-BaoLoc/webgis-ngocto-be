import { Controller, Get } from '@nestjs/common';
import { GisLayersService } from './gis-layers.service';

@Controller('layers')
export class GisLayersController {
  constructor(private readonly gisLayersService: GisLayersService) {}

  @Get()
  getCatalog() {
    return this.gisLayersService.getCatalog();
  }
}
