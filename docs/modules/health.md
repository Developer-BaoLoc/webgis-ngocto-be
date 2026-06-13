# Module: Health

| | |
|---|---|
| **Trạng thái** | ✅ Implemented |
| **Code** | `src/health/` |

## Mục đích

Health check API và endpoint root — frontend/CI kiểm tra service sống.

## API

### `GET /api`

```json
{
  "status": "ok",
  "service": "GIS Long Bình API",
  "ward": "Long Bình, Cái Răng, Cần Thơ",
  "docs": "/api/layers"
}
```

### `GET /api/health`

```json
{ "status": "ok" }
```

## Frontend

- Splash / about screen: `GET /api`
- Health indicator / uptime monitor: `GET /api/health`

## Debug

```bash
curl -s http://localhost:4000/api | jq
curl -s http://localhost:4000/api/health | jq
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Khởi tạo |
