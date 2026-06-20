# Module: Cooperatives (Hợp tác xã)

| | |
|---|---|
| **Trạng thái** | 🔶 Prototype — GeoJSON rỗng |
| **Phase thay thế** | Phase 1 → layer `economic_collective` (field `loai_chu_the = htx`) |
| **Code** | `src/modules/cooperatives/` |

## Mục đích

Lớp hợp tác xã trên địa bàn xã Ngọc Tố.

## API

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/layers/cooperatives` | GeoJSON FeatureCollection |
| GET | `/api/layers/cooperatives/metadata` | Metadata lớp |

### GeoJSON response

```json
{ "type": "FeatureCollection", "features": [] }
```

### Metadata response

```json
{
  "id": "cooperatives",
  "name": "Hợp tác xã",
  "description": "Lớp dữ liệu hợp tác xã trên địa bàn xã Ngọc Tố",
  "geometryType": "Polygon",
  "status": "planned",
  "endpoint": "/api/layers/cooperatives"
}
```

## Frontend

- MapLibre: fill layer (Polygon)
- Import Excel HTX (Phase 1) sẽ populate dữ liệu

## Debug

```bash
curl -s http://localhost:4000/api/layers/cooperatives | jq
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Khởi tạo |
