import { Controller, Get } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('current')
  async getCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    const tenant = await this.tenantsService.getCurrent(user.tenantId);
    return apiResponse(tenant, { requestId });
  }
}
