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

## Phase 2 — Bổ sung

| field_type | Mô tả |
|------------|--------|
| `email` | Email validated |
| `url` | URL |
| `image` | attachment_id[] |
| `file` | attachment_id[] |
| `status` | operational_status + status_note |

## Phase 3 — Bổ sung

| field_type | Mô tả |
|------------|--------|
| `computed` | Formula từ field khác |
| `hierarchical_select` | Dictionary tree single |
| `multi_reference` | N feature references |

## Config mẫu

### money

```json
{
  "fieldType": "money",
  "dataSchema": {
    "required": false,
    "currency": "VND",
    "defaultScale": "million",
    "min": 0
  },
  "displaySchema": {
    "format": "vi-VN",
    "showScale": "triệu đồng"
  }
}
```

Normalize import:
- `2420` + header "triệu đồng" → `{ amount: 2420000000, sourceScale: "million" }`
- `7923000000` → `{ amount: 7923000000, sourceScale: "unit" }`

### measurement (diện tích)

```json
{
  "fieldType": "measurement",
  "dataSchema": {
    "measurementType": "area",
    "allowedUnits": ["m2", "ha"],
    "storageUnit": "m2",
    "displayUnit": "ha"
  }
}
```

Normalize:
- `17` + header "(ha)" → `{ value: 17, unit: "ha", normalizedValue: 170000, normalizedUnit: "m2" }`
- `"40m2"` → `{ value: 40, unit: "m2", normalizedValue: 40, normalizedUnit: "m2" }`

### quantity (sản lượng)

```json
{
  "fieldType": "quantity",
  "dataSchema": {
    "allowedUnits": ["tan", "lit", "con", "ha"]
  }
}
```

Case phức tạp `"10.000 con lươn, 5.000 con ếch"` → child layer `production_output` (Phase 3), không parse thành 1 string.

### category

```json
{
  "fieldType": "category",
  "dataSchema": {
    "dictionaryCode": "nganh_nghe",
    "allowCustom": false
  }
}
```

Import: fuzzy match "Dịch vụ bơm tưới" → "bom_tuoi" dictionary item.

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
| **display_schema** | visibleInTable, visibleInPopup, format, sortable |

## Tham chiếu

- [data-model.md](../data-model.md)
- [import-excel-long-binh.md](./import-excel-long-binh.md)
