import { Module } from '@nestjs/common';
import { CooperativeGroupsController } from './cooperative-groups.controller';
import { CooperativeGroupsService } from './cooperative-groups.service';

@Module({
  controllers: [CooperativeGroupsController],
  providers: [CooperativeGroupsService],
  exports: [CooperativeGroupsService],
})
export class CooperativeGroupsModule {}
