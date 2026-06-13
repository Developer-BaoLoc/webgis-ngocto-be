import { Injectable } from '@nestjs/common';
import { BaseGisLayerService } from '../../common/abstracts/base-gis-layer.service';
import {
  GisLayerType,
  LayerStatus,
  LAYER_DISPLAY_NAMES,
} from '../../common';
import { GeometryType } from '../../common/enums/geometry-type.enum';

@Injectable()
export class CooperativeGroupsService extends BaseGisLayerService {
  getMetadata() {
    return {
      id: GisLayerType.COOPERATIVE_GROUP,
      name: LAYER_DISPLAY_NAMES[GisLayerType.COOPERATIVE_GROUP],
      description: 'Lớp dữ liệu tổ hợp tác trên địa bàn phường Long Bình',
      geometryType: GeometryType.POLYGON,
      status: LayerStatus.PLANNED,
      endpoint: '/api/layers/cooperative-groups',
    };
  }
}
