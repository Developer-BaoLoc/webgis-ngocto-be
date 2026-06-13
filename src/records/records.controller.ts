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
} from '@nestjs/common';
import { RecordsService } from './records.service';
import {
  CurrentUser,
  RequestId,
} from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/api.types';
import { apiResponse } from '../common/utils/api-response.util';

@Controller('layers/:layerId')
export class RecordsController {
  constructor(private readonly recordsService: RecordsService) {}

  @Get('geojson')
  async geojson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Query('bbox') bbox?: string,
    @Query('includeUnlocated') includeUnlocated?: string,
    @RequestId() requestId?: string,
  ) {
    const collection = await this.recordsService.getGeoJson(
      user.tenantId,
      layerId,
      {
        bbox,
        includeUnlocated: includeUnlocated === 'true',
      },
    );
    return apiResponse(collection, { requestId });
  }

  @Get('records')
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('layerId', ParseUUIDPipe) layerId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @RequestId() requestId?: string,
  ) {
    const result = await this.recordsService.listRecords(
      user.tenantId,
      layerId,
      {
        page: page ? parseInt(page, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize, 10) : 50,
      },
    );
    return apiResponse(result.items, {
      requestId,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
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
      body as {
        properties?: Record<string, unknown>;
        geometry?: unknown;
        administrativeUnitId?: string;
      },
    );
    return apiResponse(record, { requestId });
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
      body as {
        properties?: Record<string, unknown>;
        geometry?: unknown | null;
        rowVersion?: number;
      },
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
