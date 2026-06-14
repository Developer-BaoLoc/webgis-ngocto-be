import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { RequestId } from '../common/decorators/current-user.decorator';
import { apiResponse } from '../common/utils/api-response.util';
import { AppConfig } from '../config/configuration';
import { MapService } from './map.service';

@Public()
@Controller('map')
export class MapController {
  constructor(
    private readonly mapService: MapService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  @Get('geojson')
  async geojson(
    @Query('layerId') layerId?: string,
    @RequestId() requestId?: string,
  ) {
    const tenantId = this.configService.get('tenant.defaultId', { infer: true }) ?? '';
    const payload = await this.mapService.getMapGeoJson(tenantId, layerId);
    return apiResponse(payload, { requestId });
  }
}
