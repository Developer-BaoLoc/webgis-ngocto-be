# Database Migrations — GIS Long Bình v3.2

PostgreSQL 15+ với PostGIS 3+.

## Chạy migrations

### Docker (khuyến nghị)

```bash
docker compose up -d postgres
./migrations/run.sh
```

### Thủ công

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5434/gis_longbinh

psql "$DATABASE_URL" -f migrations/001_foundation.sql
psql "$DATABASE_URL" -f migrations/002_metadata.sql
psql "$DATABASE_URL" -f migrations/003_records.sql
psql "$DATABASE_URL" -f migrations/004_import_audit_outbox.sql
psql "$DATABASE_URL" -f migrations/005_governance.sql
psql "$DATABASE_URL" -f migrations/006_analytics.sql
psql "$DATABASE_URL" -f migrations/007_triggers.sql
psql "$DATABASE_URL" -f migrations/010_saved_views.sql
psql "$DATABASE_URL" -f migrations/008_seed_long_binh.sql   # optional dev seed
```

## Thứ tự file

| File | Nội dung |
|------|----------|
| 001 | Extensions, tenants, org, auth, role_assignments |
| 002 | Layers, fields, schema versions (composite FK) |
| 003 | Features, relations, dictionaries, attachments |
| 004 | Import, jobs, audit, outbox |
| 005 | Revisions, field dependencies, permissions |
| 006 | Datasets, metrics, dashboards |
| 007 | Validation triggers (geometry, relations, cardinality) |
| 008 | Seed Long Bình (dev) |
| 010 | Saved Views cho dashboard/query engine |

## Nguyên tắc v3.2

- `ON DELETE RESTRICT` từ tenant (không CASCADE)
- Composite FK `(id, tenant_id)` chống cross-tenant
- Composite FK schema/layer/field consistency
- `fields.storage_key` bất biến — key trong JSONB properties
- Geometry EPSG:4326 only, validate bằng trigger
