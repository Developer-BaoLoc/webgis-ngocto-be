# Dictionaries — Danh mục dùng chung

## Khái niệm

```
Danh mục (Dictionary)          →  nhóm lựa chọn, đặt tên một lần
  └── Giá trị (values/items)   →  các option trong select/checkbox

Field lớp dữ liệu
  fieldType: category          →  chọn MỘT giá trị từ danh mục
  fieldType: multi_category    →  chọn NHIỀU giá trị từ danh mục
  dataSchema.dictionary        →  mã danh mục đã tạo
```

**Ví dụ**

| Danh mục | Giá trị trong danh mục | Field HTX | Giá trị lưu trên bản ghi |
|----------|------------------------|-----------|---------------------------|
| Ngành nghề sản xuất | Trồng trọt, Chăn nuôi, Dịch vụ | `category` + `dictionary: nganh_nghe_san_xuat` | `"trong_trot"` |
| Loại bơm | Bơm điện, Bơm dầu | `multi_category` | `["bom_dien", "bom_dau"]` |

Cùng một danh mục có thể gắn vào **nhiều lớp dữ liệu** khác nhau.

**Không seed sẵn** — admin tạo danh mục + giá trị qua màn quản trị.

## Endpoints — Danh mục

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/dictionaries` | Danh sách + `itemCount` (số giá trị) |
| POST | `/api/dictionaries` | Tạo danh mục; có thể kèm `values[]` ban đầu |
| GET | `/api/dictionaries/:code?includeItems=true` | Chi tiết + danh sách giá trị |
| PATCH | `/api/dictionaries/:code` | Sửa tên, mô tả |
| DELETE | `/api/dictionaries/:code` | Xóa danh mục và mọi giá trị |

## Endpoints — Giá trị trong danh mục

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/dictionaries/:code/items` | Giá trị active (load options cho form/select) |
| POST | `/api/dictionaries/:code/items` | Thêm **một** giá trị |
| POST | `/api/dictionaries/:code/items/batch` | Thêm **nhiều** giá trị cùng lúc |
| PATCH | `/api/dictionaries/:code/items/:itemId` | Sửa label, thứ tự |
| DELETE | `/api/dictionaries/:code/items/:itemId` | Ẩn giá trị |

## Tạo danh mục kèm giá trị

```json
POST /api/dictionaries
{
  "name": "Ngành nghề sản xuất",
  "description": "Phân loại ngành nghề HTX",
  "values": [
    { "label": "Trồng trọt" },
    { "label": "Chăn nuôi" },
    { "label": "Dịch vụ bơm tưới" }
  ]
}
```

Response — `code` BE sinh từ `name`; mỗi giá trị có `code` sinh từ `label`:

```json
{
  "data": {
    "code": "nganh_nghe_san_xuat",
    "name": "Ngành nghề sản xuất",
    "itemCount": 3,
    "values": [
      { "id": "uuid", "code": "trong_trot", "label": "Trồng trọt", "sortOrder": 1 },
      { "id": "uuid", "code": "chan_nuoi", "label": "Chăn nuôi", "sortOrder": 2 }
    ]
  }
}
```

## Thêm giá trị sau khi tạo danh mục

Một giá trị:

```json
POST /api/dictionaries/nganh_nghe_san_xuat/items
{ "label": "Thủy sản" }
```

Nhiều giá trị:

```json
POST /api/dictionaries/nganh_nghe_san_xuat/items/batch
{
  "values": [
    { "label": "Chế biến" },
    { "label": "Công nghệ cao" }
  ]
}
```

## Gắn danh mục vào field lớp dữ liệu

```json
POST /api/schema-drafts/:schemaId/fields
{
  "label": "Ngành nghề",
  "fieldType": "category",
  "dataSchema": {
    "dictionary": "nganh_nghe_san_xuat",
    "required": true
  }
}
```

Form nhập liệu / bản ghi:

```
GET /api/dictionaries/nganh_nghe_san_xuat/items
→ render select: label hiển thị, lưu properties.nganh_nghe = item.code
```

> **Frontend:** [frontend-crud-guide.md](./frontend-crud-guide.md) — mục **6.1 Quản lý danh mục dùng chung**
