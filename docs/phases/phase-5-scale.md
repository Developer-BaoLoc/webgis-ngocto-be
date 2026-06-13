# Phase 5 — Scale & Production

**Thời gian:** Liên tục / theo hạng mục  
**Phụ thuộc:** [phase-4-dashboard-mvp.md](./phase-4-dashboard-mvp.md)

## 1. Mục tiêu

Production-ready, hiệu năng cao, mở rộng multi-tenant, vận hành ổn định.

## 2. Phạm vi theo hạng mục

### 2.1. GIS Performance

| Hạng mục | Mô tả |
|----------|--------|
| Vector Tiles (MVT) | `GET /api/map/layers/:id/tiles/:z/:x/:y.pbf` — PostGIS ST_AsMVT |
| Tile cache | Redis cache tile theo z/x/y |
| Geometry simplify | ST_Simplify cho zoom thấp |
| Layer render_mode | Chuyển layer lớn từ geojson → vector_tile |

### 2.2. Analytics Performance

| Hạng mục | Mô tả |
|----------|--------|
| Redis cache | Cache kết quả analytics query theo hash |
| Materialized views | Pre-aggregate metric nặng |
| Background refresh | Job refresh MV theo schedule |
| Expression index | Index JSONB field hay filter (dien_tich, status) |

### 2.3. Multi-tenant mở rộng

| Hạng mục | Mô tả |
|----------|--------|
| Tenant provisioning | Tạo tenant + org + seed admin |
| Tenant quota | Max layers, max features, max storage |
| Tenant isolation | Verify mọi query filter tenant_id |
| Billing hook | Optional — metering API calls |

> **Lưu ý:** `tenant_id` đã có từ Phase 0. Phase 5 chỉ mở rộng vận hành, không redesign.

### 2.4. Observability

| Hạng mục | Mô tả |
|----------|--------|
| Prometheus metrics | Query duration, import rate, tile count |
| Grafana dashboards | Ops monitoring |
| Sentry | Error tracking |
| OpenTelemetry | Distributed tracing |
| Slow query alert | query_executions > threshold |

### 2.5. Export & Reporting

| Hạng mục | Mô tả |
|----------|--------|
| Export Excel/PDF | Background job |
| Scheduled report | Cron + email |
| Public dashboard | Share link read-only |

### 2.6. Advanced features

| Hạng mục | Mô tả |
|----------|--------|
| Full-text search | PostgreSQL tsvector hoặc Meilisearch |
| Notification | Email / webhook khi duyệt / import xong |
| PostgreSQL RLS | Optional row-level security |
| Partition features | By tenant_id hoặc layer_id khi > 1M rows |
| Computed fields | Formula engine |
| WMS/WMTS external layers | render_mode external |

## 3. Benchmark mục tiêu

| Metric | Target |
|--------|--------|
| GeoJSON bbox API p95 | < 500ms (layer < 5k features) |
| MVT tile p95 | < 200ms |
| Analytics query p95 | < 3s |
| Import 10k rows | < 5 phút background |
| Uptime | 99.5% |

## 4. Task checklist (ưu tiên)

### P5-A — Performance (ưu tiên cao)

- [ ] MVT endpoint + ST_AsMVT
- [ ] Redis analytics cache
- [ ] Expression index cho field filter thường dùng
- [ ] query_executions dashboard ops

### P5-B — Multi-tenant ops

- [ ] Tenant admin API
- [ ] Quota enforcement
- [ ] Tenant onboarding script

### P5-C — Observability

- [ ] Prometheus + Grafana
- [ ] Sentry integration
- [ ] Alert rules

### P5-D — Export

- [ ] Export Excel job
- [ ] Export PDF report template

## 5. Definition of Done (theo release)

Mỗi hạng mục Phase 5 có DoD riêng. Release production tối thiểu cần:

- [ ] MVT cho ít nhất 1 layer lớn
- [ ] Analytics cache hoạt động
- [ ] Monitoring + alerting cơ bản
- [ ] Backup PostgreSQL scheduled
- [ ] 2 tenant test độc lập trên cùng cluster

## 6. Infrastructure production

| Component | Gợi ý |
|-----------|--------|
| App | Docker / K8s |
| DB | PostgreSQL managed + PostGIS |
| Redis | Managed Redis |
| MinIO | S3 hoặc MinIO cluster |
| CDN | Optional cho static tiles |

## 7. Tham chiếu

- [architecture-v3.1.md](../architecture-v3.1.md)
- [data-model.md](../data-model.md)
