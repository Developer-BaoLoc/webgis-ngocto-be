export type GeoJsonPosition = [number, number] | [number, number, number];

export interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

export interface GeoJsonFeature<T = Record<string, unknown>> {
  type: 'Feature';
  id?: string | number;
  geometry: GeoJsonGeometry | null;
  properties: T;
}

export interface GeoJsonFeatureCollection<T = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: GeoJsonFeature<T>[];
}
