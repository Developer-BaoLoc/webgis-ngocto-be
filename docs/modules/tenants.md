# Module: Tenants

| | |
|---|---|
| **Trạng thái** | ✅ Implemented (Phase 0) |
| **Code** | `src/tenants/` |

## Mục đích

Trả tenant context của user đang đăng nhập.

## API

### `GET /api/tenants/current` — Bearer required

**Response 200**

```json
{
  "data": {
    "id": "a0000000-0000-4000-8000-000000000001",
    "code": "ngoc-to",
    "name": "Xã Ngọc Tố",
    "settings": {
      "ward": "Ngọc Tố",
      "district": "Mỹ Xuyên",
      "province": "Cần Thơ"
    }
  },
  "meta": { ... }
}
```

## Frontend

Gọi sau login để hiển thị tên tenant / scope multi-tenant.

## Debug

```bash
curl -s http://localhost:4000/api/tenants/current \
  -H "Authorization: Bearer $TOKEN" | jq
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Phase 0 — GET /tenants/current |
