import { Controller, Get } from '@nestjs/common';
import { AdministrativeBoundaryService } from './administrative-boundary.service';

@Controller('layers/administrative-boundary')
export class AdministrativeBoundaryController {
  constructor(
    private readonly administrativeBoundaryService: AdministrativeBoundaryService,
  ) {}

  @Get()
  findAll() {
    return this.administrativeBoundaryService.findAllAsGeoJson();
  }

  @Get('metadata')
  getMetadata() {
    return this.administrativeBoundaryService.getMetadata();
  }
}
