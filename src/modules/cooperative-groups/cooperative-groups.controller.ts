import { Controller, Get } from '@nestjs/common';
import { CooperativeGroupsService } from './cooperative-groups.service';

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
