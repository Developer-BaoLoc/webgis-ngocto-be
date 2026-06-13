#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/.env" && -z "${DATABASE_URL:-}" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_DIR/.env"
  set +a
fi

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5434/gis_longbinh}"

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

run_seed_file() {
  local file="$1"
  echo "==> $(basename "$file")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
  record_migration "$(basename "$file")"
}

echo "Running seed against: $DATABASE_URL"
ensure_migrations_table

for file in 008_seed_long_binh.sql 009_layer_seed.sql; do
  if migration_applied "$file"; then
    echo "==> skip $file (already applied)"
    continue
  fi
  if [[ "$file" == "008_seed_long_binh.sql" ]]; then
    has_tenant="$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM tenants WHERE id = 'a0000000-0000-4000-8000-000000000001' LIMIT 1" || true)"
    if [[ "$has_tenant" == "1" ]]; then
      echo "==> skip $file (tenant already exists)"
      record_migration "$file"
      continue
    fi
  fi
  run_seed_file "$ROOT_DIR/migrations/$file"
done

echo "Seed completed."
