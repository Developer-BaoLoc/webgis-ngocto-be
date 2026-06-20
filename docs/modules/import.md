# Import Excel — Theo lớp dữ liệu (Layer)

Luồng chính: **Tải file mẫu từ schema layer → User điền → Upload → Preview → Execute**.

Không cần `import_templates` seed hay `templateCode` cố định — file mẫu **sinh tự động** từ published schema.

## Endpoints (theo layer)

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/api/layers/:layerId/imports/template` | JWT | Tải file Excel mẫu |
| POST | `/api/layers/:layerId/imports/upload` | JWT | Upload file đã điền (`multipart/form-data`, field `file`) |
| POST | `/api/layers/:layerId/imports/:importId/preview` | JWT | Validate **toàn bộ file** + preview 20 dòng đầu |
| POST | `/api/layers/:layerId/imports/:importId/execute` | JWT | Import (chặn nếu còn lỗi validation) |

**Yêu cầu:** Layer phải có **schema published**. Danh mục (`category`) phải đã được gắn vào field; giá trị chưa có sẽ **tự thêm** khi import (xem bên dưới).

## Luồng FE

```
1. GET  /api/layers/:layerId/imports/template     → download .xlsx
2. User điền dữ liệu (từ dòng 4 sheet Du_lieu)
3. POST /api/layers/:layerId/imports/upload       → { importId, totalRows }
4. POST /api/layers/:layerId/imports/:importId/preview
5. POST /api/layers/:layerId/imports/:importId/execute
```

`importId` = tên file lưu tạm trên server (UUID.xlsx), trả về sau bước upload.

## Cấu trúc file Excel mẫu

Hệ thống sinh 3 sheet:

### Sheet `Du_lieu`

| Dòng | Nội dung |
|------|----------|
| 1 | Tiêu đề: `Mẫu import — {tên lớp}` |
| 2 | Header = **label field** (cột bắt buộc có dấu `*`) |
| 3 | Mã field (`ten_mo_hinh`, `dia_chi`, …) — **không sửa** |
| 4+ | Dữ liệu user điền (dòng STT=1 bắt đầu từ đây) |

Cột `STT` chỉ để theo dõi, không lưu DB. **Dòng 1–3 không phải dữ liệu** — parser bỏ qua tiêu đề / header / mã field; nếu xóa dòng mã field (dòng 3) thì dòng dữ liệu đầu tiên ngay bên dưới vẫn được import.

### Sheet `Huong_dan`

- Hướng dẫn chung
- Bảng field: bắt buộc, ghi chú kiểu dữ liệu, giá trị danh mục hợp lệ

### Sheet `_meta` (ẩn / không sửa)

JSON metadata: `layerId`, `schemaVersionId`, danh sách cột. Import từ chối file nếu thiếu sheet này.

## Field types trong mẫu

| Kiểu | Cột trong Excel | Ghi chú |
|------|-----------------|---------|
| text, integer, phone | Label field | |
| money | Label (đơn vị trong schema) | Nhập theo đơn vị schema, VD: `2.6`, `2420` (triệu đồng). Hỗ trợ số thập phân. Hệ thống tự quy đổi nếu nhập VNĐ đầy đủ |
| measurement | Label | Nhập số, VD: `17` (ha) |
| quantity | Label | `351 tấn` hoặc `42` |
| category | Label | Nhập **label** danh mục hoặc code; label mới → tự thêm vào danh mục |
| multi_category | Label | Nhiều giá trị, **mỗi giá trị một dòng** (Alt+Enter); label mới → tự thêm |
| lat_lng | Label | `10.123, 106.456` — **có thể để trống** khi import |
| image, file | **Không có** | Upload trong UI sau import |

### Tự thêm giá trị danh mục

Khi import `category` / `multi_category`, nếu label trong Excel **chưa có** trong danh mục dùng chung:

- **Preview:** mô phỏng khớp (không ghi DB), trả `dictionaryItemsCreated` và message gợi ý số giá trị sẽ thêm.
- **Execute:** tự tạo item mới (`label` giữ nguyên, `code` sinh từ label). Các lớp dùng chung danh mục đó sẽ thấy giá trị mới ngay.

So khớp label **không phân biệt dấu** (VD: `Trồng trọt` = `trong trot` nếu đã có).

## Preview response

Validate **tất cả dòng** trong file. FE hiển thị `errors` để user sửa Excel.

```json
{
  "importId": "uuid.xlsx",
  "layerId": "...",
  "totalRows": 13,
  "validRows": 11,
  "errorRows": 2,
  "errorCount": 5,
  "canImport": false,
  "message": "File có lỗi — sửa các dòng bên dưới rồi upload lại.",
  "columns": [
    { "fieldCode": "ten_mo_hinh", "label": "Tên mô hình", "required": true },
    { "fieldCode": "dia_chi", "label": "Địa chỉ", "required": true }
  ],
  "errors": [
    {
      "rowNumber": 5,
      "field": "dia_chi",
      "fieldLabel": "Địa chỉ",
      "rawValue": "Khu vực X",
      "code": "INVALID_CATEGORY",
      "message": "Giá trị \"Khu vực X\" không hợp lệ ở cột \"Địa chỉ\". Hãy dùng đúng tên trong sheet Huong_dan. Gợi ý: Kv Bình Lợi; KV Thạnh Hiếu; ..."
    },
    {
      "rowNumber": 8,
      "field": "ten_mo_hinh",
      "fieldLabel": "Tên mô hình",
      "rawValue": null,
      "code": "REQUIRED",
      "message": "Cột \"Tên mô hình\" bắt buộc — không được để trống"
    }
  ],
  "previewRows": [
    {
      "rowNumber": 4,
      "properties": { "ten_mo_hinh": "HTX ABC", "dia_chi": "kv_binh_loi" },
      "rawProperties": { "ten_mo_hinh": "HTX ABC", "dia_chi": "Kv Bình Lợi" },
      "errors": [],
      "valid": true
    }
  ],
  "previewCount": 13
}
```

- **`errorRows`**: số **dòng Excel** có lỗi (VD: 12)
- **`errorCount`**: tổng **số lỗi chi tiết** (một dòng có thể nhiều lỗi → VD: 48)
- **`columns`**: dùng làm header bảng preview (theo `fieldCode` / `label`), **không** lấy key từ `rawProperties`
- Parser tự nhận dòng tiêu đề / mã field nếu user xóa dòng 1 (tiêu đề) — vẫn map cột theo thứ tự trong `_meta`

### Mã lỗi (`code`)

| code | Ý nghĩa |
|------|---------|
| `REQUIRED` | Cột bắt buộc bị trống |
| `INVALID_CATEGORY` | Danh mục không khớp và không thể tự thêm (VD: danh mục không tồn tại) |
| `INVALID_MULTI_CATEGORY` | Một phần danh mục nhiều giá trị không hợp lệ |
| `INVALID_INTEGER` | Không phải số nguyên |
| `INVALID_MONEY` | Không phải số tiền |
| `INVALID_MEASUREMENT` | Không phải số đo |
| `INVALID_QUANTITY` | Không parse được (VD: `351 tấn`) |
| `INVALID_LAT_LNG` | Sai định dạng tọa độ |
| `DUPLICATE` | Trùng bản ghi (chỉ khi execute, không chặn import) |

## Execute response

**Chặn import** nếu `canImport === false` (HTTP 400):

```json
{
  "statusCode": 400,
  "message": {
    "code": "IMPORT_VALIDATION_FAILED",
    "message": "Không thể import vì file còn lỗi. Sửa Excel theo danh sách errors rồi upload lại.",
    "totalRows": 13,
    "validRows": 11,
    "errorRows": 2,
    "canImport": false,
    "errors": [ "... same as preview ..." ]
  }
}
```

**Thành công** (`canImport === true`):

```json
{
  "importId": "uuid.xlsx",
  "layerId": "...",
  "processed": 13,
  "created": 12,
  "duplicates": 1,
  "total": 13,
  "canImport": true,
  "validRows": 12,
  "errorRows": 0,
  "errors": [],
  "duplicateRows": [
    {
      "rowNumber": 6,
      "field": "ten_mo_hinh",
      "fieldLabel": "Tên mô hình",
      "rawValue": "HTX ABC",
      "code": "DUPLICATE",
      "message": "Dòng 6: bản ghi đã tồn tại (trùng Tên mô hình). Bản ghi này đã bỏ qua."
    }
  ],
  "message": "Import xong: 12 bản ghi mới, 1 dòng trùng đã bỏ qua."
}
```

- **Trùng lặp:** so theo field text bắt buộc đầu tiên — bỏ qua dòng trùng, vẫn import các dòng còn lại
- User **phải sửa file Excel và upload lại** khi preview có `canImport: false`
- **Schema đổi** sau khi tải mẫu → preview/execute trả lỗi, cần tải mẫu mới
- **File sai layer:** upload từ chối nếu `layerId` trong `_meta` không khớp

## API import cũ (legacy)

Vẫn tồn tại cho file Ngọc Tố nhiều sheet (cần `import_templates` trong DB + Redis):

| Method | Path |
|--------|------|
| GET | `/api/imports/templates` |
| POST | `/api/imports/upload` |
| POST | `/api/imports/:importId/preview` body `{ "templateCode": "htx" }` |
| POST | `/api/imports/:importId/execute` |

**Khuyến nghị FE:** dùng luồng **layer import** ở màn bảng dữ liệu từng lớp.

## Tham chiếu

- [import-excel-ngoc-to.md](../appendix/import-excel-ngoc-to.md) — file Excel tổng hợp cũ (legacy)
- [field-types.md](../appendix/field-types.md)
