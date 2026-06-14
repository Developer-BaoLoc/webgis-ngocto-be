import { Module } from '@nestjs/common';
import { AdministrativeBoundaryService } from './administrative-boundary.service';

@Module({
  providers: [AdministrativeBoundaryService],
  exports: [AdministrativeBoundaryService],
})
export class AdministrativeBoundaryModule {}
