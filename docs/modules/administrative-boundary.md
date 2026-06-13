# Module: Administrative Boundary (Ranh giới hành chính)

| | |
|---|---|
| **Trạng thái** | 🔶 Prototype — GeoJSON rỗng |
| **Phase thay thế** | Phase 1 → layer `administrative_zone` |
| **Code** | `src/modules/administrative-boundary/` |

## Mục đích

Lớp ranh giới hành chính phường Long Bình (MultiPolygon).

## API

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/layers/administrative-boundary` | GeoJSON FeatureCollection |
| GET | `/api/layers/administrative-boundary/metadata` | Metadata lớp |

### GeoJSON response

```json
{ "type": "FeatureCollection", "features": [] }
```

### Metadata response

```json
{
  "id": "administrative-boundary",
  "name": "Ranh giới hành chính",
  "description": "Ranh giới hành chính Long Bình, Cái Răng, Cần Thơ",
  "geometryType": "MultiPolygon",
  "status": "planned",
  "endpoint": "/api/layers/administrative-boundary"
}
```

## Frontend

- MapLibre: `fill` + `line` layer cho MultiPolygon
- Hiện chưa có geometry — map trống là bình thường

## Debug

```bash
curl -s http://localhost:4000/api/layers/administrative-boundary | jq
curl -s http://localhost:4000/api/layers/administrative-boundary/metadata | jq
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Khởi tạo |
