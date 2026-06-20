# Module: Health

| | |
|---|---|
| **Trạng thái** | ✅ Implemented |
| **Code** | `src/health/` |

## Mục đích

Health check API và endpoint root — frontend/CI kiểm tra service sống + DB.

## API

### `GET /api`

```json
{
  "data": {
    "status": "ok",
    "service": "GIS Ngọc Tố API",
    "ward": "Ngọc Tố, Mỹ Xuyên, Cần Thơ",
    "docs": "/api/layers"
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### `GET /api/health`

```json
{
  "data": {
    "status": "ok",
    "database": "ok"
  },
  "meta": { ... }
}
```

`database: "error"` khi không kết nối được PostgreSQL.

## Frontend

- Splash / about: `GET /api` → `data.status`, `data.ward`
- Health monitor: `GET /api/health` → `data.database`

## Debug

```bash
curl -s http://localhost:4000/api | jq
curl -s http://localhost:4000/api/health | jq
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Phase 0 — bọc `{ data, meta }`, DB ping |
