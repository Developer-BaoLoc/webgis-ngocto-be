import { Body, Controller, Post } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';
import {
  AnalyticsQueryDto,
  WidgetAnalyticsQueryDto,
} from './dto/analytics-query.dto';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('query')
  async query(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyticsQueryDto,
    @RequestId() requestId?: string,
  ) {
    const result = await this.analyticsService.query(user.tenantId, dto);
    return apiResponse(result, { requestId });
  }

  @Post('preview')
  async previewWidget(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: WidgetAnalyticsQueryDto,
    @RequestId() requestId?: string,
  ) {
    const result = await this.analyticsService.queryFromWidgetConfig(
      user.tenantId,
      dto.dataSourceConfig,
      dto.globalFilters,
    );
    return apiResponse(result, { requestId });
  }
}
