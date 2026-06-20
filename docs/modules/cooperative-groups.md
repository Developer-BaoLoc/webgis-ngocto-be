# Module: Cooperative Groups (Tổ hợp tác)

| | |
|---|---|
| **Trạng thái** | 🔶 Prototype — GeoJSON rỗng |
| **Phase thay thế** | Phase 1 → layer `economic_collective` (field `loai_chu_the = thht`) |
| **Code** | `src/modules/cooperative-groups/` |

## Mục đích

Lớp tổ hợp tác trên địa bàn xã Ngọc Tố.

## API

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/layers/cooperative-groups` | GeoJSON FeatureCollection |
| GET | `/api/layers/cooperative-groups/metadata` | Metadata lớp |

### GeoJSON response

```json
{ "type": "FeatureCollection", "features": [] }
```

### Metadata response

```json
{
  "id": "cooperative-groups",
  "name": "Tổ hợp tác",
  "description": "Lớp dữ liệu tổ hợp tác trên địa bàn xã Ngọc Tố",
  "geometryType": "Polygon",
  "status": "planned",
  "endpoint": "/api/layers/cooperative-groups"
}
```

## Frontend

- MapLibre: fill layer (Polygon)
- HTX + THHT sẽ gộp một layer dynamic ở Phase 1

## Debug

```bash
curl -s http://localhost:4000/api/layers/cooperative-groups | jq
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Khởi tạo |
