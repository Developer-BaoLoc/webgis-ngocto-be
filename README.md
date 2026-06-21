# WebGIS động đa xã/phường

Tài liệu onboarding chính thức dành cho quản trị viên, lập trình viên và AI Agent (Cursor, Claude Code, Copilot, GPT...). README này mô tả cách hệ thống tổ chức dữ liệu, tạo lớp bản đồ, hợp nhất dữ liệu và xây dựng dashboard mà không cần viết module riêng cho từng nghiệp vụ.

> Phạm vi source: backend nằm trong `gis_be`; frontend nằm trong repository/thư mục song song `../gis_fe`.

## Mục lục

1. [Giới thiệu hệ thống](#1-giới-thiệu-hệ-thống)
2. [Triết lý thiết kế](#2-triết-lý-thiết-kế)
3. [Kiến trúc tổng thể](#3-kiến-trúc-tổng-thể)
4. [Luồng dữ liệu quan trọng nhất](#4-luồng-dữ-liệu-quan-trọng-nhất)
5. [Layer](#5-layer-lớp-dữ-liệu)
6. [Field](#6-field-trường-dữ-liệu)
7. [Import dữ liệu](#7-import-dữ-liệu)
8. [Saved View](#8-saved-view-khung-nhìn-đã-lưu)
9. [Dataset](#9-dataset-bộ-dữ-liệu)
10. [Query Engine](#10-analytics-query-engine)
11. [Widget](#11-widget)
12. [Dashboard](#12-dashboard)
13. [Dashboard Builder](#13-dashboard-builder)
14. [Styling Layer](#14-styling-layer)
15. [Dynamic Filter](#15-dynamic-filter)
16. [Cấu trúc thư mục](#16-cấu-trúc-thư-mục)
17. [Database](#17-database)
18. [Chạy dự án](#18-chạy-dự-án)
19. [Quy trình tạo xã/phường mới](#19-quy-trình-tạo-xãphường-mới)
20. [AI Agent Notes](#20-ai-agent-notes)
21. [Roadmap](#21-roadmap)
22. [FAQ](#22-faq)

---

## 1. Giới thiệu hệ thống

Đây là nền tảng WebGIS metadata-driven phục vụ nhiều xã/phường. Hệ thống quản lý đồng thời dữ liệu thuộc tính, dữ liệu không gian, biểu mẫu, bản đồ, thống kê và dashboard điều hành.

Chuỗi kiến trúc cốt lõi:

```text
Layer → Saved View → Dataset → Query Engine → Widget → Dashboard
```

| Tầng | Vai trò |
|---|---|
| **Layer** | Định nghĩa một loại đối tượng nghiệp vụ, schema field, geometry và style bản đồ. |
| **Saved View** | Lưu một cách nhìn có filter, sort và các field được chọn trên dữ liệu layer. Không sao chép record. |
| **Dataset** | Bảng ảo chuẩn hóa và hợp nhất một hoặc nhiều Saved View. |
| **Query Engine** | Truy vấn record hoặc tính `count`, `sum`, `avg`, `min`, `max`, `top`. |
| **Widget** | Trình bày kết quả truy vấn dưới dạng KPI, biểu đồ, bảng, timeline, lịch hoặc tiến độ. |
| **Dashboard** | Ghép nhiều widget thành màn hình điều hành có layout kéo thả, resize và publish. |

Một xã có thể quản lý vùng lúa, thủy lợi, hợp tác xã và cảnh báo. Xã khác có thể có schema hoàn toàn khác nhưng vẫn dùng chung codebase vì khác biệt được lưu trong metadata và database.

## 2. Triết lý thiết kế

### Metadata-driven architecture

Schema nghiệp vụ không bị đóng cứng trong component React hoặc class TypeScript. Layer, field, dictionary, relationship, style, filter và cấu hình dashboard đều là metadata.

Admin có thể thực hiện mà không cần viết code:

- tạo layer và sub layer;
- thêm hoặc chỉnh field;
- cấu hình dictionary/select và relationship;
- import Excel, CSV, GeoJSON;
- tạo Saved View;
- hợp nhất Saved View thành Dataset;
- tạo widget và dashboard;
- publish dashboard lên trang Tổng quan.

### Nguyên tắc phát triển

1. Không tạo module riêng chỉ vì xuất hiện một loại dữ liệu mới như “Vùng lúa” hay “Ao nuôi”.
2. Ưu tiên mở rộng metadata và renderer dùng chung.
3. Raw key/raw value dùng cho lưu trữ, query, filter và sort; label dùng cho giao diện.
4. Không sao chép dữ liệu khi Saved View hoặc Dataset có thể biểu diễn bằng cấu hình.
5. Luôn giữ tương thích `layerId`, `viewId`, `datasetId` trong widget cũ và mới.
6. Mọi dữ liệu phải được cô lập theo tenant.

## 3. Kiến trúc tổng thể

```text
┌──────────────────────────────────────────────────────────────┐
│ Frontend: Next.js + React + MapLibre + react-grid-layout    │
│ Map, Admin, Import, Saved View, Dataset, Widget, Dashboard   │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST API / JSON / GeoJSON
┌───────────────────────────▼──────────────────────────────────┐
│ Backend: NestJS                                             │
│ Auth · Metadata · Records · Import · Analytics · Dashboard  │
└──────────────┬──────────────────┬──────────────────┬─────────┘
               │                  │                  │
       ┌───────▼──────┐   ┌───────▼──────┐   ┌──────▼───────┐
       │ PostgreSQL   │   │ Redis/BullMQ │   │ MinIO        │
       │ + PostGIS    │   │ jobs/queue   │   │ object files │
       └──────────────┘   └──────────────┘   └──────────────┘
```

### Frontend

- **Next.js 16 / React 19**: routing, giao diện quản trị và trang ứng dụng.
- **MapLibre GL JS**: render GeoJSON/vector data, popup, filter, icon và style expression.
- **react-grid-layout**: kéo thả, resize và responsive layout cho Dashboard Builder.
- **Tailwind CSS và IOC CSS**: design system quản trị và dashboard điều hành.
- **API clients trong `lib/api`**: lớp duy nhất giao tiếp backend; component không nên tự ghép URL tùy ý.

### Backend

- **NestJS**: REST API, authentication, validation, nghiệp vụ metadata/import/analytics.
- **TypeORM**: truy cập entity và transaction.
- **PostgreSQL**: lưu tenant, metadata, record, cấu hình và revisions.
- **PostGIS**: lưu geometry, spatial index và truy vấn không gian.
- **Redis + BullMQ**: hàng đợi cho tác vụ nền/import khi triển khai async.
- **MinIO**: object storage cho attachment, icon và ảnh thật. File import tạm thuộc luồng riêng, không được nhầm với asset đang sử dụng.

## 4. Luồng dữ liệu quan trọng nhất

```text
Layer (schema + geometry + style)
  │
  ▼
Feature Records (properties JSONB + geometry PostGIS)
  │
  ▼
Saved View (filter + sort + selected fields)
  │
  ▼
Dataset (normalized fields + source mappings + constants)
  │
  ▼
Analytics Query Engine (records / count / sum / avg / min / max / top)
  │
  ▼
Widget (KPI / chart / ranking / table / timeline / progress...)
  │
  ▼
Dashboard (responsive layout → draft → published → Tổng quan)
```

1. **Layer** định nghĩa record hợp lệ trông như thế nào.
2. **Feature Records** là dữ liệu thật sau khi nhập hoặc chỉnh sửa.
3. **Saved View** chọn một tập con logic của layer mà không nhân bản record.
4. **Dataset** đổi nhiều nguồn khác schema về cùng bộ field chuẩn hóa.
5. **Query Engine** đọc một trong ba nguồn và trả về kết quả thống kê hoặc rows.
6. **Widget** chuyển kết quả thành giao diện có label và format dễ đọc.
7. **Dashboard** lưu nhiều widget cùng layout; chỉ dashboard Published hiện hành được render ở Tổng quan.

## 5. Layer (Lớp dữ liệu)

Layer là đơn vị metadata trung tâm. Một layer có mã, tên, tenant, schema version, geometry kind, style config và nhiều feature record.

### Các loại layer

| Loại | Ví dụ | Geometry thường dùng |
|---|---|---|
| **Point** | Hợp tác xã, công trình thủy lợi, trạm bơm | `Point`/`MultiPoint` |
| **Line** | Tuyến thủy lợi, sông, kênh | `LineString`/`MultiLineString` |
| **Polygon** | Vùng lúa, vùng nuôi thủy sản, vùng hoa màu | `Polygon`/`MultiPolygon` |
| **Sub Layer** | Sản phẩm OCOP trực thuộc hợp tác xã | thường không có geometry độc lập; liên kết record cha |

### `geometryType` và `geometryKind`

- `geometryType` là khái niệm giao diện/cấu hình: `point`, `line`, `polygon`, `sub_layer`.
- `geometryKind` là phân loại lưu trong layer để backend kiểm tra geometry thực tế và chọn cách xử lý bản đồ.
- Một field geometry bổ sung có thể mang kiểu point/line/polygon, nhưng geometry chính của feature vẫn phải phù hợp geometry kind của layer.

Không giả định mọi layer đều có geometry. Sub layer phù hợp cho dữ liệu con như sản phẩm, thành viên hoặc hạng mục gắn với record cha.

## 6. Field (Trường dữ liệu)

Field mô tả một cột logic của feature. Mỗi field có tối thiểu: `code`/storage key, label, field type, thứ tự, trạng thái và schema cấu hình.

| Nhóm hiển thị | Kiểu nội bộ thường gặp | Ý nghĩa |
|---|---|---|
| Text | `text`, `textarea` | Chuỗi ngắn hoặc nội dung dài. |
| Number | `number`, `integer`, `decimal`, `quantity`, `measurement` | Số dùng để tính toán; có thể kèm đơn vị. |
| Currency | `currency`, `money` | Giá trị tiền tệ và đơn vị tiền. |
| Date | `date`, `datetime` | Ngày hoặc thời điểm. |
| Boolean | `boolean` | Đúng/sai. |
| Select | `select`, `category`, `multi_category` | Giá trị thuộc dictionary hoặc danh sách lựa chọn. |
| Relationship | `relationship` | Tham chiếu record của layer khác. |
| Point | `lat_lng`, point geometry | Tọa độ/điểm. |
| Line | `line` | Hình học tuyến. |
| Polygon | `area_polygon` | Hình học vùng. |

### Field metadata

- **`code` / `storageKey`**: khóa ổn định dùng trong JSON, query và import; không đổi tùy tiện.
- **`label`**: tên dễ đọc trên form, bảng, chart và tooltip.
- **`fieldType`**: quyết định validator, editor, filter và khả năng dùng làm metric/dimension.
- **`dataSchema`**: constraint, dictionary, unit, relationship target, precision hoặc quy tắc dữ liệu.
- **`uiSchema`**: gợi ý control, placeholder và cách nhập.
- **`displaySchema`**: format hiển thị.
- **schema version**: snapshot field theo phiên bản để publish thay đổi an toàn.

Field số thường dùng làm `metricField`; text/select/boolean/date thường dùng làm `dimensionField`.

## 7. Import dữ liệu

Hệ thống hỗ trợ:

- Excel (`.xlsx`, `.xls`);
- CSV;
- GeoJSON.

```text
Upload file
  → đọc header/geometry
  → mapping cột nguồn với field
  → normalize + validation
  → resolve dictionary/relationship
  → import
  → Feature Records
```

### Quy trình

1. Chọn layer đích và upload file.
2. Backend/frontend đọc cấu trúc file và đề xuất mapping.
3. Admin map cột nguồn vào field có sẵn hoặc tạo field mới nếu workflow cho phép.
4. Validator chuẩn hóa số, tiền, ngày, category và geometry.
5. Dòng lỗi được báo kèm vị trí; dữ liệu hợp lệ được tạo thành feature.
6. File import tạm được xóa sau import thành công. File lỗi được giữ để debug và có script `npm run cleanup:imports` dọn file cũ.

### Relationship mapping

Relationship không lưu label hiển thị như một chuỗi rời rạc. Importer dùng giá trị khóa/field lookup để tìm record cha và lưu liên kết đúng định danh.

Ví dụ **Sản phẩm OCOP** là sub layer của **Hợp tác xã**:

```text
Cột Excel "Hợp tác xã" = "HTX Nông nghiệp A"
  → lookup field tên/mã trong layer Hợp tác xã
  → tìm feature cha
  → lưu relationship của sản phẩm OCOP tới feature cha
```

Tùy cấu hình, trường hợp không tìm thấy có thể báo lỗi, bỏ qua hoặc tạo record cha. Không tự suy đoán relationship bằng SQL thủ công nếu metadata đã mô tả target và lookup field.

## 8. Saved View (Khung nhìn đã lưu)

Saved View là truy vấn đã lưu trên một layer. Nó chứa:

- filter;
- sort;
- selected fields/display fields;
- tên và mô tả phục vụ tái sử dụng.

Saved View **không sao chép dữ liệu**. Khi record gốc thay đổi, kết quả Saved View thay đổi theo.

Ví dụ layer **Vùng lúa** có các Saved View:

- **Lúa 1 vụ**: `loai_hinh_canh_tac = lua_1_vu`;
- **Lúa 2 vụ**: `loai_hinh_canh_tac = lua_2_vu`;
- **Lúa - tôm**: `loai_hinh_canh_tac = lua_tom`.

Dùng Saved View khi cần một lát cắt có thể đặt tên, dùng lại trong Dataset hoặc Widget, nhưng vẫn giữ chung một nguồn record.

## 9. Dataset (Bộ dữ liệu)

Dataset là bảng ảo hợp nhất nhiều Saved View thành một schema chuẩn hóa. Dataset hữu ích khi các layer hoặc view có ý nghĩa tương đồng nhưng field key khác nhau.

Ví dụ Dataset **Tổ chức kinh tế**:

```text
Nguồn HTX                    Nguồn THT
ten_htx ───────────┐         ten_to ──────────┐
doanh_thu ───────┐ │         doanh_so ──────┐ │
                 ▼ ▼                         ▼ ▼
Schema chuẩn: name | source_type | revenue | profit
```

| Field chuẩn | Nguồn HTX | Nguồn THT |
|---|---|---|
| `name` | map `ten_htx` | map `ten_to` |
| `source_type` | constant `htx` | constant `tht` |
| `revenue` | map `doanh_thu` | map `doanh_so` |
| `profit` | map `loi_nhuan` | map `lai_rong` |

### Khái niệm chính

- **Normalized field**: field chung đầu ra của Dataset.
- **Source mapping**: field nào của Saved View đổ vào field chuẩn.
- **Constant field**: gán cùng một giá trị cho toàn bộ dòng của một nguồn, ví dụ `source_type = htx`.
- **Preview**: chạy thử hợp nhất và xem rows trước khi dùng Dataset trong widget.

Dataset không thay đổi raw record và không yêu cầu migration tạo bảng nghiệp vụ mới.

## 10. Analytics Query Engine

Query Engine dùng chung cho ba nguồn:

- `layerId`: tương thích layer trực tiếp/legacy;
- `viewId`: truy vấn Saved View;
- `datasetId`: truy vấn bảng ảo đã chuẩn hóa.

Các phép tổng hợp chính:

- `count`: đếm record;
- `sum`: tổng metric;
- `avg`: trung bình;
- `min`: nhỏ nhất;
- `max`: lớn nhất;
- `top`: xếp hạng theo metric;
- `records`: trả rows cho table/timeline/calendar/progress.

Ví dụ payload thống kê lợi nhuận theo loại vùng:

```json
{
  "datasetId": "<dataset-uuid>",
  "aggregation": "sum",
  "metricField": "loi_nhuan_trieu_dong_nam",
  "dimensionField": "loai_vung",
  "limit": 3,
  "sort": {
    "field": "loi_nhuan_trieu_dong_nam",
    "direction": "desc"
  }
}
```

Query/filter/sort luôn dùng raw key và raw value. Renderer dùng field metadata/dictionary để đổi thành label dễ đọc.

## 11. Widget

Widget là cấu hình trình bày, không phải một bảng dữ liệu mới. Widget giữ `widgetType`, `dataSourceConfig`, `displayConfig` và `layoutConfig`.

### Widget tổng hợp và trình bày

| Widget | Mục đích |
|---|---|
| **KPI / Stat** | Một số lớn, icon, subtitle và accent; ví dụ tổng diện tích. |
| **Bar / Column** | So sánh metric giữa các nhóm. |
| **Pie / Donut** | Cơ cấu nhóm, legend giá trị và tỷ lệ. |
| **Ranking / Top** | Xếp hạng có badge và progress bar. |
| **Table** | Rows với header/format theo field metadata. |
| **Timeline** | Sự kiện có ngày bắt đầu/kết thúc và trạng thái. |
| **Calendar** | Công việc hôm nay, sắp tới, quá hạn, đã xong. |
| **Progress** | Tiến độ phần trăm theo hạng mục. |
| **Milestone** | Kết quả chương trình và các chỉ số phụ. |
| **Activity History** | Lịch sử cảnh báo/hoạt động theo thời gian và mức độ. |

### Metric và dimension

- `metricField`: field số được tính, ví dụ `dien_tich_ha`, `loi_nhuan_trieu_dong_nam`.
- `dimensionField`: field phân nhóm, ví dụ `loai_vung`, `khu_vuc`, `trang_thai`.

Ví dụ:

```text
KPI:       SUM(dien_tich_ha)
Bar:       SUM(loi_nhuan) GROUP BY loai_vung
Pie:       COUNT(*) GROUP BY trang_thai
Ranking:   TOP SUM(loi_nhuan) GROUP BY loai_vung LIMIT 5
```

Widget phải ưu tiên label từ Dataset/Saved View/Layer metadata. Raw code như `loai_vung` hoặc `thuy_san` không nên xuất hiện trên UI nếu có label.

## 12. Dashboard

Dashboard là tập hợp nhiều widget và layout responsive.

Ví dụ **Dashboard Nông nghiệp**:

- Tổng diện tích sản xuất — KPI;
- Cơ cấu loại hình canh tác — Donut;
- Top lợi nhuận theo loại vùng — Ranking;
- Lịch gieo sạ — Calendar;
- Tiến độ chương trình trọng điểm — Progress.

Mỗi widget có `layoutConfig` gồm `x`, `y`, `w`, `h`. Builder dùng lưới 12 cột desktop, 8 cột tablet và 4 cột mobile.

Dashboard có revision draft/published. Chỉ một dashboard trong tenant được Published tại một thời điểm. Khi publish dashboard mới, dashboard Published trước được chuyển về Draft trong transaction. Trang Tổng quan gọi dashboard Published hiện hành và render read-only: không drag, không resize.

## 13. Dashboard Builder

Workflow khuyến nghị:

```text
Tạo Layer/Field
  → Import Feature Records
  → Tạo Saved View
  → Tạo Dataset nếu cần hợp nhất
  → Tạo Widget
  → Sắp xếp Dashboard
  → Lưu draft
  → Publish
```

### Khi nào bỏ qua một tầng?

- Widget đơn giản trên toàn layer: có thể dùng `layerId`.
- Cần filter/sort/field selection dùng lại: tạo Saved View và dùng `viewId`.
- Cần hợp nhất nhiều nguồn: tạo Dataset và dùng `datasetId`.

Builder phải merge layout vào widget hiện có, không được làm mất `dataSourceConfig`, `displayConfig`, `viewId`, `datasetId` hoặc `layerId`.

## 14. Styling Layer

Layer hỗ trợ hai chế độ:

1. **Một màu duy nhất** (`single`): mọi feature dùng chung style.
2. **Theo giá trị thuộc tính** (`by_value`): MapLibre dùng expression `match` trên raw property.

Ví dụ Vùng lúa:

```json
{
  "geometryType": "polygon",
  "styleMode": "by_value",
  "styleField": "loai_hinh_canh_tac",
  "styleRules": [
    {
      "value": "lua_1_vu",
      "label": "Lúa 1 vụ",
      "fillColor": "#ef4444",
      "strokeColor": "#991b1b"
    },
    {
      "value": "lua_2_vu",
      "label": "Lúa 2 vụ",
      "fillColor": "#22c55e",
      "strokeColor": "#166534"
    },
    {
      "value": "lua_tom",
      "label": "Lúa - tôm",
      "fillColor": "#f59e0b",
      "strokeColor": "#92400e"
    }
  ],
  "fallbackStyle": {
    "fillColor": "#94a3b8",
    "strokeColor": "#475569"
  }
}
```

Polygon áp dụng màu fill và stroke; line áp dụng line color; point mặc định áp dụng circle color. Marker dùng icon upload vẫn giữ icon, không bị tô màu hoặc xóa nhầm. Legend chỉ xuất hiện khi layer đang bật và dùng `label` của rule để hiển thị.

## 15. Dynamic Filter

Filter trên bản đồ được sinh từ metadata của các layer đang bật:

```text
Visible Layers
  → Published fields + dictionaries
  → Quick Filters / Tất cả bộ lọc
  → filter state
  → MapLibre filter / API query
```

- **Quick Filters**: các điều kiện thường dùng, truy cập nhanh.
- **Tất cả bộ lọc**: toàn bộ field có khả năng filter của layer đang bật.
- Field label lấy từ schema metadata.
- Option label lấy từ dictionary hoặc mapping dùng chung.
- Raw field key/value vẫn được gửi vào query để kết quả chính xác.

Filter phải thay đổi theo layer đang hiển thị, không hard-code tên xã hoặc tên layer nghiệp vụ.

## 16. Cấu trúc thư mục

### Backend — `gis_be`

```text
gis_be/
├── src/
│   ├── analytics/       # Query Engine cho layer/view/dataset
│   ├── auth/            # JWT, guards, strategies
│   ├── dashboards/      # dashboard revisions, widgets, publish
│   ├── datasets/        # dataset config, mappings, preview
│   ├── dictionaries/    # danh mục và option labels
│   ├── import/          # Excel/CSV/GeoJSON, mapping, validation
│   ├── jobs/            # queue/job infrastructure
│   ├── map/             # dữ liệu phục vụ bản đồ
│   ├── metadata/        # layer, field, schema version, relationship
│   ├── records/         # CRUD feature và field type handlers
│   ├── saved-views/     # filter/sort/selected fields đã lưu
│   ├── ward-boundary/   # ranh giới và cấu hình địa bàn
│   └── database/entities/
├── migrations/          # SQL migrations và runner
├── scripts/             # seed/cleanup/maintenance
├── uploads/imports/     # file import tạm
├── data/ward-boundaries/
└── docker-compose.yml
```

`src/modules/*` chứa một số module nghiệp vụ/legacy. Khi thêm loại dữ liệu mới, trước hết kiểm tra liệu Layer + Field + Saved View đã giải quyết được chưa; không mặc định tạo thêm module ở đây.

### Frontend — `../gis_fe`

```text
gis_fe/
├── app/(app)/
│   ├── ban-do/                  # bản đồ WebGIS
│   ├── import/                  # import dữ liệu
│   ├── dashboards/[id]/         # dashboard published read-only
│   └── quan-tri/
│       ├── lop-du-lieu/         # quản trị layer/schema/style
│       ├── saved-views/         # Saved View Builder
│       ├── datasets/            # Dataset Builder
│       └── dashboard/           # Dashboard Builder
├── components/
│   ├── admin/                   # form/builder quản trị
│   ├── dashboard/               # grid và widget renderers
│   ├── map/                     # MapLibre, popup, filter, legend
│   └── records/                 # form/bảng record động
├── lib/
│   ├── api/                     # typed API clients
│   ├── dashboard/               # layout, format, renderer utilities
│   ├── fields/                  # field/option label utilities
│   └── map/                     # map/style/filter helpers
├── config/ward.config.ts        # cấu hình xã/phường frontend
├── public/data/                 # static/GeoJSON frontend nếu cần
└── types/api/                   # API contracts phía frontend
```

## 17. Database

### Các bảng chính

| Khái niệm | Bảng vật lý | Quan hệ/vai trò |
|---|---|---|
| Tenant | `tenants` | Gốc cô lập dữ liệu theo xã/phường/tổ chức. |
| Layer | `layers` | Thuộc tenant; trỏ schema hiện hành; giữ geometry/style. |
| Layer fields | `fields` | Danh tính ổn định của field. Tên thường gọi “layer_fields”, nhưng bảng thật là `fields`. |
| Field versions | `layer_schema_versions`, `schema_field_versions` | Snapshot schema và field theo phiên bản. |
| Feature records | `features` | Thuộc layer/tenant; properties JSONB và geometry PostGIS. |
| Saved View | `saved_views` | Tham chiếu layer, lưu filter/sort/selected fields. |
| Dataset | `datasets` | Lưu normalized fields và mappings tới Saved View. |
| Widget | `dashboard_widgets` | Widget thuộc một `dashboard_revision`; không có bảng vật lý tên `widgets`. |
| Dashboard | `dashboards` | Metadata và trạng thái draft/published hiện hành. |
| Dashboard revision | `dashboard_revisions` | Layout/filter/version; liên kết nhiều widget. |
| Dictionary | `dictionaries`, `dictionary_items` | Mã và label cho category/select. |
| Import | `import_jobs`, `import_templates`, `job_executions` | Theo dõi import và tác vụ. |
| Asset | `attachments` | Metadata file/icon/image thật. |

### Quan hệ rút gọn

```text
tenants
  ├── layers
  │    ├── fields
  │    ├── layer_schema_versions ── schema_field_versions
  │    ├── features
  │    └── saved_views
  ├── datasets ──(config)── saved_views
  ├── dictionaries ── dictionary_items
  └── dashboards ── dashboard_revisions ── dashboard_widgets
```

`features.properties` linh hoạt theo schema metadata; geometry dùng PostGIS. Không thêm cột SQL riêng cho mỗi field nghiệp vụ trừ khi có quyết định kiến trúc và migration rõ ràng.

## 18. Chạy dự án

### Yêu cầu

- Node.js 20+;
- npm;
- Docker và Docker Compose;
- PostgreSQL client `psql` để chạy migration script.

### Backend

```bash
cd gis_be
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run start:dev
```

Mặc định API chạy tại `http://localhost:4000/api`.

Hạ tầng Docker mặc định:

| Service | Port host | Vai trò |
|---|---:|---|
| PostgreSQL/PostGIS | `5435` | database và spatial data |
| Redis | `6379` | queue/cache infrastructure |
| MinIO API | `9000` | object storage |
| MinIO Console | `9001` | quản trị object storage |

Lệnh hữu ích:

```bash
npm run build
npm test
npm run cleanup:imports
```

Không chạy `docker compose down -v` trên môi trường có dữ liệu cần giữ vì lệnh này xóa volume.

### Frontend

Mở terminal khác:

```bash
cd gis_fe
npm install
npm run dev
```

Frontend mặc định chạy tại `http://localhost:5001`.

Kiểm tra production:

```bash
npm run build
npm run start
```

Đảm bảo biến môi trường frontend trỏ đúng API backend. Không commit `.env` hoặc khóa bí mật.

## 19. Quy trình tạo xã/phường mới

Ví dụ chuyển cấu hình từ **Long Bình** sang **Ngọc Tố**:

1. Clone/duplicate deployment source theo quy ước tổ chức. Ưu tiên dùng cùng code version thay vì tạo fork nghiệp vụ không cần thiết.
2. Tạo PostgreSQL database mới và bật PostGIS.
3. Tạo bucket MinIO riêng nếu cần cô lập asset.
4. Cập nhật `.env` backend: database, tenant mặc định, tên/mã địa bàn và boundary dataset/admin code.
5. Đặt hoặc cập nhật GeoJSON ranh giới trong `gis_be/data/ward-boundaries/`.
6. Cập nhật `gis_fe/config/ward.config.ts` và các biến môi trường frontend.
7. Chạy migration trên database mới.
8. Seed tenant, admin, dictionary và metadata nền phù hợp. Không seed dữ liệu mẫu của xã cũ vào production xã mới.
9. Dùng admin UI tạo/import layer nghiệp vụ.
10. Tạo Saved View → Dataset → Dashboard và publish.
11. Kiểm tra boundary, center/bounds, quyền tenant, map, import và Tổng quan.

Ví dụ biến môi trường backend:

```env
DATABASE_NAME=gis_ngoc_to
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/gis_ngoc_to
MINIO_BUCKET=gis-ngoc-to
WARD_NAME=Ngọc Tố
WARD_CODE=ngoc-to
WARD_BOUNDARY_DATASET=can-tho.geojson
WARD_BOUNDARY_ADMIN_CODE=<ma_xa>
DEFAULT_TENANT_ID=<tenant-uuid>
```

Không hard-code “Long Bình”, “Ngọc Tố” hoặc mã địa bàn trong renderer dùng chung.

## 20. AI Agent Notes

Phần này là chỉ dẫn bắt buộc cho AI Agent khi sửa hoặc mở rộng dự án.

### Workflow chuẩn

Nếu được yêu cầu **“Tạo dashboard”**, hãy suy luận theo thứ tự:

1. Kiểm tra Layer và schema field đã tồn tại chưa.
2. Kiểm tra dữ liệu feature có đủ và đúng type không.
3. Tạo Saved View nếu cần filter, sort hoặc chọn field tái sử dụng.
4. Tạo Dataset nếu cần hợp nhất nhiều Saved View hoặc chuẩn hóa field.
5. Tạo Widget với nguồn `layerId`, `viewId` hoặc `datasetId` phù hợp.
6. Thêm widget vào Dashboard, cấu hình layout, lưu draft và publish.
7. Xác minh dashboard Published được render trên Tổng quan.

```text
ƯU TIÊN: Layer → Saved View → Dataset → Widget → Dashboard
```

Không viết SQL trực tiếp hoặc tạo endpoint riêng chỉ để phục vụ một dashboard nếu Query Engine hiện tại đã hỗ trợ metadata tương đương.

### Checklist trước khi sửa code

- Tìm utility/component hiện có trước khi tạo mới.
- Đọc entity, DTO và API client để xác nhận contract thật.
- Raw field key/value không được đổi khi chỉ sửa label UI.
- Dùng `getFieldLabel`/`getOptionLabel` ở frontend thay vì tạo mapping rải rác.
- Không phá tương thích `layerId`, `viewId`, `datasetId`.
- Không hard-code dữ liệu địa phương vào component dùng chung.
- Không xóa icon/image thật khi dọn file import tạm.
- Khi cập nhật `layoutConfig`, merge widget thay vì thay thế toàn object.
- Publish dashboard phải giữ nguyên draft flow và chỉ có một Published trong tenant.
- Thay đổi database phải có migration an toàn; không sửa schema production bằng thao tác ngẫu hứng.

### Khi thêm một loại dữ liệu mới

Hỏi lần lượt:

1. Có biểu diễn được bằng Layer mới không?
2. Field type/dictionary/relationship hiện có đã đủ chưa?
3. Có cần Saved View thay vì layer mới không?
4. Có cần Dataset để hợp nhất nguồn không?
5. Query Engine đã có aggregation/records phù hợp chưa?

Chỉ tạo module/backend contract mới khi metadata hiện tại thực sự không biểu diễn được yêu cầu.

### Definition of Done cho AI

- Luồng cũ vẫn hoạt động;
- frontend/backend build pass theo phạm vi thay đổi;
- không làm mất config cũ;
- empty/loading/error state không crash;
- tài liệu hoặc type được cập nhật nếu contract thay đổi;
- báo rõ file sửa, cách test và tồn đọng.

## 21. Roadmap

### Module hiện có

- xác thực và phân quyền theo tenant;
- quản trị layer, schema version và dynamic field;
- CRUD feature record và geometry PostGIS;
- import Excel/CSV/GeoJSON, mapping và validation;
- dictionary/category và relationship;
- MapLibre map, popup, dynamic filter, legend và style theo giá trị;
- Saved View Builder;
- Dataset Builder và preview;
- Analytics Query Engine cho layer/view/dataset;
- widget KPI, chart, ranking, table;
- widget timeline, calendar, progress, milestone, activity history;
- Dashboard Builder kéo thả/resize responsive;
- draft/published dashboard và Tổng quan động;
- upload attachment/icon/image và dọn file import tạm;
- cấu hình ranh giới xã/phường.

### Đang phát triển/định hướng

- tăng coverage unit/e2e cho import, analytics và publish transaction;
- background import lớn với quan sát tiến độ BullMQ đầy đủ;
- versioning/audit log sâu hơn cho metadata và dashboard;
- spatial analytics nâng cao, clustering và vector tiles;
- chia sẻ/export dashboard và báo cáo;
- quản trị tenant/self-service deployment;
- quan sát hệ thống: metrics, tracing, cảnh báo job lỗi;
- tối ưu hiệu năng Dataset và cache query theo tải thực tế.

Roadmap là định hướng, không phải cam kết rằng mọi mục đã có API hoàn chỉnh. Luôn kiểm tra code và migration trước khi sử dụng.

## 22. FAQ

### Khi nào dùng Saved View?

Khi cần một tập con có tên của một layer — filter, sort, selected fields — và muốn tái sử dụng trong widget hoặc Dataset mà không sao chép record.

### Khi nào dùng Dataset?

Khi một widget cần dữ liệu từ nhiều Saved View hoặc các nguồn có field key khác nhau nhưng cần cùng schema chuẩn.

### Khi nào dùng Relationship?

Khi record cần tham chiếu có cấu trúc tới record của layer khác, ví dụ sản phẩm OCOP thuộc một hợp tác xã. Không dùng text tự do nếu cần truy vấn liên kết tin cậy.

### Khi nào dùng Sub Layer?

Khi dữ liệu là tập con phụ thuộc record cha và thường không cần geometry chính độc lập, ví dụ sản phẩm, thành viên hoặc hạng mục của một đối tượng.

### Layer và Dataset khác nhau thế nào?

Layer chứa feature record thật và có thể có geometry. Dataset là bảng ảo đọc/chuẩn hóa từ Saved View; nó không phải bản sao spatial mới.

### Có thể tạo widget trực tiếp từ Layer không?

Có, qua `layerId`, đặc biệt để tương thích widget cũ hoặc truy vấn đơn giản. Với workflow mới, dùng Saved View để truy vấn dễ hiểu và tái sử dụng hơn.

### Vì sao chart vẫn giữ raw value trong config?

Raw value bảo đảm query/filter/sort ổn định. UI chuyển raw value thành option label khi render; không sửa dữ liệu nguồn chỉ để đẹp giao diện.

### Vì sao không tạo bảng SQL cho mỗi loại nghiệp vụ?

Vì schema thay đổi theo xã/phường. `features.properties` + field metadata giúp thêm loại dữ liệu mà không cần migration/module mới cho từng trường hợp.

### Dashboard draft có xuất hiện ở Tổng quan không?

Không. Tổng quan chỉ render dashboard Published hiện hành. Thay đổi draft chỉ xuất hiện sau khi publish.

### Có thể có nhiều dashboard Published không?

Không trong cùng tenant. Publish dashboard mới sẽ unpublish dashboard trước trong transaction.

### File import và icon marker có cùng vòng đời không?

Không. File trong `uploads/imports` là file tạm và có thể dọn sau thành công/đủ tuổi. Icon/image thật là asset lâu dài; không được xóa bằng cleanup import.

---

## Tóm tắt onboarding trong 60 giây

```text
Muốn đưa dữ liệu mới lên hệ thống?
  Tạo Layer → khai báo Field → import Feature Records.

Muốn dùng một phần dữ liệu nhiều lần?
  Tạo Saved View.

Muốn gộp nhiều nguồn khác schema?
  Tạo Dataset và mapping về field chuẩn.

Muốn thống kê?
  Dùng Query Engine qua Widget.

Muốn đưa lên màn hình điều hành?
  Ghép Widget vào Dashboard → lưu draft → publish.
```

Đó là workflow chuẩn xuyên suốt của dự án: **Layer → Saved View → Dataset → Widget → Dashboard**.
