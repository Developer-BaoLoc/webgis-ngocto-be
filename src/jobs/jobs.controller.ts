import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ImportService } from '../import/import.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('jobs')
export class JobsController {
  constructor(private readonly importService: ImportService) {}

  @Get(':jobId')
  async getJob(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @RequestId() requestId?: string,
  ) {
    const job = await this.importService.getJob(user.tenantId, jobId);
    return apiResponse(job, { requestId });
  }
}
