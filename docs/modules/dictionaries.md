# Dictionaries (Phase 1)

Read-only danh mục hệ thống + tenant.

## Endpoints

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/dictionaries` | JWT | Danh sách dictionaries |
| GET | `/api/dictionaries/:code/items` | JWT | Items (flat hoặc tree) |

## Codes seed Long Bình

- `loai_chu_the`, `tinh_trang_hoat_dong`, `xep_hang_ocop`, `loai_bom`
- `khu_vuc` (tenant — 10 khu vực phường)
- `nganh_nghe` (Phase 1 seed)

Field schema tham chiếu dictionary qua `dataSchema.dictionary`.
