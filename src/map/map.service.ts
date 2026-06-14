import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { MetadataService, LayerSummary } from '../metadata/metadata.service';
import { RecordsService } from '../records/records.service';
import { GeoJsonFeatureCollection } from '../common/interfaces/geojson.interface';

export type MapLayerMeta = Omit<LayerSummary, 'style'> & {
  style: Record<string, unknown> | null;
};

@Injectable()
export class MapService {
  constructor(
    private readonly metadataService: MetadataService,
    private readonly recordsService: RecordsService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async getMapGeoJson(tenantId: string, layerId?: string) {
    const apiPublicUrl = this.getApiPublicUrl();
    const allLayers = await this.metadataService.listLayers(tenantId);
    const layers = layerId
      ? allLayers.filter((layer) => layer.id === layerId)
      : allLayers;

    if (layerId && layers.length === 0) {
      return {
        layers: [],
        featureCollection: { type: 'FeatureCollection' as const, features: [] },
      };
    }

    const layersWithAbsoluteStyle = layers.map((layer) =>
      this.withAbsoluteIconUrl(layer, apiPublicUrl),
    );

    const featureCollection: GeoJsonFeatureCollection = {
      type: 'FeatureCollection',
      features: [],
    };

    for (const layer of layers) {
      const collection = await this.recordsService.getGeoJson(tenantId, layer.id, {});
      for (const feature of collection.features) {
        if (!feature.geometry) continue;
        featureCollection.features.push({
          ...feature,
          properties: {
            ...(feature.properties ?? {}),
            _layerId: layer.id,
            _layerCode: layer.code,
            _layerName: layer.name,
            _geometryType: layer.geometryType,
          },
        });
      }
    }

    return {
      layers: layersWithAbsoluteStyle,
      featureCollection,
    };
  }

  private withAbsoluteIconUrl(layer: LayerSummary, apiPublicUrl: string): MapLayerMeta {
    if (!layer.style || typeof layer.style !== 'object') {
      return { ...layer, style: layer.style as Record<string, unknown> | null };
    }

    const style = { ...layer.style } as Record<string, unknown>;
    const icon = style.icon;
    if (icon && typeof icon === 'object' && icon !== null && 'url' in icon) {
      const url = String((icon as { url?: string }).url ?? '');
      const absoluteUrl = url
        ? url.startsWith('http')
          ? url
          : `${apiPublicUrl}${url.startsWith('/') ? url : `/${url}`}`
        : undefined;
      style.icon = { ...(icon as Record<string, unknown>), absoluteUrl };
    }

    return { ...layer, style };
  }

  private getApiPublicUrl() {
    return (
      this.configService.get('apiPublicUrl', { infer: true }) ??
      `http://localhost:${this.configService.get('port', { infer: true })}`
    );
  }
}
