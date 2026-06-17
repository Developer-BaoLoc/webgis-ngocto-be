import { Injectable } from '@nestjs/common';
import { BaseGisLayerService } from '../../common/abstracts/base-gis-layer.service';
import { GisLayerType, LayerStatus, LAYER_DISPLAY_NAMES } from '../../common';
import { GeometryType } from '../../common/enums/geometry-type.enum';

@Injectable()
export class CooperativesService extends BaseGisLayerService {
  getMetadata() {
    return {
      id: GisLayerType.COOPERATIVE,
      name: LAYER_DISPLAY_NAMES[GisLayerType.COOPERATIVE],
      description: 'Lớp dữ liệu hợp tác xã trên địa bàn phường Long Bình',
      geometryType: GeometryType.POLYGON,
      status: LayerStatus.PLANNED,
      endpoint: '/api/layers/cooperatives',
    };
  }
}
