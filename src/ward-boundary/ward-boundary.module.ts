import { Global, Module } from '@nestjs/common';
import { WardBoundaryService } from './ward-boundary.service';

@Global()
@Module({
  providers: [WardBoundaryService],
  exports: [WardBoundaryService],
})
export class WardBoundaryModule {}
