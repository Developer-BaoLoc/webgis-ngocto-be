import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseGisLayerService } from '../../common/abstracts/base-gis-layer.service';
import { GisLayerType, LayerStatus, LAYER_DISPLAY_NAMES } from '../../common';
import { GeometryType } from '../../common/enums/geometry-type.enum';
import { AppConfig } from '../../config/configuration';

@Injectable()
export class IrrigationService extends BaseGisLayerService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    super();
  }

  getMetadata() {
    const ward = this.configService.get('ward', { infer: true });

    return {
      id: GisLayerType.IRRIGATION,
      name: LAYER_DISPLAY_NAMES[GisLayerType.IRRIGATION],
      description: `Lớp dữ liệu công trình thủy lợi: kênh, mương, cống, trạm bơm trên địa bàn ${ward.locationLabel}`,
      geometryType: GeometryType.LINESTRING,
      status: LayerStatus.PLANNED,
      endpoint: '/api/layers/irrigation',
    };
  }
}
