import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CooperativeGroupsService } from './cooperative-groups.service';

@Public()
@Controller('layers/cooperative-groups')
export class CooperativeGroupsController {
  constructor(
    private readonly cooperativeGroupsService: CooperativeGroupsService,
  ) {}

  @Get()
  findAll() {
    return this.cooperativeGroupsService.findAllAsGeoJson();
  }

  @Get('metadata')
  getMetadata() {
    return this.cooperativeGroupsService.getMetadata();
  }
}
