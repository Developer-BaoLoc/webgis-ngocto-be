# Dashboards — Bảng điều khiển động (MVP)

## Khái niệm

Dashboard gồm **layout + widgets**. Mỗi widget trỏ tới **lớp dữ liệu (layer)** và cấu hình aggregation trên `features.properties`.

```
Dashboard
  └── Revision (draft | published)
        └── Widgets (stat, bar, pie, table, map, …)
              └── dataSourceConfig: { layerId, aggregation, fieldCode?, groupByFieldCode?, filters? }
```

Luồng tương tự schema layer: chỉnh **draft** → **publish** → tạo draft mới từ bản published khi cần sửa.

## Endpoints — Dashboard

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/dashboards` | Danh sách dashboard user được xem |
| POST | `/api/dashboards` | Tạo dashboard mới (draft v1) |
| GET | `/api/dashboards/data-sources` | Layers + fields để cấu hình widget |
| GET | `/api/dashboards/:id` | Chi tiết bản **published** |
| GET | `/api/dashboards/:id/draft` | Chi tiết bản **draft** đang sửa |
| PATCH | `/api/dashboards/:id/draft` | Cập nhật tên, layout, filter, widgets |
| POST | `/api/dashboards/:id/publish` | Publish draft |
| POST | `/api/dashboards/:id/draft` | Clone draft mới từ published |

**Auth:** Bearer token bắt buộc.

### Tạo dashboard

```http
POST /api/dashboards
Content-Type: application/json

{
  "name": "Tổng quan HTX",
  "description": "Thống kê hợp tác xã",
  "scope": "private"
}
```

`scope`: `private` (mặc định) · `organization` · `public`

### Cập nhật draft + widgets

```http
PATCH /api/dashboards/{dashboardId}/draft
Content-Type: application/json

{
  "layoutConfig": { "columns": 12 },
  "filterConfig": [],
  "widgets": [
    {
      "widgetType": "stat",
      "title": "Tổng số HTX",
      "layoutConfig": { "x": 0, "y": 0, "w": 3, "h": 2 },
      "dataSourceConfig": {
        "layerId": "uuid-layer",
        "aggregation": "count"
      },
      "displayConfig": { "suffix": "HTX" }
    },
    {
      "widgetType": "bar",
      "title": "HTX theo ngành nghề",
      "layoutConfig": { "x": 3, "y": 0, "w": 6, "h": 4 },
      "dataSourceConfig": {
        "layerId": "uuid-layer",
        "aggregation": "count",
        "groupByFieldCode": "nganh_nghe",
        "limit": 20
      }
    }
  ]
}
```

### Widget types (MVP)

| Type | Mô tả | dataSourceConfig |
|------|-------|------------------|
| `stat` | Một con số | `count` hoặc `sum`/`avg` + `fieldCode` |
| `bar`, `pie`, `donut`, `line` | Biểu đồ nhóm | + `groupByFieldCode` |
| `table` | Bảng nhóm | + `groupByFieldCode` |
| `map` | FE tự gọi GeoJSON layer | `layerId` (+ filters) |
| `text` | Text tĩnh | `displayConfig.content` |
| `global_filter` | Bộ lọc chung | `filterConfig` trên dashboard |

## Endpoints — Analytics query

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/analytics/query` | Truy vấn trực tiếp |
| POST | `/api/analytics/preview` | Preview theo `dataSourceConfig` widget |

### Query trực tiếp

```http
POST /api/analytics/query
Content-Type: application/json

{
  "layerId": "uuid-layer",
  "aggregation": "count"
}
```

Nhóm theo field danh mục:

```json
{
  "layerId": "uuid-layer",
  "aggregation": "count",
  "groupByFieldCode": "nganh_nghe",
  "limit": 50
}
```

Tổng tiền:

```json
{
  "layerId": "uuid-layer",
  "aggregation": "sum",
  "fieldCode": "von_dieu_le"
}
```

Lọc:

```json
{
  "layerId": "uuid-layer",
  "aggregation": "count",
  "filters": [
    { "fieldCode": "trang_thai", "operator": "eq", "value": "hoat_dong" }
  ]
}
```

`operator`: `eq` (mặc định) · `neq` · `in` (value là mảng)

### Response

**Không groupBy:**

```json
{
  "layerId": "...",
  "aggregation": "count",
  "value": 42
}
```

**Có groupBy:**

```json
{
  "layerId": "...",
  "aggregation": "count",
  "groupByFieldCode": "nganh_nghe",
  "rows": [
    { "rawLabel": "trong_trot", "label": "Trồng trọt", "value": 15 },
    { "rawLabel": "chan_nuoi", "label": "Chăn nuôi", "value": 8 }
  ]
}
```

Field `category` tự resolve label từ dictionary.

### Preview widget (builder)

```http
POST /api/analytics/preview
Content-Type: application/json

{
  "dataSourceConfig": {
    "layerId": "uuid-layer",
    "aggregation": "sum",
    "fieldCode": "dien_tich",
    "groupByFieldCode": "loai_cay"
  },
  "globalFilters": []
}
```

## dataSourceConfig — tham chiếu

| Thuộc tính | Bắt buộc | Mô tả |
|------------|----------|-------|
| `layerId` | ✅ | UUID lớp dữ liệu |
| `aggregation` | ✅ | `count` · `sum` · `avg` |
| `fieldCode` | sum/avg | Field số (integer, money, measurement, quantity) |
| `groupByFieldCode` | biểu đồ | Field nhóm (text, category, multi_category) |
| `filters` | | Mảng filter widget |
| `limit` | | Max nhóm (mặc định 50) |

**Money / measurement:** aggregation dùng giá trị chuẩn hoá (`sourceValue`, `normalizedValue`).

## Luồng FE — Dashboard builder

1. `GET /api/dashboards/data-sources` — dropdown layer + field
2. `POST /api/dashboards` — tạo mới
3. Kéo thả widget → `PATCH .../draft` với `widgets[]`
4. Preview: `POST /api/analytics/preview` với `dataSourceConfig` từng widget
5. `POST .../publish`
6. Viewer: `GET /api/dashboards/:id` + gọi analytics cho từng widget

Widget `map`: FE dùng `GET /api/layers/:layerId/geojson` (có thể kết hợp filter client-side hoặc mở rộng sau).

## Phạm vi MVP / chưa có

- Dataset / metric / dimension riêng (bảng `datasets`, `metrics` — Phase sau)
- Widget cross-filter giữa widgets (chỉ `globalFilters` + `filterConfig` cơ bản)
- Cache `query_executions`
- Permission chi tiết (`dashboard_permissions`)
- Dashboard public không auth
