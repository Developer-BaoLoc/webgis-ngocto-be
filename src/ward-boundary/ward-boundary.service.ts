import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { AppConfig } from '../config/configuration';
import { GeoJsonFeatureCollection } from '../common/interfaces/geojson.interface';
import { computeGeoBounds } from './utils/geo-bounds.util';

type WardBoundaryFeature = {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};

export type ProjectMapView = {
  center: { lat: number; lng: number };
  defaultZoom: number;
  bounds: [number, number, number, number];
  boundaryEndpoint: string;
  ward: {
    name: string;
    code: string;
    district: string;
    province: string;
  };
};

@Injectable()
export class WardBoundaryService implements OnModuleInit {
  private readonly logger = new Logger(WardBoundaryService.name);
  private mapView: ProjectMapView | null = null;
  private boundaryCollection: GeoJsonFeatureCollection | null = null;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async onModuleInit() {
    try {
      this.loadBoundary();
    } catch (error) {
      this.logger.warn(
        `Không tải được ranh phường: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  getMapView(): ProjectMapView {
    const ward = this.configService.get('ward', { infer: true });
    return (
      this.mapView ?? {
        center: ward.center,
        defaultZoom: ward.defaultZoom,
        bounds: [
          ward.center.lng - 0.02,
          ward.center.lat - 0.02,
          ward.center.lng + 0.02,
          ward.center.lat + 0.02,
        ],
        boundaryEndpoint: '/api/layers/administrative-boundary',
        ward: {
          name: ward.name,
          code: ward.code,
          district: ward.district,
          province: ward.province,
        },
      }
    );
  }

  getBoundaryGeoJson(): GeoJsonFeatureCollection {
    return (
      this.boundaryCollection ?? {
        type: 'FeatureCollection',
        features: [],
      }
    );
  }

  private loadBoundary() {
    const ward = this.configService.get('ward', { infer: true });
    const boundaryConfig = ward.boundary;
    const datasetPath = this.resolveDatasetPath(boundaryConfig.datasetFile);
    const raw = readFileSync(datasetPath, 'utf-8');
    const collection = JSON.parse(raw) as GeoJsonFeatureCollection;

    const feature = this.findWardFeature(
      collection.features as WardBoundaryFeature[],
      boundaryConfig,
      ward.name,
    );

    if (!feature?.geometry) {
      throw new NotFoundException(
        `Không tìm thấy ranh phường "${ward.name}" trong ${boundaryConfig.datasetFile}`,
      );
    }

    const bounds = computeGeoBounds(feature.geometry);
    if (!bounds) {
      throw new NotFoundException('Ranh phường không có geometry hợp lệ');
    }

    this.boundaryCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: ward.code,
          geometry: feature.geometry,
          properties: {
            ...feature.properties,
            wardCode: ward.code,
            wardName: ward.name,
            district: ward.district,
            province: ward.province,
          },
        },
      ],
    };

    this.mapView = {
      center: bounds.center,
      defaultZoom: ward.defaultZoom,
      bounds: [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat],
      boundaryEndpoint: '/api/layers/administrative-boundary',
      ward: {
        name: ward.name,
        code: ward.code,
        district: ward.district,
        province: ward.province,
      },
    };

    this.logger.log(
      `Đã tải ranh phường ${ward.name} từ ${boundaryConfig.datasetFile}`,
    );
  }

  private findWardFeature(
    features: WardBoundaryFeature[],
    boundaryConfig: AppConfig['ward']['boundary'],
    wardName: string,
  ) {
    if (boundaryConfig.adminCode) {
      const byCode = features.find(
        (feature) =>
          String(
            feature.properties?.[boundaryConfig.adminCodeProperty ?? 'ma_xa'],
          ) === boundaryConfig.adminCode,
      );
      if (byCode) return byCode;
    }

    const matchValue = boundaryConfig.matchValue ?? wardName;
    return features.find(
      (feature) =>
        String(
          feature.properties?.[boundaryConfig.matchProperty] ?? '',
        ).trim() === matchValue,
    );
  }

  private resolveDatasetPath(datasetFile: string) {
    const candidates = [
      path.join(process.cwd(), 'data', 'ward-boundaries', datasetFile),
      path.join(process.cwd(), 'dist', 'data', 'ward-boundaries', datasetFile),
      path.join(__dirname, '..', '..', 'data', 'ward-boundaries', datasetFile),
    ];

    const found = candidates.find((candidate) => existsSync(candidate));
    if (!found) {
      throw new NotFoundException(
        `Không tìm thấy file ranh giới: ${datasetFile}`,
      );
    }

    return found;
  }
}
