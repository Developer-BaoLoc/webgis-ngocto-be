import { LayerMetadata } from '../interfaces/gis-layer.interface';
import { GeoJsonFeatureCollection } from '../interfaces/geojson.interface';
import { emptyFeatureCollection } from '../utils/geojson.util';

export abstract class BaseGisLayerService {
  abstract getMetadata(): LayerMetadata;

  async findAllAsGeoJson(): Promise<GeoJsonFeatureCollection> {
    return emptyFeatureCollection();
  }
}
