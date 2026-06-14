import { parseLatLngValue, type LatLngValue } from './lat-lng-geometry.util';

export type AreaPolygonValue = {
  coordinates: LatLngValue[];
};

export type PolygonGeoJson = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

const MIN_VERTICES = 3;

export function parseAreaPolygonValue(value: unknown): AreaPolygonValue | null {
  if (Array.isArray(value)) {
    const coordinates = value
      .map((item) => parseLatLngValue(item))
      .filter((item): item is LatLngValue => item !== null);
    return coordinates.length >= MIN_VERTICES ? { coordinates } : null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as { coordinates?: unknown };
  if (!Array.isArray(record.coordinates)) {
    return null;
  }

  const coordinates = record.coordinates
    .map((item) => parseLatLngValue(item))
    .filter((item): item is LatLngValue => item !== null);

  return coordinates.length >= MIN_VERTICES ? { coordinates } : null;
}

export function normalizeAreaPolygonValue(
  value: AreaPolygonValue,
): AreaPolygonValue {
  return {
    coordinates: value.coordinates.map((point) => ({
      lat: Math.round(point.lat * 1e6) / 1e6,
      lng: Math.round(point.lng * 1e6) / 1e6,
    })),
  };
}

export function areaPolygonToGeoJson(value: AreaPolygonValue): PolygonGeoJson {
  let ring = value.coordinates.map(
    (point) => [point.lng, point.lat] as [number, number],
  );

  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) {
    ring = [...ring, [firstLng, firstLat]];
  }

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

export function resolvePolygonFromAreaFields(
  fields: Array<{ code: string; fieldType: string; sortOrder?: number }>,
  properties: Record<string, unknown>,
): PolygonGeoJson | null {
  const areaFields = fields
    .filter((field) => field.fieldType === 'area_polygon')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const field of areaFields) {
    const parsed = parseAreaPolygonValue(properties[field.code]);
    if (parsed) {
      return areaPolygonToGeoJson(parsed);
    }
  }

  return null;
}

export function isPolygonGeometryKind(geometryKind: string): boolean {
  return geometryKind === 'polygon' || geometryKind === 'multipolygon';
}
