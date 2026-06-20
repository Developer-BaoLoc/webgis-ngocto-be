# Ward boundaries (ranh giới phường/xã)

Thư mục chứa GeoJSON **theo tỉnh/thành** — mỗi file gồm nhiều phường/xã.

## Cấu trúc

```
data/ward-boundaries/
  can-tho.geojson      # 103 phường/xã Cần Thơ
  {province}.geojson   # thêm tỉnh khác sau này
```

## Chọn phường cho tenant (`.env`)

Một file → nhiều phường. Chỉ đổi biến môi trường, không cần copy GeoJSON riêng:

```env
WARD_NAME=Ngọc Tố
WARD_CODE=ngoc-to
WARD_BOUNDARY_DATASET=can-tho.geojson
WARD_BOUNDARY_MATCH_PROPERTY=ten_xa
WARD_BOUNDARY_MATCH_VALUE=Ngọc Tố
WARD_BOUNDARY_ADMIN_CODE=31723
```

| Biến | Mô tả |
|------|--------|
| `WARD_BOUNDARY_DATASET` | Tên file trong thư mục này |
| `WARD_BOUNDARY_MATCH_PROPERTY` | Property trong GeoJSON để khớp (vd. `ten_xa`) |
| `WARD_BOUNDARY_MATCH_VALUE` | Giá trị cần khớp (mặc định = `WARD_NAME`) |
| `WARD_BOUNDARY_ADMIN_CODE` | Mã hành chính (`ma_xa`) — ưu tiên nếu có |

## Thêm tỉnh/phường mới

1. Đặt file `{slug}.geojson` vào thư mục này (FeatureCollection, mỗi feature = 1 phường).
2. Cập nhật `.env` tenant tương ứng.
3. Restart API — BE tự tính `center`, `bounds` từ geometry.

## API cho frontend

| Endpoint | Auth | Mô tả |
|----------|------|--------|
| `GET /api/layers` | Public | `project.mapView` — center, bounds, zoom |
| `GET /api/metadata/map-view` | Public | Chỉ mapView |
| `GET /api/layers/administrative-boundary` | Public | GeoJSON ranh phường (1 feature) |
