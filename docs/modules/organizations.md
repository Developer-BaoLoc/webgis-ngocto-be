# Module: Organizations

| | |
|---|---|
| **Trạng thái** | ✅ Implemented (Phase 0) |
| **Code** | `src/organizations/` |

## Mục đích

Danh sách tổ chức thuộc tenant (UBND phường, …).

## API

### `GET /api/organizations` — Bearer required

**Response 200**

```json
{
  "data": [
    {
      "id": "uuid",
      "code": "ubnd-ngoc-to",
      "name": "UBND Xã Ngọc Tố",
      "parentId": null
    }
  ],
  "meta": { ... }
}
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Phase 0 — list organizations |
