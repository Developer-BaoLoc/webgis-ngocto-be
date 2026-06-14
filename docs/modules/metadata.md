# Metadata (Phase 1)

Metadata-driven layer catalog, CRUD layer/field, schema draft → publish.

## Endpoints — Catalog (read)

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/layers` | Public | Catalog project + layers active |
| GET | `/api/layers/:layerId` | JWT | Chi tiết layer |
| GET | `/api/layers/by-code/:code` | JWT | Layer theo code |
| GET | `/api/layers/:layerId/schema` | JWT | Schema hiện dùng (published; nếu chưa có → draft) |
| GET | `/api/layers/:layerId/schema?status=published` | JWT | Chỉ schema published (import, records) |
| GET | `/api/layers/:layerId/schema?status=draft` | JWT | Chỉ schema draft |
| GET | `/api/metadata/layer-geometry-types` | JWT | Loại layer: điểm / đường / vùng + style fields |
| GET | `/api/metadata/field-types` | JWT | Field types + `configFields` (đơn vị, danh mục) |
| GET | `/api/metadata/field-display-options` | JWT | Tuỳ chọn hiển thị field (popup bản đồ, …) |

## Endpoints — Layer CRUD

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/layers/admin` | JWT | Tất cả layers (kể cả inactive) |
| POST | `/api/layers` | JWT | Tạo layer + **tự publish** schema v1 (rỗng) |
| PATCH | `/api/layers/:layerId` | JWT | Cập nhật layer |
| DELETE | `/api/layers/:layerId` | JWT | **Xóa hẳn** layer + schema + toàn bộ bản ghi liên quan |

### POST — Tạo layer

**Mã lớp (`code`) backend tự sinh** từ `name`. FE không gửi `code`.

| `geometryType` | Label | Style bắt buộc |
|----------------|-------|----------------|
| `point` | Điểm | Upload icon → `style.iconAttachmentId` |
| `line` | Đường | Upload icon + `style.lineColor`, `style.lineWidth` |
| `polygon` | Vùng | Upload icon + `style.fillColor`, `style.strokeColor` |

```json
{
  "geometryType": "point",
  "name": "Chủ thể kinh tế tập thể",
  "description": "Mô tả",
  "sortOrder": 1,
  "style": {
    "iconAttachmentId": "uuid-từ-upload",
    "iconUrl": "/api/assets/uuid/file"
  }
}
```

Upload: [assets.md](./assets.md)

## Endpoints — Schema draft / fields

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/layers/:layerId/schema/draft` | Draft schema theo layer |
| GET | `/api/schema-drafts/:schemaId` | Draft schema theo schemaId |
| POST | `/api/layers/:layerId/schema/drafts` | Tạo draft (copy từ published) |
| PATCH | `/api/schema-drafts/:schemaId` | Cập nhật changeSummary |
| POST | `/api/schema-drafts/:schemaId/fields` | Thêm field vào draft → **tự publish** |
| PATCH | `/api/schema-drafts/:schemaId/fields/:fieldId` | Sửa field trong draft → **tự publish** |
| PATCH | `/api/schema-drafts/:schemaId/fields/reorder` | Sắp xếp thứ tự → **tự publish** |
| DELETE | `/api/schema-drafts/:schemaId/fields/:fieldId` | Ẩn field khỏi draft → **tự publish** |
| POST | `/api/schema-drafts/:schemaId/publish` | Publish thủ công (ít dùng) |

> **Frontend:** [frontend-crud-guide.md](./frontend-crud-guide.md)

**Layers không seed sẵn** — tạo qua `POST /api/layers`. Xóa layers cũ: `yarn db:clear-layers`.
