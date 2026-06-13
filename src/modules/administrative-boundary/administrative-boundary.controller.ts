import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { AdministrativeBoundaryService } from './administrative-boundary.service';

@Public()
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
