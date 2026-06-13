# Phase 1 — Data Core

**Thời gian ước tính:** 5–7 tuần (1–2 dev)  
**Phụ thuộc:** [phase-0-foundation.md](./phase-0-foundation.md)  
**Phase tiếp theo:** [phase-2-dynamic-ui-map.md](./phase-2-dynamic-ui-map.md)

## 1. Mục tiêu

Nền tảng metadata-driven: tạo layer, field, schema, CRUD feature generic, import Excel MVP, job engine.

Sau Phase 1: **import được dữ liệu file Excel mẫu** (trừ sheet Mô hình hiệu quả — Phase 3).

## 2. Phạm vi

### Metadata module

- CRUD `layers`, `fields`
- `layer_schema_versions`: draft / publish
- `schema_field_versions`: data/ui/display schema
- Field type registry (xem [field-types.md](../appendix/field-types.md))

### Records module

- `features`: geometry PostGIS + properties JSONB
- CRUD generic theo `layerId`
- Validation từ schema + field handlers
- `location_status`, geometry optional

### Relations module

- `relation_definitions`, `feature_relations`
- Relation OCOP: subject → product

### Dictionaries module

- CRUD dictionaries + items (tree)
- Seed: khu_vuc, nganh_nghe, tinh_trang_hoat_dong, xep_hang_ocop, loai_bom, loai_chu_the

### Jobs module

- BullMQ + Redis
- `job_executions`: progress, status
- Processors: import, schema_migration (cơ bản)

### Import module

- Upload Excel → chọn template → preview → execute job
- Normalize: money, area, measurement
- Entity matching cơ bản (dedup theo tên chuẩn hóa)

### Maps module (API)

- `GET /api/layers/:id/geojson?bbox=`
- Geometry null OK

### Audit (cơ bản)

- `audit_logs`: create, update, delete feature

## 3. Ngoài phạm vi

- Admin UI (Phase 2)
- Workflow duyệt (Phase 3)
- Child datasets annual_statistics (Phase 3)
- Dashboard (Phase 4)
- MVT (Phase 5)

## 4. Layer seed Long Bình

| code | name | geometry_type | geometry_required |
|------|------|---------------|-------------------|
| `economic_collective` | Chủ thể kinh tế tập thể | Point | false |
| `pump_station` | Trạm bơm | Point | false |
| `production_zone` | Vùng sản xuất | **Polygon** | false |
| `ocop_subject` | Chủ thể OCOP | Point | false |
| `ocop_product` | Sản phẩm OCOP | — | — |
| `administrative_zone` | Khu vực | Polygon | false |

### Field chính — economic_collective

| stable_key | label | field_type |
|------------|-------|------------|
| ten_chu_the | Tên chủ thể | text |
| loai_chu_the | Loại chủ thể | category |
| nguoi_dai_dien | Người đại diện | text |
| dia_chi_text | Địa chỉ | text |
| khu_vuc | Khu vực | category |
| nganh_nghe | Ngành nghề | multi_category |
| dien_tich | Diện tích | measurement |
| quy_trinh | Quy trình sản xuất | textarea |
| so_thanh_vien | Số thành viên | integer |
| san_luong | Sản lượng | quantity |
| kenh_tieu_thu | Kênh tiêu thụ | text |
| chi_phi_nam | Chi phí/năm | money |
| thu_nhap_nam | Thu nhập/năm | money |
| loi_nhuan_nam | Lợi nhuận/năm | money |
| so_dien_thoai | Số điện thoại | phone |
| tinh_trang | Tình trạng HĐ | category |
| ghi_chu | Ghi chú | textarea |

> Chi phí/thu nhập/lợi nhuận theo năm sẽ chuyển sang child layer `annual_statistics` ở Phase 3. Phase 1 lưu tạm trên entity chính để import Excel.

## 5. Import thứ tự (file Excel mẫu)

| # | Sheet | Target | Ghi chú |
|---|-------|--------|---------|
| 1 | HTX | economic_collective | loai_chu_the = hop_tac_xa |
| 2 | Tổ hợp tác | economic_collective | loai_chu_the = to_hop_tac |
| 3 | Thủy Lợi | pump_station | headerRow = 2 |
| 4 | Vùng sản xuất | production_zone | geometry null |
| 5 | SP OCOP | ocop_subject + ocop_product | parent-child |
| — | MH Hiệu quả | — | **Phase 3** (program_participation) |

Chi tiết: [import-excel-long-binh.md](../appendix/import-excel-long-binh.md)

## 6. API Phase 1

### Schema

```
POST/GET/PATCH     /api/layers
GET                /api/layers/:layerId
POST               /api/layers/:layerId/schema/drafts
GET                /api/layers/:layerId/schema
PATCH              /api/schema-drafts/:schemaId
POST               /api/schema-drafts/:schemaId/publish
```

### Records

```
GET/POST           /api/layers/:layerId/records
GET/PATCH/DELETE   /api/layers/:layerId/records/:recordId
POST               /api/records/query
```

### Map

```
GET                /api/layers/:layerId/geojson?bbox=minLng,minLat,maxLng,maxLat
```

### Import

```
POST               /api/imports/upload
POST               /api/imports/:id/preview
POST               /api/imports/:id/execute
GET                /api/imports/:id
```

### Jobs

```
GET                /api/jobs/:id
```

### Dictionaries

```
GET/POST           /api/dictionaries
GET/POST           /api/dictionaries/:code/items
```

## 7. Task checklist

### Metadata

- [ ] Layer CRUD + tenant scope
- [ ] Field CRUD với stable `fields.id`
- [ ] Schema draft / publish
- [ ] Field type registry + handlers (Phase 1 types)

### Records

- [ ] Feature entity PostGIS + JSONB
- [ ] FeatureService: create, update, validate
- [ ] Geometry validate: type, ST_IsValid
- [ ] Soft delete

### Relations

- [ ] relation_definitions CRUD
- [ ] feature_relations link/unlink
- [ ] OCOP owns relation

### Import

- [ ] Excel parser (xlsx)
- [ ] Import template JSON config
- [ ] Preview 20 rows
- [ ] Background job + progress
- [ ] 5 sheet templates (xem appendix)

### Jobs

- [ ] BullMQ setup
- [ ] job_executions table
- [ ] Import processor
- [ ] Error report per row

### Other

- [ ] Dictionary seed Long Bình
- [ ] audit_logs cơ bản
- [ ] Adapter prototype modules → catalog API generic
- [ ] E2E test: create layer → create record → geojson

## 8. Definition of Done

- [ ] Tạo layer mới qua API không cần deploy code
- [ ] Import HTX + THT (~18 bản ghi) từ Excel
- [ ] Import pump_station (~18 trạm)
- [ ] Import production_zone (3 vùng, geometry null, location_status=unlocated)
- [ ] Import OCOP (8 chủ thể + sản phẩm con)
- [ ] GeoJSON API trả features (geometry null OK)
- [ ] Job progress API: processed/total/errors
- [ ] Dedup cảnh báo khi tên trùng cross-import

## 9. Rủi ro

| Rủi ro | Giảm thiểu |
|--------|------------|
| PostGIS + ORM phức tạp | Raw SQL cho geometry nếu cần |
| Import Excel format lệch | Template config linh hoạt |
| Money unit lẫn lộn | Normalize + log warning |

## 10. Tham chiếu

- [import-excel-long-binh.md](../appendix/import-excel-long-binh.md)
- [api-conventions.md](../appendix/api-conventions.md)
- [field-types.md](../appendix/field-types.md)
