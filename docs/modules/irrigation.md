# Module: Irrigation (Thủy lợi)

| | |
|---|---|
| **Trạng thái** | 🔶 Prototype — GeoJSON rỗng |
| **Phase thay thế** | Phase 1 → `pump_station` (Point), `pump_service_area` (MultiPolygon) |
| **Code** | `src/modules/irrigation/` |

## Mục đích

Công trình thủy lợi: kênh, mương, cống, trạm bơm.

## API

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/layers/irrigation` | GeoJSON FeatureCollection |
| GET | `/api/layers/irrigation/metadata` | Metadata lớp |

### GeoJSON response

```json
{ "type": "FeatureCollection", "features": [] }
```

### Metadata response

```json
{
  "id": "irrigation",
  "name": "Thủy lợi",
  "description": "Lớp dữ liệu công trình thủy lợi: kênh, mương, cống, trạm bơm trên địa bàn xã Ngọc Tố",
  "geometryType": "LineString",
  "status": "planned",
  "endpoint": "/api/layers/irrigation"
}
```

## Frontend

- MapLibre: `line` layer (LineString)
- Trạm bơm (Point) sẽ tách layer riêng ở Phase 1

## Debug

```bash
curl -s http://localhost:4000/api/layers/irrigation | jq
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Khởi tạo |
