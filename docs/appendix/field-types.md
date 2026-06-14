# Field Type Registry

Registry kiểu trường — admin **chọn từ danh sách**, không tự nhập chuỗi tùy ý. Mỗi type có handler: validate, normalize, filter operators, aggregation support.

## Interface handler

```typescript
interface FieldTypeHandler {
  type: string;

  validate(value: unknown, config: Record<string, unknown>): ValidationResult;

  normalize(value: unknown, config: Record<string, unknown>): unknown;

  getFilterOperators(): string[];

  getAggregationFunctions(): string[];
}
```

## Phase 1 — Types bắt buộc

| field_type | Mô tả | Value shape | Aggregation |
|------------|--------|-------------|-------------|
| `text` | Chuỗi ngắn | string | count |
| `textarea` | Chuỗi dài | string | — |
| `integer` | Số nguyên | number | sum, avg, min, max, count |
| `decimal` | Số thập phân | number | sum, avg, min, max |
| `money` | Tiền tệ VND | `{ amount, currency, sourceValue?, sourceScale? }` | sum, avg |
| `measurement` | Diện tích, khoảng cách | `{ value, unit, normalizedValue, normalizedUnit }` | sum, avg |
| `quantity` | Sản lượng có đơn vị | `{ value, unit }` hoặc array | sum (same unit only) |
| `phone` | Số điện thoại VN | string (normalized) | — |
| `boolean` | Có/Không | boolean | count |
| `date` | Ngày | ISO date string | min, max |
| `category` | Danh mục 1 giá trị | string (dictionary item code) | count, group |
| `multi_category` | Danh mục nhiều giá trị | string[] | — |
| `reference` | Liên kết feature khác | uuid | — |
| `lat_lng` | Toạ độ | `{ lat, lng }` | — |
| `area_polygon` | Vùng (polygon) | `{ coordinates: [{ lat, lng }, ...] }` (≥3 điểm) | — |
| `image` | Hình ảnh (nhiều) | `AttachmentRef[]` | — |
| `file` | Tệp tin (nhiều) | `AttachmentRef[]` | — |

## Phase 2 — Bổ sung

| field_type | Mô tả |
|------------|--------|
| `email` | Email validated |
| `url` | URL |
| `status` | operational_status + status_note |

## Phase 3 — Bổ sung

| field_type | Mô tả |
|------------|--------|
| `computed` | Formula từ field khác |
| `hierarchical_select` | Dictionary tree single |
| `multi_reference` | N feature references |

## Config mẫu

### money

**Đơn vị bắt buộc** (`dataSchema.unit`):

| code | Label |
|------|-------|
| `vnd` | VNĐ |
| `hundred_thousand` | Trăm nghìn đồng |
| `million` | Triệu đồng |
| `billion` | Tỷ đồng |

```json
{
  "fieldType": "money",
  "dataSchema": {
    "required": false,
    "unit": "million"
  }
}
```

Value shape sau normalize:

```json
{ "amount": 2420000000, "currency": "VND", "unit": "million", "sourceValue": 2420, "sourceUnit": "million" }
```

- `amount` — luôn quy đổi về **VNĐ** (để tính toán/aggregation)
- `sourceValue` + `sourceUnit` — giá trị user nhập (2420 triệu)
- Hiển thị popup/chi tiết: dùng `sourceValue` + label đơn vị; nếu thiếu `sourceValue` thì `amount / hệ số đơn vị`

### measurement

**Loại + đơn vị bắt buộc:**

| measurementType | Đơn vị |
|-----------------|--------|
| `distance` | `m`, `km` |
| `area` | `m2`, `ha` |

```json
{
  "fieldType": "measurement",
  "dataSchema": {
    "measurementType": "area",
    "unit": "ha",
    "required": true
  }
}
```

Normalize:
- `17` + unit `ha` → `{ value: 17, unit: "ha", measurementType: "area", normalizedValue: 170000, normalizedUnit: "m2" }`
- `2.5` + unit `km` → `{ value: 2.5, unit: "km", measurementType: "distance", normalizedValue: 2500, normalizedUnit: "m" }`

### quantity (sản lượng)

**Đơn vị bắt buộc** (`dataSchema.unit`):

| code | Label |
|------|-------|
| `kg` | kg |
| `tan` | tấn |
| `lit` | lít |
| `m3` | m³ |
| `con` | con |
| `bo` | bó |
| `cay` | cây |

```json
{
  "fieldType": "quantity",
  "dataSchema": {
    "unit": "kg",
    "required": true
  }
}
```

Value: `{ "value": 1500, "unit": "kg" }`

### category

Danh mục **dùng chung** — bắt buộc chọn `dataSchema.dictionary`:

```json
{
  "fieldType": "category",
  "dataSchema": {
    "dictionary": "nganh_nghe_san_xuat",
    "required": true
  }
}
```

Tạo danh mục: `POST /api/dictionaries`, thêm mục: `POST /api/dictionaries/:code/items`.

Import: fuzzy match "Dịch vụ bơm tưới" → "bom_tuoi" dictionary item. Label chưa có → **tự thêm** khi import Excel (xem [import.md](./import.md)).

### multi_category (Chọn nhiều)

Giống `category` nhưng lưu mảng code: `["bom_dien", "bom_dau"]`.

- **Hiển thị:** mỗi label trên một dòng
- **Import Excel:** mỗi giá trị một dòng trong ô (Alt+Enter); vẫn chấp nhận dấu phẩy trên một dòng (tương thích file cũ)

### lat_lng (Toạ độ)

```json
{
  "fieldType": "lat_lng",
  "dataSchema": {
    "required": false
  },
  "uiSchema": {
    "component": "lat_lng"
  }
}
```

Value trong `properties`:

```json
{
  "vi_tri": { "lat": 10.0125, "lng": 105.785 }
}
```

- `lat`: -90 … 90 (vĩ độ)
- `lng`: -180 … 180 (kinh độ)

**Lớp điểm (`point`):** BE tự đồng bộ `{ lat, lng }` → PostGIS `geometry` (Point) khi tạo/sửa bản ghi. GeoJSON endpoint cũng fallback từ `properties` nếu geometry chưa lưu.

### area_polygon (Vùng)

Dùng cho **lớp vùng (`polygon`)** — lưu danh sách đỉnh polygon:

```json
{
  "fieldType": "area_polygon",
  "dataSchema": {
    "required": false
  },
  "uiSchema": {
    "component": "area_polygon"
  }
}
```

Value trong `properties`:

```json
{
  "ranh_vung": {
    "coordinates": [
      { "lat": 10.0125, "lng": 105.785 },
      { "lat": 10.0130, "lng": 105.790 },
      { "lat": 10.0110, "lng": 105.792 }
    ]
  }
}
```

- Tối thiểu **3 điểm** `{ lat, lng }`
- BE tự đóng vòng polygon và đồng bộ → PostGIS `geometry` (Polygon)
- Import Excel: `"10.01,105.78; 10.02,105.79; 10.03,105.80"` hoặc JSON `coordinates`

### image (Hình ảnh — nhiều ảnh)

Upload trước, lưu mảng attachment vào `properties`:

```
POST /api/assets/field-images/upload        (1 ảnh, field: file)
POST /api/assets/field-images/upload-batch  (nhiều ảnh, field: files)
```

Định dạng: PNG, JPEG, WebP, GIF — tối đa 5MB/ảnh, tối đa 20 ảnh/trường.

```json
{
  "fieldType": "image",
  "dataSchema": { "required": false, "maxCount": 10 }
}
```

Value trong `properties`:

```json
{
  "hinh_anh": [
    {
      "attachmentId": "uuid",
      "url": "/api/assets/uuid/file",
      "originalName": "htx.jpg",
      "mimeType": "image/jpeg",
      "sizeBytes": 245000
    }
  ]
}
```

FE có thể gửi chỉ `[{ "attachmentId": "uuid" }]` — BE tự bổ sung `url`.

### file (Tệp tin — nhiều file)

```
POST /api/assets/field-files/upload
POST /api/assets/field-files/upload-batch
```

Định dạng: PDF, Word, Excel, ZIP, TXT, CSV — tối đa 10MB/file, tối đa 20 file/trường.

```json
{
  "fieldType": "file",
  "dataSchema": { "required": true }
}
```

Value shape giống `image` (mảng `AttachmentRef`).

### status

```json
{
  "fieldType": "status",
  "dataSchema": {
    "dictionaryCode": "operational_status"
  }
}
```

Normalize:
- "Đang HĐ" / "Đang hoạt động" → `active`
- "Không HĐ" → `inactive`
- "Hiện đang không sản xuất" → `{ operationalStatus: "seasonal", statusNote: "..." }`

## Filter operators theo type

| Type | Operators |
|------|-----------|
| text | eq, ne, contains, starts_with, is_empty |
| number/money/measurement | eq, ne, gt, gte, lt, lte, between |
| category | eq, ne, in, not_in |
| date | eq, before, after, between |
| boolean | eq |

## Ba schema tách biệt

| Schema | Ví dụ |
|--------|--------|
| **data_schema** | required, validation, default, dictionaryCode |
| **ui_schema** | component, section, width, placeholder, conditional |
| **display_schema** | showOnMapPopup, popupBold, popupFontSize, popupTextColor, visibleInTable, format, sortable |

### displaySchema — popup bản đồ

| Key | Label UI | Mô tả |
|-----|----------|-------|
| `showOnMapPopup` | Hiển thị khi click trên bản đồ | Bật = hiện trong popup khi click icon |
| `popupBold` | In đậm | In đậm giá trị trên popup |
| `popupFontSize` | Cỡ chữ | `small` · `medium` · `large` |
| `popupTextColor` | Màu chữ | Hex `#RRGGBB` |

BE trả `popupStyle: { bold?, fontSize?, color? }` trong `popupSummary` (GeoJSON) và `display.popup[]`.

Catalog: `GET /api/metadata/field-display-options`

## Tham chiếu

- [data-model.md](../data-model.md)
- [import-excel-long-binh.md](./import-excel-long-binh.md)
