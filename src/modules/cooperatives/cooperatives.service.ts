import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseGisLayerService } from '../../common/abstracts/base-gis-layer.service';
import { GisLayerType, LayerStatus, LAYER_DISPLAY_NAMES } from '../../common';
import { GeometryType } from '../../common/enums/geometry-type.enum';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class CooperativesService extends BaseGisLayerService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    super();
  }

  getMetadata() {
    const ward = this.configService.get('ward', { infer: true });

    return {
      id: GisLayerType.COOPERATIVE,
      name: LAYER_DISPLAY_NAMES[GisLayerType.COOPERATIVE],
      description: `Lớp dữ liệu hợp tác xã trên địa bàn ${ward.locationLabel}`,
      geometryType: GeometryType.POLYGON,
      status: LayerStatus.PLANNED,
      endpoint: '/api/layers/cooperatives',
    };
  }
}
