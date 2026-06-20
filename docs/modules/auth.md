# Module: Auth

| | |
|---|---|
| **Trạng thái** | ✅ Implemented (Phase 0) |
| **Code** | `src/auth/` |

## Mục đích

Đăng nhập JWT, lấy profile user hiện tại.

## API

### `POST /api/auth/login` — Public

**Request**

```json
{
  "email": "admin@ngocto.local",
  "password": "Admin@123"
}
```

**Response 201**

```json
{
  "data": {
    "accessToken": "eyJ...",
    "tokenType": "Bearer",
    "expiresIn": 28800,
    "user": {
      "id": "uuid",
      "tenantId": "uuid",
      "email": "admin@ngocto.local",
      "fullName": "Quản trị viên Ngọc Tố",
      "roles": ["super_admin"]
    }
  },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

### `GET /api/auth/me` — Bearer required

**Response 200**

```json
{
  "data": {
    "id": "uuid",
    "tenantId": "uuid",
    "email": "admin@ngocto.local",
    "fullName": "...",
    "roles": ["super_admin"],
    "primaryOrganizationId": "uuid"
  },
  "meta": { ... }
}
```

## Frontend

- Login → lưu `accessToken` (memory hoặc localStorage — Phase 0 chưa có refresh token)
- Header: `Authorization: Bearer <accessToken>`
- Chưa có refresh endpoint — hết hạn thì login lại

## Debug

```bash
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ngocto.local","password":"Admin@123"}' | jq

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ngocto.local","password":"Admin@123"}' | jq -r '.data.accessToken')

curl -s http://localhost:4000/api/auth/me -H "Authorization: Bearer $TOKEN" | jq
```

## Changelog

| Ngày | Thay đổi |
|------|----------|
| 2026-06-13 | Phase 0 — JWT login + /me |
