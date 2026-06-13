import { Injectable } from '@nestjs/common';
import { BaseGisLayerService } from '../../common/abstracts/base-gis-layer.service';
import {
  GisLayerType,
  LayerStatus,
  LAYER_DISPLAY_NAMES,
} from '../../common';
import { GeometryType } from '../../common/enums/geometry-type.enum';

@Injectable()
export class IrrigationService extends BaseGisLayerService {
  getMetadata() {
    return {
      id: GisLayerType.IRRIGATION,
      name: LAYER_DISPLAY_NAMES[GisLayerType.IRRIGATION],
      description:
        'Lớp dữ liệu công trình thủy lợi: kênh, mương, cống, trạm bơm trên địa bàn phường Long Bình',
      geometryType: GeometryType.LINESTRING,
      status: LayerStatus.PLANNED,
      endpoint: '/api/layers/irrigation',
    };
  }
}
