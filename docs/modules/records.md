# Records (Phase 1)

CRUD động theo layer schema + GeoJSON.

## Endpoints

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/layers/:layerId/records` | JWT | Danh sách (pagination) |
| POST | `/api/layers/:layerId/records` | JWT | Tạo bản ghi |
| GET | `/api/layers/:layerId/records/:recordId` | JWT | Chi tiết + geometry |
| PATCH | `/api/layers/:layerId/records/:recordId` | JWT | Cập nhật (optimistic lock `rowVersion`) |
| DELETE | `/api/layers/:layerId/records/:recordId` | JWT | Soft delete |
| GET | `/api/layers/:layerId/geojson` | JWT | FeatureCollection |

## Query — GeoJSON

```
GET /api/layers/:layerId/geojson?bbox=minLng,minLat,maxLng,maxLat&includeUnlocated=true
```

- `geometry: null` hợp lệ (`location_status: unlocated`)
- Validation properties theo published schema

## Body tạo/cập nhật

```json
{
  "properties": { "ten_chu_the": "HTX NN Bình Lợi", "loai_chu_the": "hop_tac_xa" },
  "geometry": { "type": "Point", "coordinates": [105.785, 10.0125] }
}
```

Geometry optional — import Excel để null, vẽ bản đồ ở Phase 2.
