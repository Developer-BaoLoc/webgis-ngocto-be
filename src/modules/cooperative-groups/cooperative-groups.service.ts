import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseGisLayerService } from '../../common/abstracts/base-gis-layer.service';
import { GisLayerType, LayerStatus, LAYER_DISPLAY_NAMES } from '../../common';
import { GeometryType } from '../../common/enums/geometry-type.enum';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class CooperativeGroupsService extends BaseGisLayerService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    super();
  }

  getMetadata() {
    const ward = this.configService.get('ward', { infer: true });

    return {
      id: GisLayerType.COOPERATIVE_GROUP,
      name: LAYER_DISPLAY_NAMES[GisLayerType.COOPERATIVE_GROUP],
      description: `Lớp dữ liệu tổ hợp tác trên địa bàn ${ward.locationLabel}`,
      geometryType: GeometryType.POLYGON,
      status: LayerStatus.PLANNED,
      endpoint: '/api/layers/cooperative-groups',
    };
  }
}
