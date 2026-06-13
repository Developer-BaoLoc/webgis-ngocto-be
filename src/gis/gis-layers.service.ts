import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { PLANNED_LAYERS } from '../common/constants/layer-names.constant';
import { BaseGisLayerService } from '../common/abstracts/base-gis-layer.service';
import { AdministrativeBoundaryService } from '../modules/administrative-boundary/administrative-boundary.service';
import { CooperativesService } from '../modules/cooperatives/cooperatives.service';
import { CooperativeGroupsService } from '../modules/cooperative-groups/cooperative-groups.service';
import { IrrigationService } from '../modules/irrigation/irrigation.service';

@Injectable()
export class GisLayersService {
  private readonly layerServices: BaseGisLayerService[];

  constructor(
    private readonly configService: ConfigService<AppConfig, true>,
    administrativeBoundaryService: AdministrativeBoundaryService,
    cooperativesService: CooperativesService,
    cooperativeGroupsService: CooperativeGroupsService,
    irrigationService: IrrigationService,
  ) {
    this.layerServices = [
      administrativeBoundaryService,
      cooperativesService,
      cooperativeGroupsService,
      irrigationService,
    ];
  }

  getCatalog() {
    const ward = this.configService.get('ward', { infer: true });

    return {
      project: {
        name: 'GIS Long Bình',
        description: 'Hệ thống thông tin địa lý phường Long Bình, Cần Thơ',
        ward: ward.name,
        district: ward.district,
        province: ward.province,
        center: ward.center,
        defaultZoom: ward.defaultZoom,
      },
      layers: this.layerServices.map((service) => service.getMetadata()),
      plannedLayers: PLANNED_LAYERS,
    };
  }
}
