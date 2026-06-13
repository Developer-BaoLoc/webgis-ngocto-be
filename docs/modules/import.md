# Import (Phase 1)

Upload Excel → preview → background job import.

## Endpoints

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/imports/templates` | JWT | Templates Long Bình (HTX, THT, …) |
| POST | `/api/imports/upload` | JWT | Upload file (`multipart/form-data`, field `file`) |
| POST | `/api/imports/:importId/preview` | JWT | Preview 20 dòng |
| POST | `/api/imports/:importId/execute` | JWT | Queue job |
| GET | `/api/imports/:importId` | JWT | Trạng thái import |
| GET | `/api/jobs/:jobId` | JWT | Progress job |

## Flow

1. `POST /api/imports/upload` → `{ importId, jobId }`
2. `POST /api/imports/:importId/preview` body `{ "templateCode": "htx" }`
3. `POST /api/imports/:importId/execute` body `{ "templateCode": "htx" }`
4. Poll `GET /api/jobs/:jobId` → `{ progress: { processed, total, errors } }`

## Template codes

| code | Sheet | Layer |
|------|-------|-------|
| `htx` | HTX | economic_collective |
| `to_hop_tac` | Tổ hợp tác | economic_collective |
| `thuy_loi` | Thủy Lợi | pump_station |
| `vung_san_xuat` | Vùng sản xuất | production_zone |
| `sp_ocop` | SP OCOP | ocop_subject + ocop_product |

Chi tiết mapping: [import-excel-long-binh.md](../appendix/import-excel-long-binh.md)

## Yêu cầu

- Redis chạy (`docker compose up redis`) — chỉ khi Execute import
- Layer + schema phải tạo qua CRUD trước khi import

> **Lưu ý:** Import templates seed đã gỡ — tạo layer/field qua admin CRUD trước. UI import làm sau.
