export type LatLngValue = { lat: number; lng: number };

export type PointGeoJson = {
  type: 'Point';
  coordinates: [number, number];
};

export function parseLatLngValue(value: unknown): LatLngValue | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as { lat?: unknown; lng?: unknown };
  const lat = Number(record.lat);
  const lng = Number(record.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
}

export function latLngToPointGeoJson(value: LatLngValue): PointGeoJson {
  return {
    type: 'Point',
    coordinates: [value.lng, value.lat],
  };
}

export function resolvePointFromLatLngFields(
  fields: Array<{ code: string; fieldType: string; sortOrder?: number }>,
  properties: Record<string, unknown>,
): PointGeoJson | null {
  const latLngFields = fields
    .filter((field) => field.fieldType === 'lat_lng')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const field of latLngFields) {
    const parsed = parseLatLngValue(properties[field.code]);
    if (parsed) {
      return latLngToPointGeoJson(parsed);
    }
  }

  return null;
}
