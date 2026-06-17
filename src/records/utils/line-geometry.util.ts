import { parseLatLngValue, type LatLngValue } from './lat-lng-geometry.util';

export type LineStringGeoJson = {
  type: 'LineString';
  coordinates: [number, number][];
};

export type MultiLineStringGeoJson = {
  type: 'MultiLineString';
  coordinates: [number, number][][];
};

export type LineGeometryGeoJson = LineStringGeoJson | MultiLineStringGeoJson;

const MIN_LINE_VERTICES = 2;

function roundCoordinate(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function parseGeoJsonPosition(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [roundCoordinate(lng), roundCoordinate(lat)];
}

function parseLatLngPosition(value: unknown): [number, number] | null {
  const parsed = parseLatLngValue(value);
  if (!parsed) return null;
  return [roundCoordinate(parsed.lng), roundCoordinate(parsed.lat)];
}

function parsePosition(value: unknown): [number, number] | null {
  return parseLatLngPosition(value) ?? parseGeoJsonPosition(value);
}

function parseLinePositions(value: unknown): [number, number][] | null {
  if (!Array.isArray(value)) return null;
  const coordinates = value
    .map((item) => parsePosition(item))
    .filter((item): item is [number, number] => item !== null);
  return coordinates.length >= MIN_LINE_VERTICES ? coordinates : null;
}

function parseMultiLinePositions(value: unknown): [number, number][][] | null {
  if (!Array.isArray(value)) return null;
  const lines = value
    .map((line) => parseLinePositions(line))
    .filter((line): line is [number, number][] => line !== null);
  return lines.length > 0 ? lines : null;
}

function parseCoordinateText(value: string): LineStringGeoJson | null {
  const pairs = value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const coordinates = pairs
    .map((pair) => {
      const [lat, lng] = pair.split(',').map((item) => item.trim());
      return parseLatLngPosition({ lat, lng });
    })
    .filter((item): item is [number, number] => item !== null);

  return coordinates.length >= MIN_LINE_VERTICES
    ? { type: 'LineString', coordinates }
    : null;
}

export function parseLineGeometryValue(
  value: unknown,
): LineGeometryGeoJson | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return parseLineGeometryValue(JSON.parse(trimmed));
      } catch {
        return null;
      }
    }
    return parseCoordinateText(trimmed);
  }

  if (Array.isArray(value)) {
    const line = parseLinePositions(value);
    return line ? { type: 'LineString', coordinates: line } : null;
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const record = value as {
    type?: unknown;
    coordinates?: unknown;
  };

  if (record.type === 'LineString') {
    const line = parseLinePositions(record.coordinates);
    return line ? { type: 'LineString', coordinates: line } : null;
  }

  if (record.type === 'MultiLineString') {
    const lines = parseMultiLinePositions(record.coordinates);
    return lines ? { type: 'MultiLineString', coordinates: lines } : null;
  }

  if (Array.isArray(record.coordinates)) {
    const line = parseLinePositions(record.coordinates);
    return line ? { type: 'LineString', coordinates: line } : null;
  }

  return null;
}

export function normalizeLineGeometryValue(
  value: LineGeometryGeoJson,
): LineGeometryGeoJson {
  if (value.type === 'MultiLineString') {
    return {
      type: 'MultiLineString',
      coordinates: value.coordinates.map((line) =>
        line.map(
          ([lng, lat]) =>
            [roundCoordinate(lng), roundCoordinate(lat)] as [number, number],
        ),
      ),
    };
  }

  return {
    type: 'LineString',
    coordinates: value.coordinates.map(
      ([lng, lat]) =>
        [roundCoordinate(lng), roundCoordinate(lat)] as [number, number],
    ),
  };
}

export function isLineFieldType(fieldType: string): boolean {
  return fieldType === 'line' || fieldType === 'linestring';
}

export function isLineGeometryKind(geometryKind?: string | null): boolean {
  const normalized = String(geometryKind ?? '').toLowerCase();
  return (
    normalized === 'line' ||
    normalized === 'linestring' ||
    normalized === 'multilinestring'
  );
}

export function resolveLineFromLineFields(
  fields: Array<{ code: string; fieldType: string; sortOrder?: number }>,
  properties: Record<string, unknown>,
): LineGeometryGeoJson | null {
  const lineFields = fields
    .filter((field) => isLineFieldType(field.fieldType))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const field of lineFields) {
    const parsed = parseLineGeometryValue(properties[field.code]);
    if (parsed) return parsed;
  }

  return null;
}

export function lineVertexCount(value: LineGeometryGeoJson): number {
  if (value.type === 'MultiLineString') {
    return value.coordinates.reduce((total, line) => total + line.length, 0);
  }
  return value.coordinates.length;
}
