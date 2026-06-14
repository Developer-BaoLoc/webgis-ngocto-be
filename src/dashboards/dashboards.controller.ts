import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';
import {
  CreateDashboardDto,
  UpdateDashboardDraftDto,
} from './dto/dashboard.dto';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    const items = await this.dashboardsService.list(user.tenantId, user.id);
    return apiResponse(items, { requestId });
  }

  @Get('data-sources')
  async dataSources(
    @CurrentUser() user: AuthenticatedUser,
    @RequestId() requestId?: string,
  ) {
    const items = await this.dashboardsService.getLayerFieldOptions(
      user.tenantId,
    );
    return apiResponse(items, { requestId });
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDashboardDto,
    @RequestId() requestId?: string,
  ) {
    const dashboard = await this.dashboardsService.create(
      user.tenantId,
      user.id,
      dto,
    );
    return apiResponse(dashboard, { requestId });
  }

  @Get(':dashboardId')
  async getPublished(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @RequestId() requestId?: string,
  ) {
    const dashboard = await this.dashboardsService.getDetail(
      user.tenantId,
      dashboardId,
      user.id,
      'published',
    );
    return apiResponse(dashboard, { requestId });
  }

  @Get(':dashboardId/draft')
  async getDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @RequestId() requestId?: string,
  ) {
    const dashboard = await this.dashboardsService.getDetail(
      user.tenantId,
      dashboardId,
      user.id,
      'draft',
    );
    return apiResponse(dashboard, { requestId });
  }

  @Patch(':dashboardId/draft')
  async updateDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @Body() dto: UpdateDashboardDraftDto,
    @RequestId() requestId?: string,
  ) {
    const dashboard = await this.dashboardsService.updateDraft(
      user.tenantId,
      dashboardId,
      user.id,
      dto,
    );
    return apiResponse(dashboard, { requestId });
  }

  @Post(':dashboardId/publish')
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @RequestId() requestId?: string,
  ) {
    const dashboard = await this.dashboardsService.publish(
      user.tenantId,
      dashboardId,
      user.id,
    );
    return apiResponse(dashboard, { requestId });
  }

  @Post(':dashboardId/draft')
  async createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dashboardId', ParseUUIDPipe) dashboardId: string,
    @RequestId() requestId?: string,
  ) {
    const dashboard = await this.dashboardsService.createDraftFromPublished(
      user.tenantId,
      dashboardId,
      user.id,
    );
    return apiResponse(dashboard, { requestId });
  }
}
