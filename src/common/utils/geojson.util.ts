import { GeoJsonFeatureCollection } from '../interfaces/geojson.interface';

export function emptyFeatureCollection(): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [],
  };
}
