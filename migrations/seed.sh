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
SEED_FILE="$ROOT_DIR/migrations/008_seed_long_binh.sql"

echo "Running seed against: $DATABASE_URL"
echo "==> 008_seed_long_binh.sql"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SEED_FILE"
echo "Seed completed."
