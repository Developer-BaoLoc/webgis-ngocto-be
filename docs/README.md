# GIS Long Bình — Tài liệu triển khai

Hệ thống thông tin địa lý **phường Long Bình, quận Cái Răng, TP. Cần Thơ** — nền tảng metadata-driven (v3.1).

## Tuyên bố kiến trúc

> Người dùng tự cấu hình lớp, trường, form, bảng, bản đồ, workflow, phân quyền và dashboard — backend vẫn kiểm soát tính hợp lệ, bảo mật và hiệu năng.

## Năm trụ cột dữ liệu động

| Trụ cột | Mô tả |
|---------|--------|
| **Dynamic Layer** | Admin tạo lớp (HTX, trạm bơm, vùng sản xuất…) không cần deploy code |
| **Dynamic Field** | Trường + kiểu dữ liệu + validation + UI/display schema |
| **Dynamic Relation** | Quan hệ 1-1, 1-N, N-N giữa các lớp |
| **Dynamic Child Dataset** | Bản ghi con theo kỳ (số liệu năm, xếp hạng OCOP…) |
| **Dynamic Import Mapping** | Import Excel/GeoJSON với mapping, normalize, dedup |

Dashboard xây trên **Semantic Layer**: Dataset → Metric/Dimension → Widget.

## Stack công nghệ

| Thành phần | Công nghệ |
|------------|-----------|
| Backend | NestJS, TypeScript |
| Database chính | **PostgreSQL 15+ + PostGIS 3+** |
| Queue / cache | Redis + BullMQ |
| File storage | MinIO / S3-compatible |
| Frontend (Phase 2+) | React + TypeScript, MapLibre GL |

## Lộ trình giai đoạn

| Giai đoạn | Tài liệu | Thời gian (1–2 dev) | Kết quả chính |
|-----------|----------|---------------------|---------------|
| **0** | [phase-0-foundation.md](./phases/phase-0-foundation.md) | 1–2 tuần | Foundation, DB skeleton, convention |
| **1** | [phase-1-data-core.md](./phases/phase-1-data-core.md) | 5–7 tuần | Layer, schema, CRUD, import MVP |
| **2** | [phase-2-dynamic-ui-map.md](./phases/phase-2-dynamic-ui-map.md) | 4–6 tuần | Form/bảng động, bản đồ polygon/point |
| **3** | [phase-3-governance.md](./phases/phase-3-governance.md) | 3–4 tuần | Workflow, audit, child datasets |
| **4** | [phase-4-dashboard-mvp.md](./phases/phase-4-dashboard-mvp.md) | 5–7 tuần | Dashboard builder, semantic layer |
| **5** | [phase-5-scale.md](./phases/phase-5-scale.md) | Liên tục | MVT, cache, multi-tenant mở rộng |

## Tài liệu tham chiếu

| Tài liệu | Nội dung |
|----------|----------|
| [architecture-v3.1.md](./architecture-v3.1.md) | Kiến trúc 6 tầng, quyết định kỹ thuật |
| [data-model.md](./data-model.md) | Mô hình dữ liệu, bảng, quan hệ, scope |
| [../migrations/README.md](../migrations/README.md) | SQL migrations v3.2 |
| [field-types.md](./appendix/field-types.md) | Registry kiểu trường |
| [import-excel-long-binh.md](./appendix/import-excel-long-binh.md) | Spec import file mẫu nông nghiệp |
| [api-conventions.md](./appendix/api-conventions.md) | Quy ước API REST |

## Dữ liệu mẫu

File Excel tại root repo: `BẢNG TỔNG HỢP SỐ LIỆU NÔNG NGHIỆP...xlsx`

- 6 sheet, ~70 bản ghi thực tế
- Chưa có tọa độ / polygon — bổ sung ở Phase 2 trên bản đồ

## Code hiện tại (prototype)

Các module cố định (`cooperatives/`, `irrigation/`, …) là **prototype tạm**. Sẽ migrate qua Dynamic Feature Engine ở Phase 1, không xóa đột ngột.

## Quy trình triển khai

1. Đọc [architecture-v3.1.md](./architecture-v3.1.md) và [data-model.md](./data-model.md)
2. Thực hiện [phase-0-foundation.md](./phases/phase-0-foundation.md)
3. Chỉ chuyển phase tiếp theo khi đạt **Definition of Done** của phase hiện tại
4. Mọi thay đổi kiến trúc lớn ghi ADR trong `docs/adr/` (tạo khi cần)
