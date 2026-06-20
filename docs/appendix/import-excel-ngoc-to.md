# Import Excel — File mẫu Ngọc Tố

File: `BẢNG TỔNG HỢP SỐ LIỆU NÔNG NGHIỆP...xlsx`

## 1. Tổng quan sheet

| Sheet | Bản ghi (~) | Target layer | Phase |
|-------|-------------|--------------|-------|
| HTX | 13 | economic_collective | 1 |
| Tổ hợp tác | 5 | economic_collective | 1 |
| Thủy Lợi | 18 | pump_station | 1 |
| Vùng sản xuất | 3 | production_zone | 1 |
| SP OCOP | 8 chủ thể / 19 SP | ocop_subject + ocop_product | 1 |
| MH Hiệu quả | ~15 | program_participation | **3** |

## 2. Quy tắc chung import

```
Upload → Chọn sheet → Chọn template
  → Map cột → Preview 20 dòng
  → Validate + normalize đơn vị
  → Dedup check
  → Background job → Báo cáo lỗi từng dòng
```

- Geometry: **null** sau import (vẽ ở Phase 2)
- `location_status`: `unlocated`
- Lưu template để tái sử dụng

## 3. Sheet HTX

### Template config

```json
{
  "sheetName": "HTX",
  "headerRow": 2,
  "titleRows": [1],
  "targetLayer": "economic_collective",
  "fixedValues": {
    "loai_chu_the": "hop_tac_xa"
  },
  "columnMapping": {
    "Tên Mô hình": "ten_chu_the",
    "Người đại diện": "nguoi_dai_dien",
    "Địa chỉ": "khu_vuc",
    "Ngành nghề sản xuất/kinh doanh": "nganh_nghe",
    "Diện tích (ha)": "dien_tich",
    "Quy trình sản xuất": "quy_trinh",
    "Số thành viên": "so_thanh_vien",
    "Sản lượng": "san_luong",
    "Kênh tiêu thụ": "kenh_tieu_thu",
    "Chi phí/năm\n (triệu đồng)": "chi_phi_nam",
    "Thu nhập/năm \n(triệu đồng)": "thu_nhap_nam",
    "Lợi nhuận/năm (triệu đồng)": "loi_nhuan_nam",
    "Số điện thoại": "so_dien_thoai",
    "Tình trạng HĐ": "tinh_trang",
    "Ghi chú": "ghi_chu"
  },
  "unitHints": {
    "chi_phi_nam": "million_vnd",
    "thu_nhap_nam": "million_vnd",
    "loi_nhuan_nam": "million_vnd",
    "dien_tich": "ha"
  },
  "dedupKey": ["ten_chu_the", "loai_chu_the"]
}
```

### Normalize địa chỉ

| Excel | Dictionary code |
|-------|-----------------|
| Kv Bình Lợi | binh_loi |
| KV Thạnh Hiếu | thanh_hieu |
| Kv Bình Lợi + Bình Trung | binh_loi, binh_trung (multi) |

## 4. Sheet Tổ hợp tác

Giống HTX, thay:

```json
{
  "fixedValues": { "loai_chu_the": "to_hop_tac" }
}
```

## 5. Sheet Thủy Lợi

```json
{
  "sheetName": "Thủy Lợi",
  "headerRow": 2,
  "skipRows": [1],
  "targetLayer": "pump_station",
  "columnMapping": {
    "Tên trạm bơm": "ten_tram_bom",
    "Người đại diện": "nguoi_dai_dien",
    "Địa chỉ": "khu_vuc",
    "Ngành nghề sản xuất/kinh doanh": "nganh_nghe",
    "Diện tích (ha)": "dien_tich_phuc_vu",
    "Quy trình sản xuất": "quy_trinh",
    "Số thành viên": "so_thanh_vien",
    "Sản lượng": "san_luong",
    "Kênh tiêu thụ": "kenh_tieu_thu",
    "Chi phí/năm (triệu đồng)": "chi_phi_nam",
    "Thu nhập/năm (triệu đồng)": "thu_nhap_nam",
    "Lợi nhuận/năm(triệu đồng)": "loi_nhuan_nam",
    "Số điện thoại": "so_dien_thoai",
    "Tình trạng HĐ": "tinh_trang",
    "Ghi chú": "loai_bom"
  },
  "unitHints": {
    "chi_phi_nam": "million_vnd",
    "dien_tich_phuc_vu": "ha"
  },
  "notes": "Cột Ghi chú map vào loai_bom: Bơm điện / Bơm dầu"
}
```

## 6. Sheet Vùng sản xuất

```json
{
  "sheetName": "Vùng sản xuất",
  "headerRow": 2,
  "targetLayer": "production_zone",
  "geometry": null,
  "columnMapping": {
    "Tên trạm bơm": "ten_vung",
    "Người đại diện": "danh_sach_nguoi",
    "Địa chỉ": "khu_vuc",
    "Ngành nghề\n sản xuất/\nkinh doanh": "nganh_nghe",
    "Diện tích\n (ha)": "dien_tich",
    "Quy trình\n sản xuất": "quy_trinh",
    "Số thành \nviên": "so_thanh_vien",
    "Sản lượng": "san_luong",
    "Kênh tiêu\n thụ": "kenh_tieu_thu",
    "Chi phí/năm \n(triệu đồng)": "chi_phi_nam",
    "Thu nhập/\nnăm \n(triệu đồng)": "thu_nhap_nam",
    "Lợi nhuận/\nnăm\n(triệu đồng)": "loi_nhuan_nam",
    "Số điện thoại": "so_dien_thoai",
    "Tình trạng \nHĐ": "tinh_trang",
    "Ghi chú": "ghi_chu"
  },
  "notes": "Header cột 1 ghi Tên trạm bơm nhưng nội dung là tên vùng. Geometry vẽ polygon Phase 2."
}
```

**Lưu ý:** `danh_sach_nguoi` nhiều dòng → Phase 1 lưu textarea; Phase 3 chuyển `contact_person` child records.

## 7. Sheet SP OCOP — parent-child

```json
{
  "sheetName": "SP OCOP",
  "headerRow": 2,
  "mode": "parent_child",
  "parentLayer": "ocop_subject",
  "childLayer": "ocop_product",
  "parentDetect": "STT column not empty",
  "forwardFillParentFields": [
    "Chủ thể",
    "Người đại diện",
    "Địa chỉ",
    "Số điện thoại",
    "Tình trạng HĐ"
  ],
  "parentMapping": {
    "Chủ thể": "ten_chu_the",
    "Người đại diện": "nguoi_dai_dien",
    "Địa chỉ": "khu_vuc",
    "Số điện thoại": "so_dien_thoai",
    "Tình trạng HĐ": "tinh_trang"
  },
  "childMapping": {
    "Tên Sản phẩm OCOP": "ten_san_pham",
    "Xếp hạng": "xep_hang",
    "Ngành nghề sản xuất/kinh doanh": "nganh_nghe",
    "Diện tích (ha)": "dien_tich",
    "Quy trình sản xuất": "quy_trinh",
    "Số thành viên": "so_thanh_vien",
    "Sản lượng": "san_luong",
    "Kênh tiêu thụ": "kenh_tieu_thu",
    "Chi phí/năm ": "chi_phi_nam",
    "Thu nhập/năm": "thu_nhap_nam",
    "Lợi nhuận/năm": "loi_nhuan_nam"
  },
  "relation": {
    "type": "owns",
    "parentLayer": "ocop_subject",
    "childLayer": "ocop_product"
  },
  "unitHints": {
    "dien_tich": "auto",
    "notes": "40m2, 1000m2 trong file — parse m2 not ha"
  }
}
```

### Ví dụ cấu trúc

```
Cơ sở 10 Oanh (parent)
├── Rượu nếp than 10 Oanh (child)
└── Rượu hương nếp 10 Oanh (child)

Công ty TNHH 3 Sương (parent)
├── Khóm sấy dẻo muối ớt
├── Xoài sấy dẻo
└── ...
```

## 8. Sheet MH Hiệu quả — Phase 3

```json
{
  "sheetName": "MH Hiệu quả",
  "headerRow": 2,
  "mode": "program_participation",
  "targetProgram": "mo_hinh_hieu_qua",
  "categoryRows": {
    "detectWhen": "column_B_is_category_header",
    "values": ["Trồng trọt", "Thủy sản", "Công nghệ cao"],
    "targetField": "category"
  },
  "entityMatch": {
    "layer": "economic_collective",
    "matchField": "ten_chu_the",
    "normalize": "lower_trim",
    "onNotFound": "create_or_review"
  },
  "notes": "Không tạo feature mới nếu đã có HTX/THT trùng tên"
}
```

## 9. Entity matching cross-sheet

| Tên trong file | Sheets | Hành động |
|----------------|--------|-----------|
| HTX NN Bình Hiếu | HTX, MH Hiệu quả | 1 feature + participation |
| HTX NS Mekong Delta | HTX, MH, OCOP | Link ocop_subject ↔ economic_collective nếu cùng entity |

Match key: `normalize(ten) + loai_chu_the`

## 10. Báo cáo lỗi import

Mỗi dòng lỗi trả về:

```json
{
  "row": 5,
  "sheet": "HTX",
  "errors": [
    { "field": "loi_nhuan_nam", "code": "PROFIT_MISMATCH", "message": "Lợi nhuận ≠ thu nhập - chi phí" },
    { "field": "dien_tich", "code": "MISSING_VALUE", "message": "Thiếu diện tích" }
  ],
  "warnings": [
    { "field": "so_dien_thoai", "code": "MISSING_OPTIONAL" }
  ]
}
```

## 11. Tham chiếu

- [phase-1-data-core.md](../phases/phase-1-data-core.md)
- [field-types.md](./field-types.md)
