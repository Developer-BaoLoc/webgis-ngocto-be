type Position = [number, number];

export type GeoBounds = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  center: { lat: number; lng: number };
};

function collectPositions(geometry: {
  type: string;
  coordinates: unknown;
}): Position[] {
  const { type, coordinates } = geometry;

  if (type === 'Point') {
    return [coordinates as Position];
  }

  if (type === 'MultiPoint' || type === 'LineString') {
    return coordinates as Position[];
  }

  if (type === 'MultiLineString' || type === 'Polygon') {
    return (coordinates as Position[][]).flat();
  }

  if (type === 'MultiPolygon') {
    return (coordinates as Position[][][]).flat(2);
  }

  return [];
}

export function computeGeoBounds(geometry: {
  type: string;
  coordinates: unknown;
}): GeoBounds | null {
  const positions = collectPositions(geometry);
  if (positions.length === 0) {
    return null;
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of positions) {
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minLng)) {
    return null;
  }

  return {
    minLng,
    minLat,
    maxLng,
    maxLat,
    center: {
      lat: (minLat + maxLat) / 2,
      lng: (minLng + maxLng) / 2,
    },
  };
}
