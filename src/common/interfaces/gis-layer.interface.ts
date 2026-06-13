import { GisLayerType, LayerStatus } from '../enums/gis-layer-type.enum';
import { GeometryType } from '../enums/geometry-type.enum';
import { GeoJsonFeatureCollection } from './geojson.interface';

export interface LayerMetadata {
  id: GisLayerType;
  name: string;
  description: string;
  geometryType: GeometryType;
  status: LayerStatus;
  endpoint: string;
}

export interface GisLayerProvider {
  getMetadata(): LayerMetadata;
  findAllAsGeoJson(): Promise<GeoJsonFeatureCollection>;
}
