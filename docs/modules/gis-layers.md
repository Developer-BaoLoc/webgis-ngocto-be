# Module: GIS Layers (Catalog)

| | |
|---|---|
| **Trạng thái** | ⚠️ Deprecated — thay bằng [metadata.md](./metadata.md) |
| **Phase thay thế** | Phase 1 — `src/metadata/layers.controller.ts` |
| **Code cũ** | `src/gis/gis-layers.*` (đã gỡ khỏi module) |

## Mục đích

Trả danh mục lớp GIS + cấu hình bản đồ (center, zoom) cho frontend khởi tạo map và sidebar.

## API

### `GET /api/layers`

**Response 200**

```json
{
  "project": {
    "name": "GIS Ngọc Tố",
    "description": "Hệ thống thông tin địa lý xã Ngọc Tố, Cần Thơ",
    "ward": "Ngọc Tố",
    "district": "Mỹ Xuyên",
    "province": "Cần Thơ",
    "center": { "lat": 9.4466, "lng": 105.9342 },
    "defaultZoom": 14
  },
  "layers": [
    {
      "id": "administrative-boundary",
      "name": "Ranh giới hành chính",
      "description": "...",
      "geometryType": "MultiPolygon",
      "status": "planned",
      "endpoint": "/api/layers/administrative-boundary"
    }
  ],
  "plannedLayers": [
    { "id": "land-use", "name": "Quy hoạch sử dụng đất" }
  ]
}
```

| Field | Ghi chú |
|-------|---------|
| `project.center` | MapLibre initial center |
| `project.defaultZoom` | Zoom mặc định |
| `layers[].endpoint` | Path GeoJSON (relative) |
| `layers[].status` | `planned` \| `in_progress` \| `ready` |
| `plannedLayers` | Roadmap UI — chưa có API riêng |

## Types (frontend)

```typescript
interface LayerCatalogResponse {
  project: {
    name: string;
    center: { lat: number; lng: number };
    defaultZoom: number;
    // ...
  };
  layers: Array<{
    id: string;
    name: string;
    geometryType: string;
    status: string;
    endpoint: string;
  }>;
  plannedLayers: Array<{ id: string; name: string }>;
}
```

## Frontend flow

```
GET /api/layers → sidebar + map init
User chọn layer → GET {layer.endpoint} → GeoJSON source
```

## Migration Phase 1

| Hiện tại | Phase 1 |
|----------|---------|
| `layers[].id` = slug | UUID + `code` |
| 4 layer hardcoded | Layers từ DB |
| `endpoint` path cố định | `GET /api/layers/:layerId/geojson?bbox=` |

## Debug

```bash
curl -s http://localhost:4000/api/layers | jq
yarn test:e2e   # expects project.name === "GIS Ngọc Tố", 4 layers
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Khởi tạo |
