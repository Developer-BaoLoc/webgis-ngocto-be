import { Controller, Get } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    const organizations = await this.organizationsService.listByTenant(
      user.tenantId,
    );
    return apiResponse(organizations, { requestId });
  }
}
