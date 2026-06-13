# Mô hình dữ liệu v3.1

Database chính: **PostgreSQL 15+ + PostGIS 3+**

## 1. Sơ đồ nhóm bảng

```
┌─────────────────────────────────────────────────────────┐
│  TENANT & ORGANIZATION                                  │
│  tenants · organizations · organization_units             │
│  administrative_units · users · roles · permissions     │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│  METADATA                                               │
│  layers · fields · layer_schema_versions                │
│  schema_field_versions · layer_views · layer_map_styles │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────┐
│  RECORDS                                                │
│  features · feature_revisions · feature_relations       │
│  relation_definitions                                   │
└─────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────────┐
│ DICTIONARIES  │ │ IMPORTS/JOBS  │ │ ANALYTICS         │
│ dictionaries  │ │ import_jobs   │ │ datasets          │
│ dict_items    │ │ job_executions│ │ metrics           │
│               │ │ outbox_events │ │ dimensions        │
│               │ │ audit_logs    │ │ dashboards        │
└───────────────┘ └───────────────┘ └───────────────────┘
```

## 2. Tenant & Organization

### tenants

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| code | varchar unique | `long-binh` |
| name | varchar | Phường Long Bình |
| is_active | boolean | |
| created_at | timestamptz | |

### organizations

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| tenant_id | uuid FK | |
| name | varchar | UBND phường, Phòng Kinh tế… |
| parent_id | uuid nullable | Cây tổ chức |

### administrative_units

Cây hành chính (Tỉnh → Quận → Phường → Khu vực).

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| tenant_id | uuid FK | |
| code | varchar | `binh-loi`, `binh-trung` |
| name | varchar | Khu vực Bình Lợi |
| level | varchar | province · district · ward · zone |
| parent_id | uuid nullable | |
| geometry | geometry(Polygon) nullable | Ranh giới khu vực (Phase 2) |

### users, roles, permissions

RBAC cơ bản Phase 0; mở rộng field-level permission Phase 3.

## 3. Metadata

### layers

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| tenant_id | uuid FK | |
| owner_organization_id | uuid FK nullable | |
| code | varchar | `production_zone` |
| name | varchar | Vùng sản xuất |
| description | text | |
| geometry_type | varchar | Point · Polygon · LineString |
| geometry_required | boolean | default false |
| allow_multi_polygon | boolean | |
| srid | int | default 4326 |
| render_mode | varchar | geojson · vector_tile |
| style_config | jsonb | Màu, opacity… |
| is_active | boolean | |
| current_schema_version_id | uuid FK nullable | |
| created_at | timestamptz | |

### fields

Identity ổn định xuyên suốt schema versions.

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | **Stable ID — bind dashboard/metric** |
| layer_id | uuid FK | |
| stable_key | varchar nullable | Slug nghiệp vụ: `nganh_nghe` |
| created_at | timestamptz | |

### layer_schema_versions

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| layer_id | uuid FK | |
| version | int | 1, 2, 3… |
| status | varchar | draft · migrating · published · archived |
| published_at | timestamptz nullable | |
| published_by | uuid nullable | |

### schema_field_versions

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| schema_version_id | uuid FK | |
| field_id | uuid FK → fields.id | |
| code | varchar | Có thể đổi giữa versions |
| label | varchar | |
| field_type | varchar | text · money · measurement… |
| data_schema | jsonb | validation, default, required |
| ui_schema | jsonb | component, section, width |
| display_schema | jsonb | visibleInTable, format |
| sort_order | int | |

## 4. Records

### features

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| tenant_id | uuid FK | |
| layer_id | uuid FK | |
| schema_version_id | uuid FK | Schema tại thời điểm tạo/sửa |
| owner_organization_id | uuid FK nullable | |
| administrative_unit_id | uuid FK nullable | |
| geometry | geometry nullable | PostGIS |
| properties | jsonb | Thuộc tính động |
| status | varchar | draft · submitted · approved · published · archived |
| location_status | varchar | unlocated · point_placed · polygon_drawn · imported |
| created_by | uuid | |
| updated_by | uuid nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz nullable | Soft delete |

**Index bắt buộc:**

```sql
CREATE INDEX idx_features_geometry ON features USING GIST (geometry);
CREATE INDEX idx_features_properties ON features USING GIN (properties);
CREATE INDEX idx_features_layer_status ON features (tenant_id, layer_id, status);
CREATE INDEX idx_features_layer_created ON features (layer_id, created_at DESC);
```

### feature_relations

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| tenant_id | uuid FK | |
| relation_definition_id | uuid FK | |
| source_feature_id | uuid FK | |
| target_feature_id | uuid FK | |
| metadata | jsonb nullable | |

### relation_definitions

| Cột | Kiểu | Mô tả |
|-----|------|--------|
| id | uuid PK | |
| tenant_id | uuid FK | |
| code | varchar | `ocop_owns_product` |
| source_layer_id | uuid FK | |
| target_layer_id | uuid FK | |
| relation_type | varchar | owns · serves · participates |
| cardinality | varchar | one_to_one · one_to_many · many_to_many |
| delete_behavior | varchar | restrict · unlink · cascade |

## 5. Dictionaries

### dictionaries / dictionary_items

| dictionary_items | Mô tả |
|------------------|--------|
| parent_id | Cây danh mục (ngành nghề) |
| code, label | |
| sort_order, is_active | |
| metadata | jsonb |

**Seed Long Bình:** `khu_vuc`, `nganh_nghe`, `tinh_trang_hoat_dong`, `xep_hang_ocop`, `loai_bom`, `loai_chu_the`

## 6. Child datasets (Phase 3)

Implement bằng **child layer** + relation 1-N:

| Child layer | Parent | Mục đích |
|-------------|--------|----------|
| annual_statistics | economic_collective, pump_station | Chi phí/thu nhập/lợi nhuận theo năm |
| program_participation | economic_collective | Mô hình hiệu quả |
| certification_history | ocop_product | Xếp hạng OCOP theo năm |
| production_output | economic_collective | Sản lượng chi tiết (lươn, ếch…) |
| contact_person | production_zone | Người tham gia vùng sản xuất |

## 7. Import & Jobs

### import_templates

| Cột | Mô tả |
|-----|--------|
| layer_id | Layer đích |
| config | jsonb — headerRow, mapping, parent_child, category rows |

### import_jobs / job_executions

| Cột | Mô tả |
|-----|--------|
| job_type | import · schema_migration · export |
| status | pending · running · completed · failed |
| progress | jsonb — `{ processed: 6750, total: 10000 }` |
| payload, result, error | |

## 8. Analytics (Phase 4)

### datasets

| Cột | Mô tả |
|-----|--------|
| source_layer_id | Layer nguồn |
| grain | jsonb — `["feature_id"]` |
| default_filters | jsonb |
| access_policy | jsonb |

### metrics / dimensions

Bind `field_id` (fields.id), không bind code.

### dashboards / dashboard_widgets

Layout theo breakpoint: desktop, tablet, mobile.

## 9. Layer seed Long Bình

| code | name | geometry_type | geometry_required |
|------|------|---------------|-------------------|
| economic_collective | Chủ thể kinh tế tập thể | Point | false |
| pump_station | Trạm bơm | Point | false |
| pump_service_area | Vùng phục vụ trạm bơm | Polygon | false |
| production_zone | Vùng sản xuất | **Polygon** | false |
| ocop_subject | Chủ thể OCOP | Point | false |
| ocop_product | Sản phẩm OCOP | null | — |
| administrative_zone | Khu vực | Polygon | false |

## 10. Quan hệ nghiệp vụ chính

```
economic_collective (HTX/THT)
  ├── 1-N → annual_statistics
  ├── 1-N → program_participation
  └── spatial → production_zone (ST_Within)

ocop_subject
  └── 1-N → ocop_product (relation: owns)

pump_station (Point)
  └── 1-N → pump_service_area (Polygon, relation: serves)

production_zone (Polygon)
  └── 1-N → contact_person
```

## 11. Tham chiếu

- [field-types.md](./appendix/field-types.md)
- [import-excel-long-binh.md](./appendix/import-excel-long-binh.md)
