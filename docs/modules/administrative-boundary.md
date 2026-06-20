# Module: Administrative Boundary (Ranh giới hành chính)

Lớp ranh giới phường — đọc từ `data/ward-boundaries/` theo cấu hình tenant.

## API

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/layers/administrative-boundary` | Public | GeoJSON FeatureCollection (1 phường) |
| GET | `/api/layers/administrative-boundary/metadata` | Public | Metadata lớp |
| GET | `/api/metadata/map-view` | Public | center, bounds, zoom, boundaryEndpoint |

## Map view (FE zoom + vẽ ranh)

`GET /api/layers` → `data.project.mapView`:

```json
{
  "center": { "lat": 9.7283, "lng": 105.5865 },
  "defaultZoom": 13,
  "bounds": [105.5542, 9.6800, 105.6189, 9.7767],
  "boundaryEndpoint": "/api/layers/administrative-boundary",
  "ward": {
    "name": "Ngọc Tố",
    "code": "ngoc-to",
    "district": "Mỹ Xuyên",
    "province": "Cần Thơ"
  }
}
```

- `bounds`: `[minLng, minLat, maxLng, maxLat]` — dùng `fitBounds` (MapLibre/Leaflet)
- Ranh GeoJSON: `GET {boundaryEndpoint}` — response **raw** FeatureCollection (không bọc `{ data }`)

## Cấu hình phường khác

Xem [data/ward-boundaries/README.md](../../data/ward-boundaries/README.md).

## Frontend (MapLibre gợi ý)

```typescript
const { data } = await fetch(`${API}/layers`).then(r => r.json());
const { mapView } = data.project;

const boundary = await fetch(`${API}${mapView.boundaryEndpoint.replace(/^\/api/, '')}`).then(r => r.json());
// hoặc: fetch(`${API}/layers/administrative-boundary`)

map.addSource('ward-boundary', { type: 'geojson', data: boundary });
map.addLayer({ id: 'ward-fill', type: 'fill', source: 'ward-boundary', paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.08 } });
map.addLayer({ id: 'ward-line', type: 'line', source: 'ward-boundary', paint: { 'line-color': '#2563eb', 'line-width': 2 } });

map.fitBounds(
  [[mapView.bounds[0], mapView.bounds[1]], [mapView.bounds[2], mapView.bounds[3]]],
  { padding: 40, duration: 0 },
);
```
