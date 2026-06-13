# Frontend — Hướng dẫn CRUD Admin

Tài liệu tích hợp API cho team frontend (Next.js).  
Base URL: `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api`

> Chi tiết từng module: [metadata.md](./metadata.md) · [records.md](./records.md) · [dictionaries.md](./dictionaries.md) · [auth.md](./auth.md)

## 1. Tổng quan — CRUD đã có API

| Nhóm | CRUD | Ghi chú |
|------|------|---------|
| **Layer** | ✅ Create, Read, Update, Delete | `POST/PATCH/DELETE /api/layers` |
| **Field (schema)** | ✅ Thêm / sửa / ẩn trong **draft** | Publish mới áp dụng records |
| **Record (bản ghi)** | ✅ Full CRUD + GeoJSON | Theo `layerId` |
| **Dictionary** | 🔶 Read only | `GET` — CRUD POST chưa có |
| **Import Excel** | 🔶 API có, **chưa dùng UI** | Làm sau khi layer/field ổn |

**Layers không còn seed sẵn** — admin tạo layer qua API rồi thêm fields → publish.

## 2. Auth (bắt buộc trước mọi thao tác admin)

```typescript
const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

async function login(email: string, password: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  return json.data.accessToken as string;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
```

Dev seed: `admin@longbinh.local` / `Admin@123`

## 3. Response format

Mọi endpoint Phase 1 trả `{ data, meta }`:

```json
{
  "data": { },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

List có pagination (records):

```json
{
  "data": [ /* items */ ],
  "meta": { "page": 1, "pageSize": 50, "total": 120, "totalPages": 3 }
}
```

Lỗi validation:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": [{ "field": "ten_chu_the", "message": "..." }]
  }
}
```

## 4. Flow admin — Layer + Field + Publish

### Bước 1 — Lấy catalog field types / geometry

```
GET /api/metadata/field-types
GET /api/metadata/geometry-kinds
```

Dùng cho dropdown khi tạo layer / field.

### Bước 2 — Tạo layer

```
POST /api/layers
```

```json
{
  "code": "economic_collective",
  "name": "Chủ thể kinh tế tập thể",
  "geometryKind": "point",
  "geometryRequired": false,
  "sortOrder": 1
}
```

**Quy tắc `code`:** snake_case, `[a-z][a-z0-9_]*`, unique trong tenant.

**Response:** layer + `draftSchemaId` (schema v1 draft, chưa publish).

### Bước 3 — Thêm fields vào draft

Dùng `draftSchemaId` từ bước 2 (hoặc `POST /api/layers/:layerId/schema/drafts` nếu layer cũ).

```
POST /api/schema-drafts/:schemaId/fields
```

```json
{
  "code": "ten_chu_the",
  "label": "Tên chủ thể",
  "fieldType": "text",
  "dataSchema": { "required": true },
  "sortOrder": 1
}
```

**Field types hỗ trợ:** `text`, `textarea`, `integer`, `decimal`, `money`, `measurement`, `quantity`, `phone`, `boolean`, `date`, `category`, `multi_category`, `reference`.

Category gắn dictionary:

```json
{
  "code": "khu_vuc",
  "label": "Khu vực",
  "fieldType": "category",
  "dataSchema": { "dictionary": "khu_vuc", "required": true }
}
```

Lấy items dictionary:

```
GET /api/dictionaries/khu_vuc/items
```

### Bước 4 — Sửa / xóa field trong draft

```
PATCH /api/schema-drafts/:schemaId/fields/:fieldId
DELETE /api/schema-drafts/:schemaId/fields/:fieldId
```

Chỉ sửa được khi schema **status = draft**. Xóa = đặt `isActive: false`.

### Bước 5 — Publish schema

```
POST /api/schema-drafts/:schemaId/publish
```

Sau publish:
- Records CRUD validate theo schema mới
- Muốn sửa schema → `POST /api/layers/:layerId/schema/drafts` (copy từ published) → chỉnh → publish lại (version +1)

### Bước 6 — Sửa / xóa layer

```
PATCH /api/layers/:layerId
DELETE /api/layers/:layerId
```

`DELETE` = soft delete (`isActive: false`). **Không xóa được** nếu layer còn records.

## 5. Flow — Records CRUD (sau khi schema published)

### List

```
GET /api/layers/:layerId/records?page=1&pageSize=50
```

### Tạo

```
POST /api/layers/:layerId/records
```

```json
{
  "properties": {
    "ten_chu_the": "HTX NN Bình Lợi",
    "loai_chu_the": "hop_tac_xa",
    "khu_vuc": "binh_loi"
  }
}
```

Geometry optional:

```json
{
  "properties": { "ten_tram_bom": "Trạm Bình Lợi" },
  "geometry": { "type": "Point", "coordinates": [105.785, 10.0125] }
}
```

### Cập nhật (optimistic lock)

```
PATCH /api/layers/:layerId/records/:recordId
```

```json
{
  "rowVersion": 1,
  "properties": { "tinh_trang": "active" }
}
```

409/400 nếu `rowVersion` lệch → reload record.

### Xóa

```
DELETE /api/layers/:layerId/records/:recordId
```

### GeoJSON (bản đồ)

```
GET /api/layers/:layerId/geojson?bbox=105.78,10.01,105.79,10.02&includeUnlocated=true
```

Public catalog (sidebar map, không cần login):

```
GET /api/layers
```

→ `{ data: { project, layers: [] } }` — rỗng cho đến khi admin tạo layer.

## 6. Gợi ý màn hình FE

| Màn | API chính |
|-----|-----------|
| **Quản lý lớp dữ liệu** | `GET /layers/admin`, `POST/PATCH/DELETE /layers` |
| **Thiết kế schema** | draft fields + publish |
| **Danh sách bản ghi** | `GET .../records` + render cột từ `GET .../schema` |
| **Form thêm/sửa** | render input từ `fieldType` + `dataSchema` |
| **Bản đồ** | `GET /layers` + `GET .../geojson` |

## 7. Ví dụ Long Bình — tạo layer HTX

```typescript
// 1. Login
const token = await login('admin@longbinh.local', 'Admin@123');
const h = authHeaders(token);

// 2. Tạo layer
const layerRes = await fetch(`${API}/layers`, {
  method: 'POST', headers: h,
  body: JSON.stringify({
    code: 'economic_collective',
    name: 'Chủ thể kinh tế tập thể',
    geometryKind: 'point',
    sortOrder: 1,
  }),
});
const { data: layer } = await layerRes.json();
const schemaId = layer.draftSchemaId;

// 3. Thêm fields
const fields = [
  { code: 'ten_chu_the', label: 'Tên chủ thể', fieldType: 'text', dataSchema: { required: true } },
  { code: 'loai_chu_the', label: 'Loại chủ thể', fieldType: 'category', dataSchema: { dictionary: 'loai_chu_the' } },
  { code: 'khu_vuc', label: 'Khu vực', fieldType: 'category', dataSchema: { dictionary: 'khu_vuc' } },
];
for (const [i, f] of fields.entries()) {
  await fetch(`${API}/schema-drafts/${schemaId}/fields`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ ...f, sortOrder: i + 1 }),
  });
}

// 4. Publish
await fetch(`${API}/schema-drafts/${schemaId}/publish`, { method: 'POST', headers: h });

// 5. Tạo record
await fetch(`${API}/layers/${layer.id}/records`, {
  method: 'POST', headers: h,
  body: JSON.stringify({
    properties: { ten_chu_the: 'HTX NN Bình Lợi', loai_chu_the: 'hop_tac_xa', khu_vuc: 'binh_loi' },
  }),
});
```

## 8. Dictionaries có sẵn (seed)

| code | Mô tả |
|------|--------|
| `loai_chu_the` | Hợp tác xã / Tổ hợp tác |
| `tinh_trang_hoat_dong` | Tình trạng HĐ |
| `xep_hang_ocop` | Xếp hạng OCOP |
| `loai_bom` | Loại bơm |
| `khu_vuc` | 10 khu vực phường (tenant) |
| `nganh_nghe` | Ngành nghề |

## 9. Prototype routes — không dùng

Các route cũ (`/api/cooperatives`, `/api/irrigation`, …) deprecated. Dùng `/api/layers/:layerId/...` thay thế.

## 10. Tham chiếu

- [api-conventions.md](../appendix/api-conventions.md)
- [field-types.md](../appendix/field-types.md)
