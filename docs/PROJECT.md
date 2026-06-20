# GIS Ngọc Tố — Tài liệu dự án

> **Đối tượng đọc:** Frontend, backend, QA — tài liệu gốc để hiểu dự án trước khi đọc chi tiết từng module.

---

## 1. Dự án là gì?

**GIS Ngọc Tố** là hệ thống thông tin địa lý (GIS) phục vụ **UBND xã Ngọc Tố, quận Mỹ Xuyên, TP. Cần Thơ** — tập trung vào **quản lý dữ liệu nông nghiệp và kinh tế tập thể** trên địa bàn phường.

Phường cần một nền tảng để:

- Quản lý **hợp tác xã (HTX)**, **tổ hợp tác (THHT)**, **trạm bơm**, **vùng sản xuất**, **sản phẩm OCOP**…
- Xem dữ liệu trên **bản đồ** (ghim điểm, vẽ vùng polygon)
- **Import** số liệu từ file Excel hiện có (~70 bản ghi, 6 sheet)
- Sau này: workflow duyệt, dashboard thống kê, mở rộng multi-tenant

### Điểm khác biệt so với GIS thông thường

Đây là nền tảng **metadata-driven** — admin có thể cấu hình lớp dữ liệu, trường, form, bản đồ **không cần deploy code mới**. Frontend **render form và bảng động** từ schema API, không hardcode từng màn hình HTX/trạm bơm riêng.

> Người dùng tự cấu hình lớp, trường, form, bản đồ — backend kiểm soát tính hợp lệ, bảo mật và hiệu năng.

---

## 2. Ai dùng? (Personas)

| Vai trò | Làm gì trên app |
|---------|-----------------|
| **Admin phường** | Cấu hình layer, import Excel, duyệt dữ liệu, quản lý user |
| **Nhập liệu (data editor)** | CRUD bản ghi, ghim/vẽ trên bản đồ |
| **Viewer** | Xem bản đồ + bảng read-only, không sửa |

Dev seed: `admin@ngocto.local` / `Admin@123` (sau Phase 0 auth).

---

## 3. Frontend sẽ xây gì?

### 3.1. Admin Web App (React + TypeScript + MapLibre GL)

```
┌─────────────────────────────────────────────────────────────┐
│  Header · Login · Tenant                                     │
├──────────┬──────────────────────────────────────────────────┤
│ Sidebar  │  Nội dung chính                                   │
│          │                                                   │
│ · Layers │  [Bảng dữ liệu động]  hoặc  [Bản đồ MapLibre]    │
│ · Import │  hoặc  [Form tạo/sửa bản ghi]                    │
│ · Dashbd │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

| Màn hình | Mô tả | Phase |
|----------|-------|-------|
| **Login** | JWT auth | 0 |
| **Layer catalog** | Danh sách lớp (HTX, trạm bơm, vùng SX…) | 1–2 |
| **Dynamic table** | Bảng cột render từ `display_schema` | 2 |
| **Dynamic form** | Form render từ `ui_schema` + field types | 2 |
| **Map view** | GeoJSON layers, ghim point, vẽ polygon | 2 |
| **Import wizard** | Upload Excel → preview → execute | 2 |
| **Dashboard** | Widget builder (semantic layer) | 4 |

### 3.2. Luồng người dùng chính (Ngọc Tố)

```
① Import Excel (HTX, THHT, trạm bơm, OCOP…)
        ↓
② Xem danh sách trong bảng động (chưa có tọa độ)
        ↓
③ Mở bản đồ → ghim HTX/trạm bơm (Point) hoặc vẽ vùng sản xuất (Polygon)
        ↓
④ Lọc theo khu vực (Bình Lợi, Bình Trung…), ngành nghề, trạng thái
        ↓
⑤ (Phase 3+) Gửi duyệt · xem lịch sử · dashboard thống kê
```

---

## 4. Khái niệm frontend cần nắm

### 4.1. Layer (lớp dữ liệu)

Một **layer** = một loại đối tượng trên bản đồ và trong bảng.

| Layer code (Phase 1) | Tên | Geometry | Ví dụ |
|----------------------|-----|----------|-------|
| `economic_collective` | HTX + THHT | Point | Hợp tác xã Rau củ Bình Lợi |
| `pump_station` | Trạm bơm | Point | Trạm bơm khu Bình Trung |
| `pump_service_area` | Vùng phục vụ trạm bơm | MultiPolygon | Diện tích bơm tiêu |
| `production_zone` | Vùng sản xuất | Polygon | Vùng chuyên trồng dưa hấu |
| `ocop_subject` | Chủ thể OCOP | Point | Hộ/cơ sở OCOP |
| `ocop_product` | Sản phẩm OCOP | — (không map) | Mật ong, rau sạch… |
| `administrative_zone` | Khu vực hành chính | Polygon | Bình Lợi, An Hòa… |

HTX và THHT **gộp một layer** `economic_collective`, phân biệt bằng field `loai_chu_the`.

### 4.2. Feature (bản ghi)

Một dòng HTX, một trạm bơm = một **feature**:

```
feature
├── id (UUID)
├── geometry (PostGIS — Point/Polygon, có thể null lúc import)
├── properties (JSONB — các field: tên, diện tích, doanh thu…)
└── location_status: unlocated | point_placed | polygon_drawn | imported
```

**Quan trọng cho map:** Sau import Excel, hầu hết feature **chưa có geometry** — user phải ghim/vẽ trên bản đồ (Phase 2).

### 4.3. Schema (form & bảng động)

Mỗi layer có **schema published** mô tả các field:

```
GET /api/layers/:layerId/schema
  → fields[]: { code, label, type, validation, ui_schema, display_schema }
```

Frontend **không hardcode** cột bảng hay input form — đọc schema và render theo [field-types.md](./appendix/field-types.md).

### 4.4. GeoJSON trên bản đồ

```
GET /api/layers/:layerId/geojson?bbox=minLng,minLat,maxLng,maxLat
```

- Response: `FeatureCollection`
- `properties` dùng **field code** (vd. `ten_htx`, `nganh_nghe`) — không dùng UUID field
- Feature có `geometry: null` vẫn có thể hiện trong bảng; map cần option `includeUnlocated=true` nếu muốn hiện cả bản ghi chưa ghim

### 4.5. Khu vực hành chính

Xã Ngọc Tố có **10 khu vực** (Bình Lợi, Bình Trung, Bình Hiếu…). Dùng làm filter trên bảng và bản đồ. Dictionary `khu_vuc` đã seed trong DB.

---

## 5. Dữ liệu nguồn

File Excel tại root repo: `BẢNG TỔNG HỢP SỐ LIỆU NÔNG NGHIỆP...xlsx`

| Sheet | Nội dung | ~Số dòng |
|-------|----------|----------|
| HTX | Hợp tác xã | ~15 |
| THHT | Tổ hợp tác | ~10 |
| Trạm bơm | Công trình thủy lợi | ~18 |
| Vùng SX | Vùng sản xuất | ~3 |
| OCOP | Chủ thể + sản phẩm | ~20 |
| Mô hình hiệu quả | Chương trình (Phase 3) | — |

**Chưa có tọa độ / polygon trong Excel** — bổ sung trên bản đồ ở Phase 2.

Spec import chi tiết: [import-excel-ngoc-to.md](./appendix/import-excel-ngoc-to.md)

---

## 6. Trạng thái triển khai — frontend cần biết

### Hiện tại

| Có thể làm | Chưa có |
|------------|---------|
| `GET /api`, `GET /api/health` (DB ping) | Dynamic form/table |
| `GET /api/layers` (catalog prototype) | GeoJSON dữ liệu thật |
| **Auth JWT** — `POST /api/auth/login`, `GET /api/auth/me` | Refresh token |
| `GET /api/tenants/current`, `GET /api/organizations` | Import wizard |
| Dựng shell UI + login flow | Phase 1 CRUD |

Endpoint Phase 0 mới dùng `{ data, meta }`. Prototype `/api/layers` vẫn raw JSON (sẽ chuẩn hoá Phase 1).

### Theo phase — frontend phụ thuộc backend

| Phase | Backend xong | Frontend làm được |
|-------|--------------|---------------------|
| **0** | Auth ✅, DB connection ✅ | Login, token, guard route |
| **1** | Layer schema, CRUD, import, GeoJSON bbox | Bảng/form động, load data thật |
| **2** | — | Map editor, import UI, filter |
| **3** | Workflow, child datasets | Duyệt, lịch sử, form phức tạp |
| **4** | Analytics, dashboards | Dashboard builder |

**Frontend có thể bắt đầu dựng shell app ngay** (layout, routing, MapLibre setup) với API catalog hiện tại; **chờ Phase 1** để có schema + dữ liệu thật.

---

## 7. Đọc tài liệu theo thứ tự nào?

```
1. PROJECT.md          ← file này (tổng quan)
2. docs/modules/       ← API từng module (request/response thực tế)
3. appendix/           ← khi cần chi tiết sâu
   ├── api-conventions.md    → contract API đầy đủ (target)
   ├── field-types.md        → render form động
   └── import-excel-ngoc-to.md
```

**Gửi cho frontend team:** `docs/PROJECT.md` + toàn bộ `docs/modules/`. Khi Phase 1 xong, thêm `docs/appendix/api-conventions.md`.

---

## 8. Stack & chạy local

| Thành phần | Công nghệ |
|------------|-----------|
| Backend | NestJS, TypeScript — port **4000**, prefix `/api` |
| Database | PostgreSQL + PostGIS — Docker port **5434** |
| Queue / cache | Redis + BullMQ |
| File storage | MinIO |
| Frontend | React, TypeScript, MapLibre GL (chưa có trong repo) |

```bash
yarn install && cp .env.example .env
yarn db:up && yarn db:migrate
yarn start:dev                    # → http://localhost:4000/api
```

**Frontend env gợi ý:** `VITE_API_BASE_URL=http://localhost:4000/api`

---

## 9. Quy ước API

| Mục | Giá trị |
|-----|---------|
| Base URL | `http://localhost:4000/api` |
| Auth (Phase 0+) | `Authorization: Bearer <JWT>` |
| ID trong API | UUID; đọc layer bằng `code` (vd. `economic_collective`) |
| GeoJSON properties | Field **code**, không UUID |

Response chuẩn (target): `{ data, meta }` — [api-conventions.md](./appendix/api-conventions.md).  
Prototype hiện tại: raw JSON trực tiếp.

---

## 10. Module — tài liệu API chi tiết

Mỗi module backend = **một file** trong [docs/modules/](./modules/). Đọc file này để biết endpoint, response mẫu, cách debug.

**Bắt đầu tích hợp CRUD admin:** [frontend-crud-guide.md](./modules/frontend-crud-guide.md)

| Module | File | Trạng thái | Frontend dùng để |
|--------|------|------------|------------------|
| Health | [health.md](./modules/health.md) | ✅ | Root + health (+ DB ping) |
| Auth | [auth.md](./modules/auth.md) | ✅ | Login JWT, /me |
| Tenants | [tenants.md](./modules/tenants.md) | ✅ | Tenant context |
| Organizations | [organizations.md](./modules/organizations.md) | ✅ | Danh sách org |
| **Frontend CRUD** | [frontend-crud-guide.md](./modules/frontend-crud-guide.md) | ✅ | Hướng dẫn tích hợp layer/field/records |
| **Assets (icon upload)** | [assets.md](./modules/assets.md) | ✅ | Upload icon lớp điểm |
| GIS Catalog | [metadata.md](./modules/metadata.md) | ✅ Phase 1 | Khởi tạo map, sidebar layers (DB) |
| Records | [records.md](./modules/records.md) | ✅ Phase 1 | CRUD + GeoJSON dynamic |
| Import | [import.md](./modules/import.md) | ✅ Phase 1 | Upload Excel |
| Dictionaries | [dictionaries.md](./modules/dictionaries.md) | ✅ Phase 1 | Dropdown / category |
| Ranh giới HC | [administrative-boundary.md](./modules/administrative-boundary.md) | 🔶 prototype | Deprecated — dùng `administrative_zone` |
| Hợp tác xã | [cooperatives.md](./modules/cooperatives.md) | 🔶 prototype | → `economic_collective` |
| Tổ hợp tác | [cooperative-groups.md](./modules/cooperative-groups.md) | 🔶 prototype | → `economic_collective` |
| Thủy lợi | [irrigation.md](./modules/irrigation.md) | 🔶 prototype | → `pump_station` |

🔶 = endpoint prototype cũ, GeoJSON rỗng. Dùng `/api/layers/:id/geojson` (Phase 1) thay cho prototype routes.

**Catalog cũ:** [gis-layers.md](./modules/gis-layers.md) (deprecated — xem [metadata.md](./modules/metadata.md)).

---

## 11. Sơ đồ kiến trúc (tóm tắt)

```
┌──────────────────────────────────────┐
│  React Admin + MapLibre (Frontend)   │
└─────────────────┬────────────────────┘
                  │ REST /api
┌─────────────────▼────────────────────┐
│  NestJS API                          │
│  Auth · Metadata · Records · Import  │
└─────────────────┬────────────────────┘
                  │
┌─────────────────▼────────────────────┐
│  PostgreSQL + PostGIS · Redis · MinIO│
└──────────────────────────────────────┘
```

Chi tiết 6 tầng: [architecture-v3.1.md](./architecture-v3.1.md)

---

## 12. Debug nhanh

```bash
curl -s http://localhost:4000/api | jq
curl -s http://localhost:4000/api/layers | jq
docker ps | grep gis_ngocto
yarn test:e2e
```

| Triệu chứng | Xử lý |
|-------------|-------|
| `ECONNREFUSED :4000` | `yarn start:dev` |
| `ECONNREFUSED :5434` | `yarn db:up` |
| GeoJSON `features: []` | Bình thường ở prototype — chờ Phase 1 import |
| Gọi sai URL | Phải có prefix `/api` |

---

## 13. Lộ trình phase

| Phase | Tài liệu | Kết quả |
|-------|----------|---------|
| 0 | [phase-0-foundation.md](./phases/phase-0-foundation.md) | Auth, DB, tenant |
| 1 | [phase-1-data-core.md](./phases/phase-1-data-core.md) | CRUD động, import |
| 2 | [phase-2-dynamic-ui-map.md](./phases/phase-2-dynamic-ui-map.md) | **Frontend chính** |
| 3–5 | [phases/](./phases/) | Workflow, dashboard, scale |

---

## 14. Tham chiếu sâu

| File | Khi nào đọc |
|------|-------------|
| [data-model.md](./data-model.md) | Hiểu bảng DB, quan hệ entity |
| [architecture-v3.1.md](./architecture-v3.1.md) | Quyết định kiến trúc backend |
| [appendix/api-conventions.md](./appendix/api-conventions.md) | Contract API đầy đủ theo phase |
| [appendix/field-types.md](./appendix/field-types.md) | Implement dynamic form |
| [appendix/import-excel-ngoc-to.md](./appendix/import-excel-ngoc-to.md) | Import wizard mapping |

---

## 15. Quy trình cập nhật tài liệu

Khi backend thêm/sửa API → cập nhật `docs/modules/<module>.md`.  
Thay đổi tổng quan dự án → cập nhật file này.

---

**Changelog**

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Gộp tài liệu: PROJECT.md + docs/modules/ |
| 2026-06-13 | Bổ sung tổng quan dự án cho frontend |
