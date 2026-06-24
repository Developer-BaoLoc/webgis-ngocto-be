## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Kiến trúc tổng thể](#2-kiến-trúc-tổng-thể)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Yêu cầu môi trường](#4-yêu-cầu-môi-trường)
5. [Chạy Backend](#5-chạy-backend)
6. [Chạy Frontend](#6-chạy-frontend)
7. [Cấu hình xã/phường](#7-cấu-hình-xãphường)
8. [Luồng dữ liệu chính](#8-luồng-dữ-liệu-chính)
9. [Advanced Query Builder](#9-advanced-query-builder)
10. [Map Analytics](#10-map-analytics)
11. [Dashboard workflow mẫu](#11-dashboard-workflow-mẫu)
12. [Style layer/icon động](#12-style-layericon-động)
13. [Relationship / Sub-layer](#13-relationship--sub-layer)
14. [Các API quan trọng](#14-các-api-quan-trọng)
15. [Lỗi thường gặp](#15-lỗi-thường-gặp)
16. [Build production](#16-build-production)
17. [Quy ước phát triển](#17-quy-ước-phát-triển)
18. [Checklist khi clone sang xã mới](#18-checklist-khi-clone-sang-xã-mới)
19. [Roadmap](#19-roadmap)

## 1. Tổng quan

WebGIS Dynamic Platform là hệ thống WebGIS metadata-driven. Source hiện được tách thành:

| Phần | Thư mục | Công nghệ chính |
|---|---|---|
| Backend | `gis_be/` | NestJS, PostgreSQL/PostGIS, Redis, MinIO |
| Frontend | `gis_fe/` | Next.js, React, MapLibre, react-grid-layout |

Mục tiêu chính của hệ thống là quản lý dữ liệu GIS cho nhiều xã/phường mà không phải hard-code riêng từng lớp dữ liệu. Thay vì tạo module riêng cho từng nghiệp vụ như “Vùng lúa”, “Công trình thủy lợi”, “Cảnh báo”, hệ thống lưu cấu hình layer, field, style, view, dataset, widget và dashboard trong metadata.

Chuỗi dữ liệu cốt lõi:

```text
Layer → Saved View → Dataset → Query Engine → Widget → Dashboard
```

Điều này cho phép một xã/phường dùng cùng source code nhưng có cấu trúc dữ liệu, boundary, dashboard và style riêng.

## 2. Kiến trúc tổng thể

```text
PostgreSQL/PostGIS
  ↓
Metadata Layer
  ↓
Import Engine
  ↓
Saved View
  ↓
Dataset Builder
  ↓
Analytics / Query Engine
  ↓
Dashboard Widget
  ↓
Map / Dashboard UI
```

### PostgreSQL/PostGIS

Lưu tenant, layer metadata, field schema, feature records, geometry, saved views, datasets, dashboard revisions và widget config. Geometry được xử lý bằng PostGIS, không xử lý spatial analytics bằng JavaScript.

### Metadata Layer

Định nghĩa layer, field, dictionary, relationship, schema version, style và icon. Đây là phần giúp hệ thống không phụ thuộc vào tên xã hoặc tên lớp dữ liệu cụ thể.

### Import Engine

Nhận Excel, CSV và GeoJSON. Importer đọc header, mapping field, chuẩn hóa dữ liệu, resolve dictionary/relationship và lưu feature record theo layer.

### Saved View

Lưu một khung nhìn có filter, sort, selected fields trên một layer. Saved View không sao chép record; record gốc đổi thì view đổi theo.

### Dataset Builder

Tạo bảng ảo từ một hoặc nhiều Saved View. Dataset chuẩn hóa field đầu ra để nhiều nguồn khác schema có thể dùng chung trong dashboard.

### Analytics / Query Engine

Nhận `layerId`, `viewId` hoặc `datasetId`; áp dụng filter, formula, time filter, grouping, having, sort, limit và trả về dữ liệu cho widget.

### Dashboard Widget

Widget chỉ là cấu hình trình bày gồm `widgetType`, `dataSourceConfig`, `displayConfig`, `layoutConfig`. Widget cũ vẫn tương thích với `layerId`; widget mới có thể dùng `viewId`, `datasetId` hoặc Advanced Query.

### Map / Dashboard UI

Frontend render bản đồ MapLibre, bảng record động, form quản trị metadata, Dashboard Builder và dashboard published.

## 3. Cấu trúc thư mục

### Backend: `gis_be/`

```text
gis_be/
├── src/
│   ├── analytics/          # Query Engine và SpatialAnalyticsService
│   ├── assets/             # upload icon, image, file field
│   ├── auth/               # JWT login/me
│   ├── dashboards/         # dashboard, revision, widget, publish
│   ├── datasets/           # Dataset Builder, preview, usage
│   ├── dictionaries/       # dictionary/select option
│   ├── import/             # Excel/CSV/GeoJSON import
│   ├── map/                # endpoint dữ liệu bản đồ tổng hợp
│   ├── metadata/           # layer, schema, field, relationship
│   ├── records/            # CRUD record động theo layer
│   ├── saved-views/        # Saved View Builder
│   ├── tenants/            # tenant hiện tại
│   └── ward-boundary/      # resolve boundary theo env
├── migrations/             # SQL migration và seed runner
├── data/ward-boundaries/   # GeoJSON ranh giới hành chính
├── uploads/                # file upload/import tạm
├── docker-compose.yml      # PostGIS, Redis, MinIO local
├── .env.example            # biến môi trường mẫu
└── package.json
```

### Frontend: `gis_fe/`

```text
gis_fe/
├── app/                    # Next.js routes
├── components/
│   ├── admin/              # Layer/Saved View/Dataset/Dashboard Builder
│   ├── dashboard/          # widget renderers
│   ├── form/               # dynamic field inputs
│   ├── import/             # import wizard/dialog
│   ├── map/                # MapLibre, boundary, filter, legend
│   └── records/            # dynamic record form/table
├── lib/
│   ├── api/                # API clients
│   ├── dashboard/          # advanced-query, layout, format, labels
│   ├── fields/             # field config/label/unit helpers
│   ├── layers/             # layer adapter/style/icon helpers
│   └── map/                # basemap, bounds, data layers, popup
├── providers/              # auth, layer catalog, map visibility
├── types/                  # API contracts và GIS types
├── public/                 # static assets
├── .env.example
└── package.json
```

## 4. Yêu cầu môi trường

Khuyến nghị:

| Thành phần | Phiên bản/ghi chú |
|---|---|
| Node.js | 20+; Node 22 cũng phù hợp với backend hiện tại |
| npm | dùng theo Node.js |
| Docker Desktop | để chạy PostgreSQL/PostGIS, Redis, MinIO |
| PostgreSQL client | cần `psql` để chạy migration script |
| Trình duyệt | Chrome/Edge/Safari mới để test MapLibre và dashboard |

Backend dùng Docker Compose local cho:

- PostgreSQL/PostGIS;
- Redis;
- MinIO.

## 5. Chạy Backend

```bash
cd gis_be
npm install
cp .env.example .env.local
docker compose --env-file .env.local up -d postgres redis minio
npm run db:migrate
npm run db:seed
npm run start:dev
```

API mặc định chạy tại:

```text
http://localhost:4000/api
```

Swagger:

```text
http://localhost:4000/api/docs
```

Các script backend thực tế:

```bash
npm run db:up           # docker compose up -d postgres redis minio
npm run db:migrate      # chạy migrations/run.sh
npm run db:seed         # chạy migrations/seed.sh
npm run db:reset        # down -v, up lại hạ tầng, migrate lại
npm run start:dev       # NestJS watch mode
npm run build           # nest build
npm run start:prod      # node dist/main
npm test                # jest
npm run cleanup:imports # dọn file import tạm
```

Nếu đổi port database:

```env
DATABASE_PORT=5435
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/gis_ngocto
```

MinIO local theo `.env.example` đang dùng:

```env
MINIO_PORT=9002
MINIO_CONSOLE_PORT=9003
MINIO_BUCKET=gis-ngocto
```

Không chạy `docker compose down -v` nếu database local đang có dữ liệu cần giữ.

## 6. Chạy Frontend

```bash
cd gis_fe
npm install
npm run dev
```

Frontend chạy tại:

```text
http://localhost:5001
```

Script frontend thực tế:

```bash
npm run dev                # next dev -p 5001
npm run build              # next build
npm run start              # next start -p 5001
npm run lint               # eslint
npm run generate:dashboard # generate static agri dashboard data nếu cần
```

Biến môi trường frontend nên dùng:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
```

Lưu ý: API client hiện đọc `NEXT_PUBLIC_API_BASE_URL`. Nếu file `.env.example` cũ còn ghi `NEXT_PUBLIC_API_URL=http://localhost:4000`, hãy đổi sang biến trên hoặc frontend sẽ fallback về `http://localhost:4000/api`.

## 7. Cấu hình xã/phường

Backend đọc cấu hình địa bàn từ `.env.local`.

```env
WARD_NAME=Ngoc To
WARD_CODE=ngoc-to
WARD_DISTRICT=My Xuyen
WARD_PROVINCE=Can Tho

WARD_DEFAULT_ZOOM=12
WARD_CENTER_LAT=9.446632339808145
WARD_CENTER_LNG=105.93422393213204

WARD_BOUNDARY_DATASET=can-tho.geojson
WARD_BOUNDARY_MATCH_PROPERTY=ten_xa
WARD_BOUNDARY_MATCH_VALUE=Ngoc To
WARD_BOUNDARY_ADMIN_CODE=31723
WARD_BOUNDARY_ADMIN_CODE_PROPERTY=ma_xa
```

Ý nghĩa:

| Biến | Ý nghĩa |
|---|---|
| `WARD_NAME` | Tên xã/phường hiển thị. |
| `WARD_CODE` | Mã slug nội bộ. |
| `WARD_DISTRICT` | Quận/huyện/thị xã. |
| `WARD_PROVINCE` | Tỉnh/thành phố. |
| `WARD_DEFAULT_ZOOM` | Zoom mặc định khi mở bản đồ. |
| `WARD_CENTER_LAT` | Vĩ độ trung tâm. |
| `WARD_CENTER_LNG` | Kinh độ trung tâm. |
| `WARD_BOUNDARY_DATASET` | Tên file GeoJSON trong `gis_be/data/ward-boundaries/`. |
| `WARD_BOUNDARY_MATCH_PROPERTY` | Thuộc tính trong GeoJSON dùng để match. |
| `WARD_BOUNDARY_MATCH_VALUE` | Giá trị cần match để lấy đúng boundary. |
| `WARD_BOUNDARY_ADMIN_CODE` | Mã hành chính nếu match theo mã. |
| `WARD_BOUNDARY_ADMIN_CODE_PROPERTY` | Thuộc tính chứa mã hành chính trong GeoJSON. |

File boundary mẫu:

```text
gis_be/data/ward-boundaries/can-tho.geojson
```

Endpoint boundary:

```text
GET /api/layers/administrative-boundary
GET /api/layers/administrative-boundary/metadata
```

Map lớn và MiniMap đều nên dùng cùng boundary từ endpoint này.

## 8. Luồng dữ liệu chính

```text
1. Admin tạo Layer
   ↓
2. Admin cấu hình Field metadata
   ↓
3. Import Excel/CSV/GeoJSON thành Feature Records
   ↓
4. Tạo Saved View để lọc/sort/chọn field
   ↓
5. Tạo Dataset nếu cần hợp nhất nhiều Saved View
   ↓
6. Query Engine tính records/aggregate/spatial analytics
   ↓
7. Dashboard Widget render kết quả
   ↓
8. Publish Dashboard
```

### 8.1 Layer

Layer là định nghĩa metadata cho một loại dữ liệu nghiệp vụ. Một layer có:

- `code`, `name`, `description`;
- geometry type/kind;
- field schema;
- style/icon config;
- records thuộc layer đó.

Geometry type thường dùng:

| Type | Dùng cho |
|---|---|
| `point` | hợp tác xã, hộ dân, công trình, cảnh báo |
| `line` | tuyến đường, tuyến kênh, tuyến thủy lợi |
| `polygon` | vùng sản xuất, khu vực hành chính, ao/vùng nuôi |
| `sub_layer` | dữ liệu con không hiển thị độc lập trên map/sidebar |

### 8.2 Field metadata

Field metadata mô tả cách lưu, nhập, lọc và hiển thị một trường dữ liệu.

| Thuộc tính | Mục đích |
|---|---|
| Field code/raw key | dùng cho query, import, filter, sort, mapping |
| Label | dùng cho UI, chart, tooltip, table |
| Field type | quyết định control nhập liệu và khả năng dùng làm metric/dimension |
| Dictionary | map raw value sang label đẹp cho select/category |
| Relationship | liên kết record giữa layer cha/con hoặc layer khác |
| Unit/display schema | format số, tiền, phần trăm, đơn vị |

Quy ước: raw key như `loi_nhuan_trieu_dong_nam` chỉ dùng trong config/query. UI nên hiển thị label như “Lợi nhuận”.

### 8.3 Import dữ liệu

Hỗ trợ:

- Excel;
- CSV;
- GeoJSON.

Luồng import:

```text
Upload file
  → đọc cột/geometry
  → mapping field
  → tạo field mới nếu được admin xác nhận
  → normalize number/date/category/geometry
  → resolve relationship
  → preview
  → execute
```

Các trường hợp geometry:

- point từ cặp tọa độ lat/lng;
- geometry WKT nếu có;
- line/polygon từ field geometry hoặc GeoJSON;
- GeoJSON FeatureCollection import trực tiếp vào layer.

Relationship import:

- có thể map cột nguồn sang field relationship;
- hệ thống resolve theo metadata target layer/lookup field;
- nếu không resolve được thì báo lỗi theo dòng.

File trong `gis_be/uploads/imports/` là file tạm cho import. Sau khi import đã xử lý xong và không cần debug, có thể dọn bằng:

```bash
cd gis_be
npm run cleanup:imports
```

### 8.4 Saved View

Saved View là một khung nhìn đã lưu trên layer:

- filter dữ liệu;
- sort;
- selected/display fields;
- tên và mô tả để tái sử dụng.

Saved View phù hợp khi cùng một layer cần nhiều lát cắt khác nhau. Ví dụ:

```text
Layer Vùng sản xuất
  ├── Saved View: Vùng lúa
  ├── Saved View: Vùng thủy sản
  └── Saved View: Vùng hoa màu
```

### 8.5 Dataset Builder

Dataset là bảng ảo hợp nhất nhiều Saved View thành một schema chuẩn hóa.

Ví dụ Dataset **Lợi nhuận các vùng**:

```text
Saved View Vùng lúa       ┐
Saved View Vùng thủy sản  ├── Dataset Lợi nhuận các vùng
Saved View Vùng hoa màu   ┘
```

Fields chuẩn hóa:

| Field | Ý nghĩa |
|---|---|
| `loai_vung` | loại vùng: Lúa, Thủy sản, Hoa màu |
| `loi_nhuan` | lợi nhuận |
| `dien_tich` | diện tích |

Dataset không tạo bảng nghiệp vụ mới; nó lưu cấu hình mapping và được resolve động khi preview/query.

### 8.6 Query Engine

Query Engine hiện hỗ trợ các nguồn:

- `layerId`;
- `viewId`;
- `datasetId`.

Các aggregation:

| Aggregation | Ý nghĩa |
|---|---|
| `count` | đếm record |
| `sum` | tổng |
| `avg` | trung bình |
| `min` | nhỏ nhất |
| `max` | lớn nhất |
| `top` | xếp hạng/top records |
| `records` | trả danh sách record |

Các khả năng đã có:

- data filters trước tổng hợp;
- having filters sau tổng hợp;
- formula builder cho chỉ số tính toán;
- query preview;
- ranking;
- time intelligence;
- spatial analytics qua PostGIS.

Ví dụ payload preview widget:

```json
{
  "dataSourceConfig": {
    "datasetId": "dataset-uuid",
    "aggregation": "sum",
    "metricField": "loi_nhuan",
    "dimensionField": "loai_vung",
    "sort": {
      "field": "loi_nhuan",
      "direction": "desc"
    },
    "limit": 5
  }
}
```

### 8.7 Dashboard Widget

Các widget chính:

| Widget type | Mục đích |
|---|---|
| `stat` / KPI | một chỉ số lớn, có unit và comparison |
| `bar` | biểu đồ cột/thanh |
| `line` | biểu đồ đường |
| `pie` / `donut` | cơ cấu theo nhóm |
| `ranking` | bảng xếp hạng top |
| `table` | bảng record |
| `minimap` | bản đồ nhỏ dùng MapPageContent embedded |
| `progress_ring` | vòng tiến độ |
| `activity_feed` | danh sách hoạt động |
| `alert_center` | danh sách cảnh báo |
| `treemap` | tỷ trọng dạng ô |
| `seasonal_calendar` | lịch mùa vụ |
| `spatial_summary` | thống kê theo khu vực |
| `spatial_ranking` | top khu vực theo metric |
| `thematic_map` | bản đồ tô màu theo quantile |
| `spatial_alert` | cảnh báo theo không gian |

Widget config thường gồm:

```json
{
  "widgetType": "ranking",
  "dataSourceConfig": {
    "aggregation": "top",
    "metricField": "loi_nhuan",
    "displayFields": ["ten_vung", "loai_vung", "loi_nhuan"],
    "sort": { "field": "loi_nhuan", "direction": "desc" },
    "limit": 5
  },
  "displayConfig": {
    "unit": "triệu đồng/năm",
    "showMedal": true,
    "showProgressBar": true
  }
}
```

## 9. Advanced Query Builder

Dashboard Widget Form có hai chế độ:

| Chế độ | Dùng khi |
|---|---|
| Basic | widget đơn giản, chọn nguồn, metric, dimension, sort, limit |
| Advanced | cần filter, having, formula, preview, ranking, time intelligence |

Advanced Query Config được lưu trong `dataSourceConfig.advancedQuery`, đồng thời adapter frontend chuyển ngược về các field legacy (`datasetId`, `viewId`, `layerId`, `aggregation`, `metricField`, `dimensionField`, `filters`, `sort`, `limit`) để backend và renderer cũ vẫn chạy.

Các phần chính:

- **Nguồn dữ liệu**: Dataset, Saved View hoặc Layer.
- **Group by**: trường phân nhóm, ví dụ “Loại vùng”.
- **Metric**: trường số, ví dụ “Lợi nhuận”.
- **Aggregation**: `count`, `sum`, `avg`, `min`, `max`, `top`.
- **Filter trước tổng hợp**: lọc record trước khi aggregate.
- **Having filter sau tổng hợp**: lọc kết quả sau khi group/aggregate.
- **Formula**: tạo metric tính toán từ field số, không dùng `eval`.
- **Query preview**: xem kết quả trước khi lưu widget.
- **Ranking Builder**: cấu hình top ranking, name field, type field, unit.
- **Time intelligence**: lọc hôm nay/tuần này/tháng này/quý này/năm nay/7-30-90 ngày gần nhất/custom và so sánh KPI.

Ví dụ Top 5 vùng lợi nhuận cao nhất:

```text
Source: Dataset Lợi nhuận các vùng
Dimension: Loại vùng
Metric: Lợi nhuận
Aggregation: sum
Sort: Lợi nhuận desc
Limit: 5
```

Ví dụ formula:

```text
Lợi nhuận/ha = loi_nhuan / dien_tich
```

Khi formula bật:

```json
{
  "select": {
    "aggregation": "avg",
    "metricField": "__formula",
    "dimensionField": "loai_vung"
  },
  "formula": {
    "enabled": true,
    "label": "Lợi nhuận/ha",
    "unit": "triệu đồng/ha",
    "expression": "loi_nhuan / dien_tich",
    "fields": ["loi_nhuan", "dien_tich"]
  }
}
```

Formula evaluator backend chỉ cho phép field whitelist, số, `+`, `-`, `*`, `/`, ngoặc. Không dùng JavaScript `eval`.

## 10. Map Analytics

Map Analytics V1 bổ sung các widget GIS chạy bằng PostGIS.

| Widget | Ý nghĩa | Renderer |
|---|---|---|
| `spatial_summary` | thống kê source layer theo zone layer | list summary |
| `spatial_ranking` | top khu vực theo metric | dùng Ranking renderer |
| `thematic_map` | bản đồ tô màu 5 mức theo quantile | mini thematic map |
| `spatial_alert` | cảnh báo/vấn đề theo khu vực | dựa trên Alert Center |

Các function PostGIS được dùng:

- `ST_Within`;
- `ST_Intersects`;
- `ST_Contains`.

Nguyên tắc:

- không hard-code dữ liệu nông nghiệp;
- layer nguồn có thể là point, line hoặc polygon;
- layer phân vùng phải là polygon;
- field/layer id phải thuộc tenant;
- metricField/zoneLabelField phải được validate theo metadata;
- nếu `metricAggregation != count` thì `metricField` bắt buộc.

Ví dụ:

```text
Layer nguồn: Công trình xã hội
Layer phân vùng: Ấp
Metric: count
Kết quả:
Ấp A ............ 12
Ấp B ............ 9
Ấp C ............ 5
```

Thematic map dùng quantile 5 mức:

- Rất thấp;
- Thấp;
- Trung bình;
- Cao;
- Rất cao.

Nếu tất cả giá trị bằng nhau, renderer vẫn tô một màu ổn định để tránh `NaN`.

## 11. Dashboard workflow mẫu

Ví dụ tạo dashboard phân tích lợi nhuận vùng sản xuất:

1. Tạo layer **Vùng lúa**.
2. Cấu hình field: `ten_vung`, `loai_vung`, `dien_tich`, `loi_nhuan`, geometry polygon.
3. Import dữ liệu Excel/GeoJSON.
4. Tạo Saved View **Lợi nhuận lúa**.
5. Tạo thêm các Saved View **Lợi nhuận thủy sản**, **Lợi nhuận hoa màu** nếu có nguồn khác.
6. Tạo Dataset **Lợi nhuận các vùng** với fields chuẩn: `loai_vung`, `loi_nhuan`, `dien_tich`.
7. Tạo widget:
   - KPI tổng lợi nhuận;
   - Ranking top vùng;
   - Pie theo loại vùng;
   - Alert Center;
   - MiniMap.
8. Sắp xếp layout trong Dashboard Builder.
9. Preview từng widget.
10. Publish dashboard.

Sau khi publish, dashboard read-only được render ở route dashboard published hoặc trang tổng quan hiện hành tùy cấu hình frontend.

## 12. Style layer/icon động

Layer hỗ trợ style theo metadata:

- style một màu cho toàn layer;
- style polygon/line/point theo giá trị field;
- point icon rule theo field value;
- legend động;
- upload icon layer;
- fallback style nếu value chưa có rule.

Ví dụ style polygon theo `loai_vung`:

```json
{
  "styleMode": "by_value",
  "styleField": "loai_vung",
  "styleRules": [
    {
      "value": "lua",
      "label": "Lúa",
      "fillColor": "#22c55e",
      "strokeColor": "#166534"
    },
    {
      "value": "thuy_san",
      "label": "Thủy sản",
      "fillColor": "#38bdf8",
      "strokeColor": "#0369a1"
    }
  ]
}
```

Raw value dùng cho MapLibre expression; label dùng cho legend/tooltip.

## 13. Relationship / Sub-layer

Relationship dùng khi record của layer này tham chiếu record layer khác.

Ví dụ:

```text
Layer Hợp tác xã
  └── Sub-layer Sản phẩm OCOP
```

Quan hệ:

- **one-to-many**: một hợp tác xã có nhiều sản phẩm OCOP;
- **many-to-one**: mỗi sản phẩm OCOP thuộc một hợp tác xã.

Sub-layer thường:

- không hiện độc lập trên map/sidebar;
- dùng trong record detail, import hoặc thống kê;
- có thể không có geometry riêng;
- dùng relationship field để tìm record cha.

Khi import relationship, hệ thống resolve theo target layer và lookup field. Không lưu text label rời rạc nếu metadata đã mô tả relationship.

## 14. Các API quan trọng

Tất cả endpoint dưới đây có prefix `/api`.

| Method | Endpoint | Mục đích |
|---|---|---|
| `GET` | `/api/layers` | danh sách layer public/map catalog |
| `GET` | `/api/layers/admin` | danh sách layer cho admin |
| `POST` | `/api/layers` | tạo layer |
| `GET` | `/api/layers/:id/geojson` | GeoJSON của layer |
| `GET` | `/api/layers/:id/schema` | schema published |
| `GET` | `/api/layers/:id/schema/draft` | schema draft |
| `POST` | `/api/layers/:layerId/imports/upload` | upload Excel/CSV theo layer |
| `POST` | `/api/layers/:layerId/imports/:importId/preview` | preview import layer |
| `POST` | `/api/layers/:layerId/imports/:importId/execute` | execute import layer |
| `POST` | `/api/layers/:layerId/geojson-import/upload` | upload GeoJSON |
| `POST` | `/api/layers/:layerId/geojson-import/preview` | preview GeoJSON import |
| `POST` | `/api/layers/:layerId/geojson-import/execute` | execute GeoJSON import |
| `POST` | `/api/imports/upload` | upload import theo template legacy |
| `GET` | `/api/saved-views` | danh sách Saved View |
| `POST` | `/api/saved-views/preview` | preview Saved View |
| `POST` | `/api/saved-views` | tạo Saved View |
| `GET` | `/api/datasets` | danh sách Dataset |
| `POST` | `/api/datasets/preview` | preview Dataset |
| `POST` | `/api/datasets` | tạo Dataset |
| `POST` | `/api/analytics/query` | query analytics trực tiếp |
| `POST` | `/api/analytics/preview` | preview analytics từ widget config |
| `GET` | `/api/dashboards` | danh sách dashboard |
| `GET` | `/api/dashboards/data-sources` | nguồn dữ liệu widget builder |
| `GET` | `/api/dashboards/published/current` | dashboard published hiện hành |
| `GET` | `/api/dashboards/:id` | dashboard published theo id |
| `GET` | `/api/dashboards/:id/draft` | dashboard draft |
| `PATCH` | `/api/dashboards/:id/draft` | cập nhật draft/widgets/layout |
| `POST` | `/api/dashboards/:id/publish` | publish dashboard |
| `POST` | `/api/assets/layer-icons/upload` | upload icon layer |

Một số API cần JWT. Frontend tự gửi token từ `lib/auth/token.ts`.

## 15. Lỗi thường gặp

### Database does not exist

Kiểm tra Docker đang chạy:

```bash
cd gis_be
docker compose --env-file .env.local ps
```

Nếu DB local có thể reset:

```bash
docker compose --env-file .env.local down -v
docker compose --env-file .env.local up -d postgres redis minio
npm run db:migrate
npm run db:seed
```

Không dùng `down -v` nếu cần giữ dữ liệu.

### Port 5434/5435 bị chiếm

Tìm process:

```bash
lsof -i :5435
```

Đổi port trong `.env.local`:

```env
DATABASE_PORT=5436
DATABASE_URL=postgresql://postgres:postgres@localhost:5436/gis_ngocto
```

Sau đó chạy lại:

```bash
docker compose --env-file .env.local up -d postgres
```

### MinIO port 9000/9002 bị chiếm

Đổi port:

```env
MINIO_PORT=9002
MINIO_CONSOLE_PORT=9003
```

Nếu đã có container cũ:

```bash
docker compose --env-file .env.local down
docker compose --env-file .env.local up -d minio
```

### Map vẫn zoom Long Bình hoặc địa bàn cũ

Kiểm tra lần lượt:

1. `gis_be/.env.local` có đúng `WARD_*`.
2. Đã restart backend sau khi đổi env.
3. Đã seed/migrate DB đúng tenant.
4. `GET /api/layers` trả `project.mapView` đúng center/bounds.
5. `GET /api/layers/administrative-boundary/metadata` trả đúng `boundaryEndpoint`.
6. `WARD_BOUNDARY_MATCH_PROPERTY` và `WARD_BOUNDARY_MATCH_VALUE` match được feature trong `gis_be/data/ward-boundaries/can-tho.geojson`.

### Frontend lỗi cache Next.js

```bash
cd gis_fe
rm -rf .next
npm run dev
```

### Module not found trong backend `dist`

```bash
cd gis_be
rm -rf dist
npm run build
npm run start:dev
```

### Widget không có dữ liệu

Kiểm tra:

- widget đang dùng `layerId`, `viewId` hay `datasetId`;
- source có record không;
- `metricField` đúng field số không;
- `dimensionField` đúng field nhóm không;
- filter/time filter có loại hết dữ liệu không;
- having filter có quá chặt không;
- formula có chia 0 hoặc field sai không;
- geometry có tồn tại nếu là spatial widget không;
- thử gọi `/api/analytics/preview` bằng payload widget.

### Advanced widget lưu được nhưng backend không hiểu

Frontend phải gọi adapter `advancedQueryToDataSourceConfig` trước khi POST `/api/analytics/preview`. Kiểm tra payload đã có legacy fields tương đương chưa:

- `datasetId` / `viewId` / `layerId`;
- `aggregation`;
- `metricField`;
- `dimensionField`;
- `filters`;
- `sort`;
- `limit`.

### Minimap không hiện boundary

Kiểm tra:

1. `GET /api/layers/administrative-boundary` có trả GeoJSON không.
2. `MapPageContent` trong MiniMap có nhận `boundary`/`boundaryError` không.
3. Frontend helper `getAdministrativeBoundary()` có trỏ đúng endpoint không.
4. `project.mapView.boundaryEndpoint` hoặc boundary metadata không bị sai.
5. Layer boundary có geometry polygon/multipolygon hợp lệ.

### Import lỗi relationship

Kiểm tra:

- target layer có record cha chưa;
- lookup field có unique/giá trị đúng không;
- cột Excel/CSV có trim khoảng trắng chưa;
- dictionary option có tồn tại chưa;
- user có quyền admin nếu tạo relationship field mới.

### Spatial widget báo không có dữ liệu giao nhau

Kiểm tra:

- source layer có geometry không;
- zone layer là polygon không;
- dữ liệu cùng hệ tọa độ/SRID không;
- source và zone thật sự giao nhau;
- `zoneLabelField` và `metricField` là field hợp lệ trong metadata.

## 16. Build production

### Backend

```bash
cd gis_be
npm install
npm run build
npm run start:prod
```

Backend production vẫn cần `.env`/`.env.local` đúng database, Redis, MinIO, JWT secret và boundary.

### Frontend

```bash
cd gis_fe
npm install
npm run build
npm run start
```

Frontend production mặc định chạy port `5001` theo script `next start -p 5001`.

## 17. Quy ước phát triển

- Không hard-code tên xã/layer nếu metadata có thể mô tả.
- Ưu tiên Layer + Field + Saved View + Dataset trước khi tạo module riêng.
- Raw field key dùng cho query/import/filter/sort.
- Label dùng cho UI/chart/tooltip/table.
- Dictionary value cần normalize trim/collapse/lowercase khi so sánh trùng.
- Widget cũ phải backward-compatible với `layerId` và config legacy.
- Mọi thay đổi dashboard/widget phải build FE pass.
- Nếu sửa backend, build BE pass.
- Không dùng `eval` cho formula.
- Spatial analytics phải dùng PostGIS.
- Không xử lý spatial join phức tạp bằng JavaScript.
- Không xóa file import nếu file đó là asset thật đang được record/layer dùng.

## 18. Checklist khi clone sang xã mới

1. Duplicate repo hoặc tạo branch riêng.
2. Đổi tên database/container nếu chạy song song nhiều xã.
3. Cập nhật `gis_be/.env.local`.
4. Đổi `DATABASE_NAME`, `DATABASE_PORT`, `DATABASE_URL`.
5. Đổi `MINIO_BUCKET`, `MINIO_PORT`, `MINIO_CONSOLE_PORT` nếu cần.
6. Cập nhật `WARD_NAME`, `WARD_CODE`, `WARD_DISTRICT`, `WARD_PROVINCE`.
7. Chuẩn bị GeoJSON boundary trong `gis_be/data/ward-boundaries/`.
8. Cập nhật `WARD_BOUNDARY_*` để match đúng feature.
9. Reset DB local nếu là môi trường mới.
10. Chạy `npm run db:migrate`.
11. Chạy `npm run db:seed`.
12. Kiểm tra `GET /api/layers`.
13. Kiểm tra `GET /api/layers/administrative-boundary`.
14. Mở frontend và kiểm tra map center/bounds.
15. Tạo/import layer dữ liệu xã mới.
16. Tạo Saved View.
17. Tạo Dataset nếu cần hợp nhất.
18. Tạo Dashboard/Widget.
19. Preview widget.
20. Publish dashboard.

## 19. Roadmap

Đã có trong source hiện tại:

- Metadata layer;
- dynamic field/schema;
- Excel/CSV/GeoJSON import;
- point/line/polygon/sub-layer;
- Saved View;
- Dataset Builder;
- Query Engine;
- Advanced Query Builder;
- filter/having;
- formula builder;
- query preview;
- ranking builder;
- time intelligence;
- alert center widget;
- map analytics widgets;
- dynamic dashboard/widgets;
- dynamic style/icon theo giá trị;
- MiniMap widget.

Sắp tới:

- Dashboard Template Engine;
- AI Builder.

Roadmap chỉ là định hướng. Khi phát triển tiếp, luôn kiểm tra entity, DTO, service, controller và API client thực tế trước khi kết luận một tính năng đã có đủ runtime.
