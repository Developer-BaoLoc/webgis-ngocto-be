# Relationship Field Guide
Ví dụ có 2 bảng:
OCOP: (https://docs.google.com/spreadsheets/d/13aA4OREC57i4Ysm7f2L3-OMbxOSMlXOGzNSJ2BgUjsU/edit?usp=sharing)
Sản Phẩm OCOP: (https://docs.google.com/spreadsheets/d/1s9wmZ80Zw48my-EgBHLOFkN_sbO70FKTQUn9D-oO_Jo/edit?usp=sharing)

Cách làm lại đúng thứ tự
Bước 1: Tạo layer OCOP và Sản Phẩm OCOP:
Import excel vào OCOP hoặc tạo trường Chủ thể

Bước 2: Lưu field Many-to-One trước

Ở layer Sản Phẩm OCOP, tạo field Chủ thể:

Relation Type: Many-to-One
Target Layer: OCOP
Display Field: chu_the
Foreign Key field: ocop_id
Match Field khi import: chu_the
Nếu import không tìm thấy: Báo lỗi

Bấm Lưu thay đổi.

Bước 3: Import excel vào Sản Phẩm OCOP hoặc Resolve lại relationship nếu đã có data

Sau khi field Many-to-One lưu thành công, vào layer Sản Phẩm OCOP bấm:

Resolve lại relationship

hoặc import file sản phẩm.

Sau đó kiểm tra bảng Sản Phẩm OCOP. Cột Chủ thể phải hiện:

Cơ sở 10 Oanh
Hộ kinh doanh Võ Đình Chiến
...

Nếu cột Chủ thể trống hoặc vẫn là text cũ, nghĩa là chưa resolve được entity_id.

Bước 4: Thêm field One-to-Many ở layer OCOP

Ở layer OCOP, thêm field:

Label:
Sản phẩm OCOP

Relation Type:
One-to-Many

Target Layer:
Sản Phẩm OCOP

Foreign Key field:
ocop_id

Display Field:
ten_san_pham_ocop

Match Field khi import:
Để trống

Lưu ý: Chuẩn hóa data trước khi import

## Relationship Field là gì?

Relationship Field là kiểu trường metadata dùng để liên kết bản ghi giữa các layer động.

Ví dụ OCOP:

- Layer `ocop_entities`: Cơ sở OCOP.
- Layer `ocop_products`: Sản phẩm OCOP.
- Một cơ sở OCOP có nhiều sản phẩm OCOP.

Trong kiến trúc hiện tại, dữ liệu nghiệp vụ được lưu trong bảng `features`, cột `properties` dạng JSONB. Vì vậy foreign key của relationship được lưu trong `features.properties`, không tạo bảng vật lý riêng cho từng layer.

## Các loại quan hệ

- `many-to-one`: bản ghi hiện tại trỏ tới một bản ghi ở layer đích. Ví dụ sản phẩm có field `entity_id` trỏ tới cơ sở OCOP.
- `one-to-many`: bản ghi hiện tại hiển thị danh sách bản ghi con từ layer đích thông qua foreign key. Ví dụ cơ sở OCOP hiển thị danh sách sản phẩm có `entity_id = current feature id`.
- `many-to-many`: metadata đã có lựa chọn để thiết kế trước, nhưng UI nhập liệu/import hiện ưu tiên `many-to-one` và `one-to-many`.

## Tạo quan hệ Cơ sở OCOP - Sản phẩm OCOP

1. Tạo layer `ocop_entities`.
2. Tạo các field cho cơ sở, ví dụ:
   - `name`: Tên cơ sở.
   - `address`: Địa chỉ.
3. Tạo layer `ocop_products`.
4. Trong `ocop_products`, thêm field:
   - Label: `Cơ sở OCOP`
   - Field Type: `Relationship`
   - Relation Type: `Many-to-One`
   - Target Table / Layer: `ocop_entities`
   - Target Primary Key: `id`
   - Display Field: `name`
   - Match Field khi import: `name`
   - Foreign Key: `entity_id`
   - If not found: `Báo lỗi`

Khi lưu, database vẫn lưu:

```text
features.properties.entity_id = <feature_id của Cơ sở 10 Oanh>
```

Giao diện hiển thị:

```text
Cơ sở 10 Oanh
```

## Cấu hình chiều ngược lại

Trong layer `ocop_entities`, có thể thêm field relationship:

- Label: `Sản phẩm OCOP`
- Field Type: `Relationship`
- Relation Type: `One-to-Many`
- Target Table / Layer: `ocop_products`
- Foreign Key: `entity_id`
- Display Field: `product_name`

Khi xem chi tiết hoặc popup bản đồ của một cơ sở, hệ thống tìm các bản ghi sản phẩm có:

```text
ocop_products.properties.entity_id = current ocop_entities feature id
```

và hiển thị danh sách sản phẩm.

## Nhập liệu thủ công

Khi thêm hoặc sửa sản phẩm OCOP, field relationship được render thành dropdown:

```text
Cơ sở OCOP:
[ Cơ sở 10 Oanh ▼ ]
```

Option trong dropdown có dạng:

```json
{
  "value": "<feature_id>",
  "label": "Cơ sở 10 Oanh"
}
```

Người dùng chọn label, nhưng hệ thống lưu `value` là feature id.

## Kiểm tra liên kết trên giao diện

Trong bảng dữ liệu, relationship `many-to-one` được hiển thị theo trạng thái:

- Match được bản ghi cha: hiển thị label, ví dụ `Cơ sở 10 Oanh`.
- Chưa có giá trị foreign key: hiển thị `Chưa liên kết`.
- Có foreign key nhưng không tìm thấy bản ghi cha: hiển thị `Không tìm thấy bản ghi cha` kèm giá trị đang lưu.

Trong màn hình chi tiết record, mỗi relationship `many-to-one` hiển thị thêm:

- Giá trị đang lưu trong `features.properties`, ví dụ `properties.entity_id`.
- Label resolve được từ target layer.
- Target layer.
- Display field.
- Match field.

Điều này giúp admin biết dữ liệu đã liên kết thật sự hay chỉ đang có một giá trị ID/text chưa resolve.

## Hiển thị danh sách con One-to-Many

Ở layer cha, có thể thêm field relationship `one-to-many` để hiển thị danh sách bản ghi con.

Ví dụ trong layer `ocop_entities`, field `Sản phẩm OCOP` trỏ tới layer `ocop_products` với:

```text
foreignKey = entity_id
```

Khi mở popup hoặc chi tiết của một cơ sở, hệ thống truy vấn:

```text
ocop_products.properties.entity_id = current ocop_entities feature id
```

và hiển thị danh sách sản phẩm con, ví dụ:

```text
Sản phẩm OCOP:
- Rượu nếp than 10 Oanh - 3 sao
- Rượu hương nếp 10 Oanh - 3 sao
```

Nếu một layer đang được field `many-to-one` từ layer khác trỏ tới nhưng chưa có field `one-to-many` chiều ngược, trang dữ liệu sẽ hiển thị gợi ý tạo field One-to-Many trong schema designer.

## Import dữ liệu

File import sản phẩm có thể dùng tên cơ sở, không cần biết ID:

```csv
Tên cơ sở,Tên sản phẩm,Xếp hạng
Cơ sở 10 Oanh,Rượu nếp than 10 Oanh,3 sao
Cơ sở 10 Oanh,Rượu hương nếp 10 Oanh,3 sao
```

Mapping:

```text
Tên cơ sở    -> Cơ sở OCOP / relationship / match by name
Tên sản phẩm -> product_name
Xếp hạng     -> ranking
```

Trong lúc preview/import:

1. Hệ thống đọc giá trị `Cơ sở 10 Oanh`.
2. Tìm bản ghi trong layer `ocop_entities` có `properties.name = "Cơ sở 10 Oanh"`.
3. Nếu tìm đúng một bản ghi, lấy `features.id`.
4. Lưu id đó vào `ocop_products.properties.entity_id`.

Nếu không tìm thấy:

```text
Cột "Cơ sở OCOP": không tìm thấy bản ghi liên kết "Cơ sở ABC"
```

Mặc định hệ thống báo lỗi và không import âm thầm sai dữ liệu.

## Kiểm tra và resolve lại relationship

Trong form cấu hình Relationship Field có nút `Kiểm tra liên kết`.

API kiểm tra trả về:

- Số bản ghi con có foreign key.
- Số bản ghi match được với bản ghi cha.
- Số bản ghi không match.
- Danh sách 10 lỗi đầu tiên.

Nếu dữ liệu đã được import trước khi tạo relationship field, có thể dùng nút `Resolve lại relationship`.

Ví dụ `features.properties.entity_id` của sản phẩm đang lưu text:

```text
Cơ sở 10 Oanh
```

Hệ thống sẽ tìm trong target layer theo `matchField`, lấy `features.id` của bản ghi cha và cập nhật lại:

```text
features.properties.entity_id = <feature_id của Cơ sở 10 Oanh>
```

Nếu không tìm thấy hoặc match nhiều bản ghi, hệ thống báo lỗi và không tự đổi sai dữ liệu.

## API liên quan

Lấy options cho dropdown relationship:

```http
GET /api/metadata/relationship-options?targetLayerId=<layer_id>&displayField=name
```

Response:

```json
[
  {
    "value": "<feature_id>",
    "label": "Cơ sở 10 Oanh"
  }
]
```

Resolve relationship khi import:

```http
POST /api/imports/resolve-relationships
```

Alias tương thích theo yêu cầu:

```http
POST /api/import/resolve-relationships
```

Payload:

```json
{
  "targetLayerId": "<ocop_entities_layer_id>",
  "matchField": "name",
  "displayField": "name",
  "values": ["Cơ sở 10 Oanh", "Cơ sở ABC"]
}
```

Response:

```json
{
  "Cơ sở 10 Oanh": {
    "id": "<feature_id>",
    "label": "Cơ sở 10 Oanh",
    "status": "matched"
  },
  "Cơ sở ABC": {
    "id": null,
    "label": "Cơ sở ABC",
    "status": "not_found"
  }
}
```

Kiểm tra liên kết:

```http
POST /api/metadata/relationships/check
```

Payload:

```json
{
  "sourceLayerId": "<ocop_products_layer_id>",
  "fieldCode": "entity_id"
}
```

Resolve lại relationship đã import bằng text:

```http
POST /api/metadata/relationships/resolve-again
```

Payload:

```json
{
  "sourceLayerId": "<ocop_products_layer_id>",
  "fieldCode": "entity_id"
}
```

Gợi ý tạo field One-to-Many cho layer cha:

```http
GET /api/metadata/relationships/suggestions?layerId=<ocop_entities_layer_id>
```

## Lưu ý kỹ thuật

- Không hard-code riêng cho OCOP.
- Relationship dùng được cho mọi layer metadata-driven.
- Target layer và target field được validate khi tạo field.
- Query dùng parameter cho JSONB field access, không nối trực tiếp input người dùng vào SQL.
- Database vẫn dùng `features.properties`; không cần migration tạo bảng vật lý riêng cho từng layer.
- `many-to-many` đang được thiết kế metadata trước, chưa phải workflow nhập liệu/import chính.
