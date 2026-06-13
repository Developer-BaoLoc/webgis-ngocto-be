# Phase 3 — Governance

**Thời gian ước tính:** 3–4 tuần (1–2 dev)  
**Phụ thuộc:** [phase-2-dynamic-ui-map.md](./phase-2-dynamic-ui-map.md)  
**Phase tiếp theo:** [phase-4-dashboard-mvp.md](./phase-4-dashboard-mvp.md)

## 1. Mục tiêu

An toàn vận hành nhiều phòng ban: workflow duyệt, audit đầy đủ, schema migration, child datasets, permission chi tiết, import nâng cao.

## 2. Phạm vi

### Workflow

- Feature status: `draft` → `submitted` → `approved` → `published` → `archived`
- Config workflow theo layer
- API: submit, approve, reject, publish
- UI: hàng đợi duyệt, lịch sử trạng thái

### Revision & soft delete

- `feature_revisions`: snapshot geometry + properties
- Restore revision
- Soft delete + khôi phục

### Schema governance

- Impact analyzer trước publish
- Compatibility rules: compatible · requires_migration · breaking
- Migration job trước activate schema mới
- Dependency checker: field dùng bởi dashboard/metric/form rule

### Child datasets (layers con)

| Child layer | Parent | Fields chính |
|-------------|--------|--------------|
| `annual_statistics` | economic_collective, pump_station | reporting_year, cost, revenue, profit, production |
| `program_participation` | economic_collective | program_code, category, recognized_year, status, note |
| `certification_history` | ocop_product | year, rank, cert_body, note |
| `production_output` | economic_collective | product_name, value, unit |
| `contact_person` | production_zone | full_name, phone, role, is_primary |

Relation 1-N qua `feature_relations`.

### Import nâng cao

- **MH Hiệu quả**: category rows (Trồng trọt / Thủy sản / CNTT) → `program_participation`
- Entity matching cross-sheet: HTX trùng tên → link, không tạo duplicate
- Merge review UI khi fuzzy match
- Forward-fill parent (OCOP)
- Computed profit validation + warning

### Permission

- Layer-level: xem/sửa theo layer
- Field-level: ẩn SĐT, vốn với viewer
- Record scope: theo organization + administrative_unit

### Event outbox

- `outbox_events` + worker
- FeatureApproved → clear cache, notification stub

## 3. Mô hình hiệu quả — không duplicate entity

```
HTX NN Bình Hiếu (1 feature trong economic_collective)
  └── program_participation
        program: "mo_hinh_hieu_qua"
        category: "trong_trot"
        recognized_year: 2026
```

Import sheet MH Hiệu quả:
- Dòng section → set category cho rows below
- Match entity by normalized name → create participation, không tạo feature mới

## 4. annual_statistics — dữ liệu theo kỳ

Chuyển chi phí/thu nhập/lợi nhuận từ properties entity sang child:

```
HTX Bình Hiếu
├── annual_statistics/2025
└── annual_statistics/2026
```

Migration script Phase 3: tách dữ liệu đã import Phase 1.

## 5. Computed & validation

### Lợi nhuận

```json
{
  "fieldType": "computed",
  "formula": "revenue - cost",
  "allowManualOverride": false
}
```

Hoặc validation warning khi `abs(profit - (revenue - cost)) > tolerance`.

### Ví dụ cảnh báo từ file mẫu

Mô hình cơ giới hóa: profit ghi 359.944.000 ≠ 374.400.000 - 144.560.000 → `DATA_VALIDATION_WARNING`.

## 6. API bổ sung

```
POST   /api/layers/:layerId/records/:id/submit
POST   /api/layers/:layerId/records/:id/approve
POST   /api/layers/:layerId/records/:id/reject
POST   /api/layers/:layerId/records/:id/publish

GET    /api/layers/:layerId/records/:id/revisions
POST   /api/layers/:layerId/records/:id/revisions/:rev/restore

POST   /api/schema-drafts/:id/validate
POST   /api/schema-drafts/:id/impact-analysis

GET    /api/fields/:fieldId/dependencies
```

## 7. Task checklist

- [ ] Workflow service + state machine
- [ ] feature_revisions + API
- [ ] Schema impact analyzer
- [ ] Schema migration job (background)
- [ ] Dependency checker
- [ ] Child layer CRUD + nested form UI
- [ ] program_participation import MH Hiệu quả
- [ ] annual_statistics + migration từ Phase 1 data
- [ ] Entity matching + merge review UI
- [ ] Field-level permission guard
- [ ] Outbox + worker cơ bản
- [ ] certification_history cho OCOP

## 8. Definition of Done

- [ ] HTX Bình Hiếu: 1 feature + 1 program_participation (không duplicate)
- [ ] Số liệu 2025 lưu child annual_statistics
- [ ] Publish schema v2 có migration job + lock ngắn
- [ ] Xóa field đang dùng dashboard → blocked với message dependencies
- [ ] Audit: tra được ai sửa field nào, giá trị cũ/mới
- [ ] Viewer không thấy SĐT / vốn đầu tư
- [ ] Import MH Hiệu quả thành công

## 9. Tham chiếu

- [import-excel-long-binh.md](../appendix/import-excel-long-binh.md) — sheet MH Hiệu quả
- [data-model.md](../data-model.md) — child datasets
