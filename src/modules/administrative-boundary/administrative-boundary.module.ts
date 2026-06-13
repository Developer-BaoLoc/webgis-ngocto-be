import { Module } from '@nestjs/common';
import { AdministrativeBoundaryController } from './administrative-boundary.controller';
import { AdministrativeBoundaryService } from './administrative-boundary.service';

@Module({
  controllers: [AdministrativeBoundaryController],
  providers: [AdministrativeBoundaryService],
  exports: [AdministrativeBoundaryService],
})
export class AdministrativeBoundaryModule {}
