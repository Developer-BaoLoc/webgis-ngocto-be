# Kiến trúc v3.1 — GIS Platform metadata-driven

Phiên bản: **v3.1** · Cập nhật: 2026-06-13

## 1. Tổng quan 6 tầng

```
┌─────────────────────────────────────────┐
│  Web / Admin UI                         │
│  Layer Designer · Form · Map · Dashboard│
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  API Gateway                            │
│  Auth · Tenant · Rate limit · Logging   │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Metadata / Schema Engine               │
│  Layer · Field · Schema version · View  │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│  Dynamic Record Engine                  │
│  Validate · CRUD · Workflow · Relations │
└──────────┬─────────────────┬────────────┘
           │                 │
┌──────────▼─────────┐ ┌─────▼──────────────┐
│ Query Engine       │ │ Job Engine         │
│ Records · Analytics│ │ Import · Migrate   │
│ Spatial · MVT      │ │ Export · Notify    │
└──────────┬─────────┘ └─────┬──────────────┘
           │                 │
┌──────────▼─────────────────▼──────────────┐
│  Event Outbox + Workers (BullMQ)          │
└──────────────────┬────────────────────────┘
                   │
┌──────────────────▼────────────────────────┐
│  PostgreSQL + PostGIS + Redis + MinIO     │
└───────────────────────────────────────────┘
```

## 2. Nguyên tắc bắt buộc

### 2.1. Dữ liệu động ≠ chỉ JSONB

| Loại dữ liệu | Nơi lưu |
|--------------|---------|
| Geometry (Point, Polygon…) | Cột `features.geometry` — PostGIS |
| Thuộc tính linh hoạt | `features.properties` JSONB, validate theo schema |
| Quan hệ 1-N, N-N | `feature_relations` + `relation_definitions` |
| Dữ liệu theo kỳ / danh sách | Child layer hoặc child records |
| Import Excel | Template mapping động + job async |

### 2.2. Multi-tenant từ Phase 0

- Mọi entity nghiệp vụ có `tenant_id`
- Long Bình = tenant đầu tiên ngay từ đầu
- Phase 5 chỉ mở rộng provisioning/quota, **không** thêm tenant muộn

### 2.3. Resource scope

Không dán `tenant_id + organization_id + administrative_unit_id` lên mọi bảng.

```typescript
type ResourceScope =
  | 'system'
  | 'tenant'
  | 'organization'
  | 'administrative_unit'
  | 'user';
```

| Entity | Scope |
|--------|--------|
| Layer, schema | tenant + owner_organization_id |
| Feature | tenant + organization + administrative_unit_id |
| Dashboard cá nhân | tenant + owner_user_id |
| Attachment | kế thừa entity cha |

### 2.4. Field identity ổn định

```
fields.id (UUID, không đổi)  ← dashboard / metric / widget BIND VÀO ĐÂY
schema_field_versions        ← label, code, type, config theo version
```

### 2.5. Schema versioning

```
Draft → Validate → Impact analysis → Migration job → Publish
```

- Không sửa trực tiếp schema đang **published**
- Không lazy migration lâu dài nhiều version active
- Khi migrate: status = `migrating`, khóa sửa ngắn

### 2.6. Query an toàn

- **Không** nhận SQL từ frontend
- `POST /api/records/query` — bảng, tìm kiếm, spatial
- `POST /api/analytics/query` — dashboard aggregate
- Giới hạn: max rows, timeout, max buckets, field-level permission

### 2.7. Geometry

| Thuộc tính | Mô tả |
|------------|--------|
| `geometryType` | Point / Polygon / LineString — một type per layer |
| `geometryRequired` | false khi import Excel chưa có tọa độ |
| `location_status` | unlocated · point_placed · polygon_drawn · imported |
| SRID | EPSG:4326 mặc định |
| Validation | ST_IsValid, kiểm tra vùng quản lý |

### 2.8. Render bản đồ

| Quy mô | Mode |
|--------|------|
| < ~5.000 features | GeoJSON + bbox |
| Lớn hơn | Vector Tile MVT (Phase 5) |

## 3. Cấu trúc NestJS mục tiêu

```
src/
├── auth/
├── tenants/
├── organizations/
├── permissions/
├── metadata/          # layers, schemas, fields, forms, views, styles
├── records/           # feature CRUD, validation, workflow, revision
├── field-types/       # registry + handlers
├── dictionaries/
├── relations/
├── files/
├── imports/
├── query-engine/
├── maps/
├── dashboards/
├── workflows/
├── audit/
├── jobs/
└── common/
```

Module prototype hiện tại → adapter → generic engine → deprecate.

## 4. Event outbox

Side effects (cache, metric refresh, notification) qua **PostgreSQL outbox + BullMQ worker**, không trong HTTP request.

## 5. Observability

| Giai đoạn | Nội dung |
|-----------|----------|
| Phase 1 | Structured log (request_id, tenant_id, layer_id) |
| Phase 4 | query_executions (duration, rows) |
| Phase 5 | Prometheus, Sentry, OpenTelemetry |

## 6. Quyết định kỹ thuật (ADR tóm tắt)

| Quyết định | Lựa chọn | Lý do |
|------------|----------|-------|
| DB chính | PostgreSQL + PostGIS | GIS + JSONB + relational trong một DB |
| Cache/Queue | Redis + BullMQ | Import, migration, cache dashboard |
| File | MinIO/S3 | Không lưu base64 trong DB |
| ORM | Chốt Phase 0 (TypeORM hoặc Prisma) | NestJS ecosystem |
| Frontend map | MapLibre GL | Open source, vector tile ready |

## 7. Tham chiếu

- [data-model.md](./data-model.md)
- [phases/](./phases/)
