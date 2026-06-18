import { parseLatLngValue, type LatLngValue } from './lat-lng-geometry.util';

export type AreaPolygonValue = {
  coordinates: LatLngValue[];
};

type LngLatPosition = [number, number];

export type PolygonGeoJson = {
  type: 'Polygon';
  coordinates: LngLatPosition[][];
};

export type MultiPolygonGeoJson = {
  type: 'MultiPolygon';
  coordinates: LngLatPosition[][][];
};

export type PolygonGeometryGeoJson = PolygonGeoJson | MultiPolygonGeoJson;

export type PolygonGeometryNormalization = {
  geometry: PolygonGeometryGeoJson;
  autoClosedRings: number;
};

const MIN_VERTICES = 3;

function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function parseGeoJsonPosition(value: unknown): LngLatPosition | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [roundCoordinate(lng), roundCoordinate(lat)];
}

function samePosition(a: LngLatPosition, b: LngLatPosition): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function normalizeRing(
  value: unknown,
): { ring: LngLatPosition[]; autoClosed: boolean } | null {
  if (!Array.isArray(value)) return null;

  const ring: LngLatPosition[] = [];
  for (const position of value) {
    const parsed = parseGeoJsonPosition(position);
    if (!parsed) return null;
    ring.push(parsed);
  }

  if (ring.length < MIN_VERTICES) return null;

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return null;

  if (samePosition(first, last)) {
    return ring.length >= MIN_VERTICES + 1 ? { ring, autoClosed: false } : null;
  }

  return {
    ring: [...ring, first],
    autoClosed: true,
  };
}

function normalizePolygonCoordinates(
  coordinates: unknown,
): { coordinates: LngLatPosition[][]; autoClosedRings: number } | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return null;

  const rings: LngLatPosition[][] = [];
  let autoClosedRings = 0;
  for (const ringValue of coordinates) {
    const normalized = normalizeRing(ringValue);
    if (!normalized) return null;
    rings.push(normalized.ring);
    if (normalized.autoClosed) autoClosedRings += 1;
  }

  return { coordinates: rings, autoClosedRings };
}

export function normalizePolygonGeometryValue(
  value: unknown,
): PolygonGeometryNormalization | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return normalizePolygonGeometryValue(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
    return null;
  }

  if (typeof value !== 'object' || value === null) return null;

  const record = value as { type?: unknown; coordinates?: unknown };
  if (record.type === 'Polygon') {
    const normalized = normalizePolygonCoordinates(record.coordinates);
    if (!normalized) return null;
    return {
      geometry: {
        type: 'Polygon',
        coordinates: normalized.coordinates,
      },
      autoClosedRings: normalized.autoClosedRings,
    };
  }

  if (record.type === 'MultiPolygon') {
    if (!Array.isArray(record.coordinates) || record.coordinates.length === 0) {
      return null;
    }

    const polygons: LngLatPosition[][][] = [];
    let autoClosedRings = 0;
    for (const polygonValue of record.coordinates) {
      const normalized = normalizePolygonCoordinates(polygonValue);
      if (!normalized) return null;
      polygons.push(normalized.coordinates);
      autoClosedRings += normalized.autoClosedRings;
    }

    return {
      geometry: {
        type: 'MultiPolygon',
        coordinates: polygons,
      },
      autoClosedRings,
    };
  }

  return null;
}

export function isPolygonFieldType(fieldType: string): boolean {
  return fieldType === 'area_polygon';
}

export function parseAreaPolygonValue(value: unknown): AreaPolygonValue | null {
  const geoJson = normalizePolygonGeometryValue(value);
  if (geoJson?.geometry.type === 'Polygon') {
    const outerRing = geoJson.geometry.coordinates[0] ?? [];
    const openRing =
      outerRing.length > 1 &&
      samePosition(outerRing[0], outerRing[outerRing.length - 1])
        ? outerRing.slice(0, -1)
        : outerRing;
    const coordinates = openRing.map(([lng, lat]) => ({ lat, lng }));
    return coordinates.length >= MIN_VERTICES ? { coordinates } : null;
  }

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
    (point) =>
      [roundCoordinate(point.lng), roundCoordinate(point.lat)] as LngLatPosition,
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
): PolygonGeometryGeoJson | null {
  const areaFields = fields
    .filter((field) => isPolygonFieldType(field.fieldType))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const field of areaFields) {
    const polygonGeometry = normalizePolygonGeometryValue(
      properties[field.code],
    );
    if (polygonGeometry) return polygonGeometry.geometry;

    const parsed = parseAreaPolygonValue(properties[field.code]);
    if (parsed) {
      return areaPolygonToGeoJson(parsed);
    }
  }

  return null;
}

export function isPolygonGeometryKind(geometryKind: string): boolean {
  const normalized = String(geometryKind ?? '').toLowerCase();
  return normalized === 'polygon' || normalized === 'multipolygon';
}
