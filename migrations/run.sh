#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/migrations"

if [[ -f "$ROOT_DIR/.env" && -z "${DATABASE_URL:-}" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env"
  set +a
fi

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5434/gis_longbinh}"

FILES=(
  001_foundation.sql
  002_metadata.sql
  003_records.sql
  004_import_audit_outbox.sql
  005_governance.sql
  006_analytics.sql
  007_triggers.sql
  010_saved_views.sql
)

RUN_SEED="${RUN_SEED:-false}"
if [[ "$RUN_SEED" == "true" ]]; then
  FILES+=(008_seed_long_binh.sql)
fi

ensure_migrations_table() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  " >/dev/null
}

migration_applied() {
  psql "$DATABASE_URL" -tAc \
    "SELECT 1 FROM schema_migrations WHERE filename = '$1' LIMIT 1" | grep -q 1
}

record_migration() {
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO schema_migrations (filename) VALUES ('$1');" >/dev/null
}

bootstrap_existing_database() {
  local has_tenants
  has_tenants="$(psql "$DATABASE_URL" -tAc "SELECT to_regclass('public.tenants') IS NOT NULL")"
  [[ "$has_tenants" != "t" ]] && return 0

  ensure_migrations_table

  # Chỉ bootstrap bộ schema legacy đã tồn tại trước khi có migration tracking.
  # Migration mới tuyệt đối không được tự đánh dấu nếu chưa thực thi.
  local legacy_files=(
    001_foundation.sql
    002_metadata.sql
    003_records.sql
    004_import_audit_outbox.sql
    005_governance.sql
    006_analytics.sql
    007_triggers.sql
  )

  local file
  for file in "${legacy_files[@]}"; do
    if migration_applied "$file"; then
      continue
    fi
    echo "==> bootstrap: mark $file as already applied"
    record_migration "$file"
  done
}

echo "Running migrations against: $DATABASE_URL"

ensure_migrations_table
bootstrap_existing_database

applied=0
skipped=0

for file in "${FILES[@]}"; do
  if migration_applied "$file"; then
    echo "==> skip $file (already applied)"
    skipped=$((skipped + 1))
    continue
  fi

  echo "==> $file"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIGRATIONS_DIR/$file"
  record_migration "$file"
  applied=$((applied + 1))
done

if [[ "$applied" -eq 0 && "$skipped" -gt 0 ]]; then
  echo "All migrations already applied ($skipped skipped)."
else
  echo "Migrations completed ($applied applied, $skipped skipped)."
fi
