import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { RecordsService } from './records.service';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';
import { AppConfig } from '../config/configuration';

@Controller('layers/:layerId')
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Get('geojson')
  async geojson(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Query('bbox') bbox?: string,
    @Query('includeUnlocated') includeUnlocated?: string,
    @RequestId() requestId?: string,
  ) {
    const tenantId =
      req.user?.tenantId ??
      this.configService.get('tenant.defaultId', { infer: true }) ??
      '';
    const collection = await this.recordsService.getGeoJson(tenantId, layerId, {
      bbox,
      includeUnlocated: includeUnlocated === 'true',
    });
    return apiResponse(collection, { requestId });
  }

  @Get('records')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('q') q?: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.recordsService.listRecords(
      user.tenantId,
      layerId,
      { page, pageSize, sortBy, sortOrder, q },
    );
    return apiResponse(result.items, {
      requestId,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
      columns: result.columns,
    });
  }

  @Post('records')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Body() body: Record<string, unknown>,
    @RequestId() requestId?: string,
  ) {
    const record = await this.recordsService.createRecord(
      user.tenantId,
      layerId,
      user.id,
      body,
    );
    return apiResponse(record, { requestId });
  }

  @Public()
  @Get('records/:recordId/display')
  async getDisplay(
    @Req() req: Request & { user?: AuthenticatedUser },
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @RequestId() requestId?: string,
  ) {
    const tenantId =
      req.user?.tenantId ??
      this.configService.get('tenant.defaultId', { infer: true }) ??
      '';
    const display = await this.recordsService.getRecordDisplay(
      tenantId,
      layerId,
      recordId,
    );
    return apiResponse(display, { requestId });
  }

  @Get('records/:recordId')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @RequestId() requestId?: string,
  ) {
    const record = await this.recordsService.getRecord(
      user.tenantId,
      layerId,
      recordId,
    );
    return apiResponse(record, { requestId });
  }

  @Patch('records/:recordId')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @Body() body: Record<string, unknown>,
    @RequestId() requestId?: string,
  ) {
    const record = await this.recordsService.updateRecord(
      user.tenantId,
      layerId,
      recordId,
      user.id,
      body,
    );
    return apiResponse(record, { requestId });
  }

  @Delete('records/:recordId')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Param('recordId', ParseUUIDPipe) recordId: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.recordsService.deleteRecord(
      user.tenantId,
      layerId,
      recordId,
      user.id,
    );
    return apiResponse(result, { requestId });
  }
}
