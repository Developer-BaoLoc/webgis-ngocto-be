# Hướng dẫn đổi địa bàn hành chính - Backend

## 0. Checklist đổi địa bàn nhanh

Sửa các biến backend thực tế nhất trong `.env.local` hoặc env deploy:

- `PROJECT_DISPLAY_NAME`
- `PROJECT_API_DISPLAY_NAME`
- `PROJECT_DESCRIPTION`
- `WARD_NAME`
- `WARD_LABEL`
- `WARD_CODE`
- `WARD_DISTRICT`
- `WARD_PROVINCE`
- `WARD_CENTER_LAT`
- `WARD_CENTER_LNG`
- `WARD_DEFAULT_ZOOM`
- `WARD_BOUNDARY_DATASET`
- `WARD_BOUNDARY_MATCH_PROPERTY`
- `WARD_BOUNDARY_MATCH_VALUE`
- `WARD_BOUNDARY_ADMIN_CODE`
- `DATABASE_URL` hoặc `DATABASE_NAME`
- `MINIO_BUCKET`

Cảnh báo nhanh:

- Nếu đổi DB mới, không dùng seed Ngọc Tố cũ.
- Nếu dùng dashboard cũ, phải kiểm tra lại `layerId`, `datasetId`, `viewId` và `fieldKey`.

## 1. Tổng quan

File này hướng dẫn đổi backend WebGIS sang xã/phường/huyện/thành phố khác sau khi đã gom các giá trị runtime quan trọng vào `src/config/configuration.ts` và biến môi trường.

Mục tiêu hiện tại: với phần runtime/API, ưu tiên chỉ sửa `.env.local` hoặc biến môi trường triển khai. Migration seed, test và tài liệu lịch sử vẫn có dữ liệu demo Ngọc Tố; các phần đó được liệt kê riêng để tránh nhầm với cấu hình runtime.

## 2. Danh sách file cần kiểm tra khi đổi địa bàn

| File | Biến/Key | Giá trị hiện tại | Ý nghĩa | Cần đổi khi sang địa bàn khác |
|---|---|---|---|---|
| `.env.local` hoặc env deploy | `PROJECT_DISPLAY_NAME` | `GIS Ngọc Tố` | Tên hệ thống trả về API/catalog | Đổi thành `GIS <địa bàn mới>` |
| `.env.local` hoặc env deploy | `PROJECT_API_DISPLAY_NAME` | `GIS Ngọc Tố API` | Tên API trong Swagger/root response | Đổi thành tên API địa bàn mới |
| `.env.local` hoặc env deploy | `PROJECT_DESCRIPTION` | `Hệ thống thông tin địa lý Xã Ngọc Tố, Cần Thơ` | Mô tả project trong `/api/layers` | Đổi theo địa bàn mới |
| `.env.local` hoặc env deploy | `WARD_NAME` | `Ngọc Tố` | Tên xã/phường | Đổi tên đơn vị mới |
| `.env.local` hoặc env deploy | `WARD_LABEL` | `Xã Ngọc Tố` | Tên đầy đủ dùng trong mô tả layer | Đổi thành `Xã/Phường ...` |
| `.env.local` hoặc env deploy | `WARD_CODE` | `ngoc-to` | Slug/mã nội bộ địa bàn | Đổi slug/mã mới |
| `.env.local` hoặc env deploy | `WARD_DISTRICT` | `Mỹ Xuyên` | Huyện/quận/thành phố trực thuộc | Đổi cấp huyện mới |
| `.env.local` hoặc env deploy | `WARD_PROVINCE` | `Cần Thơ` | Tỉnh/thành phố | Đổi tỉnh/thành phố mới |
| `.env.local` hoặc env deploy | `WARD_COUNTRY` | `Việt Nam` | Quốc gia | Thường giữ nguyên |
| `.env.local` hoặc env deploy | `WARD_CENTER_LAT`, `WARD_CENTER_LNG` | `9.446632339808145`, `105.93422393213204` | Tâm bản đồ fallback khi boundary chưa load | Đổi sang tâm địa bàn mới |
| `.env.local` hoặc env deploy | `WARD_DEFAULT_ZOOM` | `12` hoặc fallback `13` | Zoom mặc định trong `mapView` | Đổi theo diện tích địa bàn |
| `.env.local` hoặc env deploy | `WARD_BOUNDARY_DATASET` | `can-tho.geojson` | File GeoJSON ranh giới | Đổi sang file boundary mới |
| `.env.local` hoặc env deploy | `WARD_BOUNDARY_MATCH_PROPERTY` | `ten_xa` | Property dùng để match feature | Đổi theo schema GeoJSON mới |
| `.env.local` hoặc env deploy | `WARD_BOUNDARY_MATCH_VALUE` | `Ngọc Tố` | Giá trị feature cần match | Đổi sang tên/mã địa bàn mới |
| `.env.local` hoặc env deploy | `WARD_BOUNDARY_ADMIN_CODE_PROPERTY` | `ma_xa` | Property mã hành chính | Đổi theo file boundary mới |
| `.env.local` hoặc env deploy | `WARD_BOUNDARY_ADMIN_CODE` | `31723` | Mã hành chính ưu tiên match | Đổi mã địa bàn mới hoặc bỏ trống nếu không dùng |
| `.env.local` hoặc env deploy | `DATABASE_NAME`, `DATABASE_URL` | `gis_ngocto` | Database địa bàn | Đổi khi clone DB riêng |
| `.env.local` hoặc env deploy | `MINIO_BUCKET` | `gis-ngocto` | Bucket upload | Đổi nếu tách bucket theo địa bàn |
| `src/config/configuration.ts` | Fallback `project`, `ward`, `database`, `minio` | Ngọc Tố/Cần Thơ | Fallback khi thiếu env | Chỉ sửa nếu không dùng env |
| `data/ward-boundaries/*.geojson` | Boundary dataset | `can-tho.geojson` | Dữ liệu ranh tính center/bounds | Thêm/thay file mới, CRS WGS84 `[lng, lat]` |
| `data/ward-boundaries/README.md` | Ví dụ cấu hình | Ngọc Tố/Cần Thơ | Tài liệu boundary | Cập nhật nếu bàn giao địa bàn mới |
| `migrations/008_seed_ngoc_to.sql` | Tenant/org/admin units/user | Ngọc Tố, Mỹ Xuyên, Cần Thơ | Seed demo dev | Tạo seed mới hoặc sửa khi reset DB cho địa bàn mới |
| `migrations/run.sh`, `migrations/seed.sh` | `DATABASE_URL` fallback | `gis_ngocto` | Script migrate/seed | Dùng env hoặc đổi fallback nếu clone riêng |
| `docker-compose.yml` | container/db names | `gis_ngocto_*` | Docker local | Đổi nếu chạy song song nhiều địa bàn |
| `test/app.e2e-spec.ts`, `src/**/*.spec.ts` | Expected/mock names | `GIS Ngọc Tố`, `admin@ngocto.local` | Test theo seed demo | Cập nhật nếu đổi seed/test fixture |
| `README.md`, `docs/**` | Ví dụ/tài liệu | Ngọc Tố/Cần Thơ | Tài liệu lịch sử | Cập nhật nếu bàn giao cho địa bàn khác |

## 3. Các giá trị hiện đang hardcode

Đã refactor khỏi runtime service:

- `src/main.ts` dùng `project.apiDisplayName`.
- `src/health/health.controller.ts` dùng `project.apiDisplayName`.
- `src/gis/gis-layers.service.ts` dùng `project.displayName` và `project.description`.
- `src/metadata/metadata.service.ts` dùng `project.displayName` và `project.description`.
- `src/modules/cooperatives/cooperatives.service.ts`, `cooperative-groups.service.ts`, `irrigation.service.ts` dùng `ward.locationLabel` cho mô tả layer.

Còn giữ có chủ đích:

- Fallback trong `src/config/configuration.ts`: giúp app chạy được khi chưa khai báo env.
- `migrations/008_seed_ngoc_to.sql`: seed demo Ngọc Tố, không refactor để tránh rủi ro migration cũ.
- `test/**/*.spec.ts`: mock/expected demo.
- `README.md`, `docs/**`: tài liệu hiện trạng/lịch sử.
- `data/ward-boundaries/can-tho.geojson`: dataset ranh hiện có; thêm file mới khi đổi địa bàn.

## 4. Cách đổi sang xã/thành phố khác

1. Tạo/cập nhật `.env.local` hoặc biến môi trường deploy.
2. Đổi project:
   - `PROJECT_DISPLAY_NAME`
   - `PROJECT_API_DISPLAY_NAME`
   - `PROJECT_DESCRIPTION`
3. Đổi địa bàn:
   - `WARD_NAME`
   - `WARD_LABEL`
   - `WARD_CODE`
   - `WARD_DISTRICT`
   - `WARD_PROVINCE`
   - `WARD_COUNTRY`
4. Đổi map fallback:
   - `WARD_CENTER_LAT`
   - `WARD_CENTER_LNG`
   - `WARD_DEFAULT_ZOOM`
5. Đổi boundary:
   - Thêm GeoJSON mới vào `data/ward-boundaries/`.
   - Cập nhật `WARD_BOUNDARY_DATASET`.
   - Cập nhật `WARD_BOUNDARY_ADMIN_CODE*` hoặc `WARD_BOUNDARY_MATCH_*`.
6. Đổi hạ tầng local nếu cần:
   - `DATABASE_NAME`, `DATABASE_URL`
   - `MINIO_BUCKET`
   - `docker-compose.yml` nếu chạy song song nhiều địa bàn.
7. Nếu reset DB bằng seed:
   - Tạo seed mới thay cho `migrations/008_seed_ngoc_to.sql` hoặc sửa file này trong nhánh triển khai riêng.
8. Kiểm tra API:
   - `GET /api`
   - `GET /api/layers`
   - `GET /api/metadata/map-view`
   - `GET /api/layers/administrative-boundary`
9. Build/test.

## 5. Những phần nên đưa về .env hoặc config tập trung

Đã gom:

- `PROJECT_DISPLAY_NAME`
- `PROJECT_API_DISPLAY_NAME`
- `PROJECT_DESCRIPTION`
- `WARD_NAME`
- `WARD_LABEL`
- `WARD_CODE`
- `WARD_DISTRICT`
- `WARD_PROVINCE`
- `WARD_COUNTRY`
- `WARD_CENTER_LAT`
- `WARD_CENTER_LNG`
- `WARD_DEFAULT_ZOOM`
- `WARD_BOUNDARY_DATASET`
- `WARD_BOUNDARY_MATCH_PROPERTY`
- `WARD_BOUNDARY_MATCH_VALUE`
- `WARD_BOUNDARY_ADMIN_CODE`
- `WARD_BOUNDARY_ADMIN_CODE_PROPERTY`
- `DATABASE_NAME`
- `DATABASE_URL`
- `MINIO_BUCKET`

Nên cân nhắc cho phase sau:

- Seed tenant/org/admin units bằng script nhận env thay vì migration demo cố định.
- `DEFAULT_ORG_CODE`, `DEFAULT_ORG_NAME`, `DEFAULT_ADMIN_EMAIL` nếu cần seed tự động cho nhiều địa bàn.
- `WARD_BOUNDS` fallback riêng nếu muốn tránh logic `center +/- 0.02`.

## 6. Rủi ro khi đổi địa bàn

- Boundary không match feature khiến mapView dùng fallback center/bounds.
- GeoJSON sai CRS hoặc đảo lat/lng làm map fit sai.
- Seed demo Ngọc Tố vẫn chạy nếu dùng migration cũ trên DB mới.
- Dashboard/widget trong DB cũ còn trỏ `layerId`, `datasetId`, `viewId`, field code cũ.
- Test e2e fail nếu đổi env nhưng chưa đổi seed/expected.
- DB/MinIO/container trùng tên khi chạy nhiều địa bàn cùng máy.

## 7. Kết luận

Sau refactor, đổi runtime backend chủ yếu bằng `.env.local` hoặc env deploy. Các file quan trọng nhất:

1. `.env.local` / biến môi trường deploy.
2. `data/ward-boundaries/*.geojson`.
3. `src/config/configuration.ts` chỉ khi muốn đổi fallback code.
4. `migrations/008_seed_ngoc_to.sql` nếu cần seed demo mới.
5. `docker-compose.yml` nếu chạy song song nhiều địa bàn.

Phần runtime service không còn cần sửa rải rác để đổi tên project/địa bàn.
