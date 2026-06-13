# Metadata (Phase 1)

Metadata-driven layer catalog, CRUD layer/field, schema draft → publish.

## Endpoints — Catalog (read)

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/layers` | Public | Catalog project + layers active |
| GET | `/api/layers/:layerId` | JWT | Chi tiết layer |
| GET | `/api/layers/by-code/:code` | JWT | Layer theo code |
| GET | `/api/layers/:layerId/schema` | JWT | Published schema |
| GET | `/api/layers/:layerId/schema?status=draft` | JWT | Draft schema |
| GET | `/api/layers/:layerId/schema/draft` | JWT | Draft schema (alias) |
| GET | `/api/metadata/field-types` | JWT | Danh sách field types |
| GET | `/api/metadata/geometry-kinds` | JWT | Danh sách geometry kinds |

## Endpoints — Layer CRUD

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/layers/admin` | JWT | Tất cả layers (kể cả inactive) |
| POST | `/api/layers` | JWT | Tạo layer + draft schema v1 |
| PATCH | `/api/layers/:layerId` | JWT | Cập nhật layer |
| DELETE | `/api/layers/:layerId` | JWT | Soft delete (cần không còn records) |

### POST body — tạo layer

```json
{
  "code": "my_layer",
  "name": "Tên layer",
  "geometryKind": "point",
  "geometryRequired": false,
  "sortOrder": 10
}
```

## Endpoints — Schema draft / fields

| Method | Path | Mô tả |
|--------|------|-------|
| POST | `/api/layers/:layerId/schema/drafts` | Tạo draft (copy từ published) |
| PATCH | `/api/schema-drafts/:schemaId` | Cập nhật changeSummary |
| POST | `/api/schema-drafts/:schemaId/publish` | Publish draft |
| POST | `/api/schema-drafts/:schemaId/fields` | Thêm field vào draft |
| PATCH | `/api/schema-drafts/:schemaId/fields/:fieldId` | Sửa field trong draft |
| DELETE | `/api/schema-drafts/:schemaId/fields/:fieldId` | Ẩn field khỏi draft |

### POST field body

```json
{
  "code": "ten_chu_the",
  "label": "Tên chủ thể",
  "fieldType": "text",
  "dataSchema": { "required": true },
  "sortOrder": 1
}
```

## Flow admin

1. `POST /api/layers` → layer + draft v1
2. `POST /api/schema-drafts/:id/fields` → thêm fields
3. `POST /api/schema-drafts/:id/publish` → schema active
4. Records CRUD dùng published schema

Sửa schema đã publish: `POST .../schema/drafts` → chỉnh fields → publish (version mới).

> **Frontend:** xem [frontend-crud-guide.md](./frontend-crud-guide.md) — hướng dẫn tích hợp đầy đủ.

**Layers không seed sẵn** — tạo qua `POST /api/layers`. Xóa layers seed cũ: `yarn db:clear-layers`.
