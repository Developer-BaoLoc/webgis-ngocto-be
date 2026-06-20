# Records (Phase 1)

CRUD động theo layer schema + GeoJSON.

## Endpoints

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/layers/:layerId/records` | JWT | Danh sách bảng dữ liệu (**pagination**) |
| POST | `/api/layers/:layerId/records` | JWT | Tạo bản ghi |
| GET | `/api/layers/:layerId/records/:recordId` | JWT | Chi tiết + geometry + `display` |
| GET | `/api/layers/:layerId/records/:recordId/display` | Public | Popup + detail formatted (không geometry) |
| PATCH | `/api/layers/:layerId/records/:recordId` | JWT | Cập nhật (optimistic lock `rowVersion`) |
| DELETE | `/api/layers/:layerId/records/:recordId` | JWT | Soft delete |
| GET | `/api/layers/:layerId/geojson` | Public | FeatureCollection — **không phân trang** (bản đồ) |

## Query — Danh sách bảng dữ liệu

```
GET /api/layers/:layerId/records?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc&q=HTX
```

| Param | Mặc định | Mô tả |
|-------|----------|-------|
| `page` | `1` | Trang (≥ 1) |
| `pageSize` | `20` | Số dòng/trang (1–200) |
| `sortBy` | `createdAt` | `createdAt` \| `updatedAt` |
| `sortOrder` | `desc` | `asc` \| `desc` |
| `q` | — | Tìm kiếm text trong `properties` (ILIKE) |

Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "layerId": "uuid",
      "properties": { "ten_mo_hinh": "HTX ABC" },
      "cells": {
        "ten_mo_hinh": "HTX ABC",
        "chi_phi_nam": "2,6 Triệu đồng"
      },
      "status": "draft",
      "locationStatus": "unlocated",
      "rowVersion": 1,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 120,
    "totalPages": 6,
    "columns": [
      { "code": "ten_mo_hinh", "label": "Tên mô hình", "fieldType": "text", "required": true }
    ]
  }
}
```

- **`meta.columns`** — header bảng (theo schema published, bỏ cột ảnh/tệp)
- **`cells`** — giá trị đã format sẵn cho từng cột (tiền, danh mục, …)
- **GeoJSON** (`/geojson`) vẫn trả toàn bộ feature cho bản đồ — dùng endpoint records cho **bảng dữ liệu** có phân trang

## Query — GeoJSON

```
GET /api/layers/:layerId/geojson?bbox=minLng,minLat,maxLng,maxLat&includeUnlocated=true
```

- `geometry: null` hợp lệ (`location_status: unlocated`)
- Trường `lat_lng` trên lớp điểm: BE đồng bộ sang `geometry` — bản ghi HTX chỉ cần nhập lat/lng trong form
- Validation properties theo published schema

## Popup & chi tiết trên bản đồ

| Chế độ | Nguồn | Fields |
|--------|-------|--------|
| **Click điểm (popup)** | `feature.properties.popupSummary` trong GeoJSON | Trường bật `displaySchema.showOnMapPopup: true` (schema cũ: trường bắt buộc) |
| **Xem chi tiết** | `GET .../records/:recordId/display` (Public) hoặc `GET .../records/:recordId` (JWT) | Tất cả fields trong schema |

GeoJSON mỗi feature có thêm:

- `_recordId`, `_layerId` — dùng cho nút "Xem chi tiết"
- `popupSummary: [{ code, label, displayValue }]` — hiển thị ngay khi click, không cần gọi API

Response `/display`:

```json
{
  "data": {
    "recordId": "uuid",
    "layerId": "uuid",
    "layerCode": "htx",
    "layerName": "HTX",
    "popup": [{ "code", "label", "fieldType", "required", "value", "displayValue" }],
    "detail": [ "... tất cả fields ..." ]
  }
}
```

## Body tạo/cập nhật

```json
{
  "properties": { "ten_chu_the": "HTX NN Bình Lợi", "loai_chu_the": "hop_tac_xa" },
  "geometry": { "type": "Point", "coordinates": [105.9342, 9.4466] }
}
```

Geometry optional — import Excel để null, vẽ bản đồ ở Phase 2.

> **Frontend:** [frontend-crud-guide.md](./frontend-crud-guide.md)
