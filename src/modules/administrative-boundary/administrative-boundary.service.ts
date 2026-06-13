import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { BaseGisLayerService } from '../../common/abstracts/base-gis-layer.service';
import {
  GisLayerType,
  LayerStatus,
  LAYER_DISPLAY_NAMES,
} from '../../common';
import { GeometryType } from '../../common/enums/geometry-type.enum';

@Injectable()
export class AdministrativeBoundaryService extends BaseGisLayerService {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    super();
  }

  getMetadata() {
    const ward = this.configService.get('ward', { infer: true });

    return {
      id: GisLayerType.ADMINISTRATIVE_BOUNDARY,
      name: LAYER_DISPLAY_NAMES[GisLayerType.ADMINISTRATIVE_BOUNDARY],
      description: `Ranh giới hành chính ${ward.name}, ${ward.district}, ${ward.province}`,
      geometryType: GeometryType.MULTIPOLYGON,
      status: LayerStatus.PLANNED,
      endpoint: '/api/layers/administrative-boundary',
    };
  }
}
