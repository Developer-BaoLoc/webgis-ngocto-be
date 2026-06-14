# Assets — Upload file

Upload icon layer, hình ảnh field, và tệp tin field.

## Endpoints

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/api/assets/layer-icons/upload` | JWT | Icon layer (PNG/JPEG/WebP/SVG, max 512KB) |
| POST | `/api/assets/field-images/upload` | JWT | 1 ảnh field |
| POST | `/api/assets/field-images/upload-batch` | JWT | Nhiều ảnh (`files[]`) |
| POST | `/api/assets/field-files/upload` | JWT | 1 file field |
| POST | `/api/assets/field-files/upload-batch` | JWT | Nhiều file (`files[]`) |
| GET | `/api/assets/:attachmentId/file` | **Public** | Tải/xem file |

## Field type `image`

```
POST /api/assets/field-images/upload
Content-Type: multipart/form-data
Field: file
```

Upload nhiều ảnh:

```
POST /api/assets/field-images/upload-batch
Field: files   (lặp nhiều lần)
```

- Định dạng: PNG, JPEG, WebP, GIF
- Tối đa: **5MB/ảnh**, **20 ảnh** mỗi trường / mỗi lần batch

**Response:**

```json
{
  "data": {
    "attachmentId": "uuid",
    "url": "/api/assets/uuid/file",
    "originalName": "htx.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 245000
  }
}
```

Batch response: `{ "items": [...], "count": 3 }`.

## Field type `file`

```
POST /api/assets/field-files/upload
POST /api/assets/field-files/upload-batch
```

- Định dạng: PDF, DOC, DOCX, XLS, XLSX, ZIP, TXT, CSV
- Tối đa: **10MB/file**, **20 file** mỗi trường

## Lưu vào bản ghi

Field `image` / `file` lưu **mảng** trong `properties`:

```json
{
  "hinh_anh": [
    { "attachmentId": "uuid", "url": "/api/assets/uuid/file", "originalName": "a.jpg" }
  ]
}
```

Có thể gửi chỉ `{ "attachmentId": "uuid" }` — BE normalize thêm `url`.

Tùy chọn schema: `dataSchema.maxCount` (mặc định 20).

## Icon layer (điểm)

```
POST /api/assets/layer-icons/upload
```

Dùng khi tạo layer `geometryType: point` — xem hướng dẫn cũ bên dưới.

```json
{
  "geometryType": "point",
  "name": "Trạm bơm",
  "style": {
    "iconAttachmentId": "uuid-từ-upload",
    "iconUrl": "/api/assets/uuid/file"
  }
}
```

## MapLibre (icon layer)

```typescript
const iconUrl = `${API_BASE}${layer.style.icon.url}`;
const img = await map.loadImage(iconUrl);
map.addImage(`layer-${layer.id}`, img.data);
```

URL public — không cần JWT.

## Storage

- **MinIO** (ưu tiên): `layer-icons/`, `field-images/`, `field-files/` trong bucket
- **Fallback local**: `uploads/` nếu MinIO chưa chạy

```bash
docker compose up -d minio
```

## Config

Xem `.env.example`: `MINIO_*`

> **Frontend field upload:** [frontend-crud-guide.md](./frontend-crud-guide.md)
