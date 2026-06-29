# Hướng dẫn đổi địa bàn hành chính - Backend

## 1. Tổng quan

File này dùng để rà soát các cấu hình, seed, dữ liệu ranh giới và chuỗi hardcode trong `gis_be` khi muốn chuyển hệ thống WebGIS sang xã, phường, huyện, thành phố hoặc khu vực hành chính khác.

Backend hiện đã có nhóm biến `WARD_*` để cấu hình địa bàn runtime, nhưng vẫn còn một số giá trị Ngọc Tố/Cần Thơ nằm trong seed dev, Swagger, response cũ, test và tài liệu. Khi clone sang địa bàn mới, nên ưu tiên đổi `.env.local`/`.env.example`, dữ liệu ranh giới và seed tenant trước, sau đó cập nhật các chuỗi hiển thị/test/docs còn lại.

## 2. Danh sách file cần kiểm tra khi đổi địa bàn

| File | Biến/Key | Giá trị hiện tại | Ý nghĩa | Cần đổi khi sang địa bàn khác |
|---|---|---|---|---|
| `src/config/configuration.ts` | `ward.name` / `WARD_NAME` fallback | `Ngọc Tố` | Tên xã/phường mặc định nếu env không khai báo | Đổi bằng tên đơn vị mới hoặc luôn khai báo `WARD_NAME` trong env |
| `src/config/configuration.ts` | `ward.code` / `WARD_CODE` fallback | `ngoc-to` | Slug/mã nội bộ địa bàn | Đổi sang slug/mã địa bàn mới, ví dụ `phu-my` |
| `src/config/configuration.ts` | `ward.district` / `WARD_DISTRICT` fallback | `Mỹ Xuyên` | Huyện/quận/thành phố trực thuộc | Đổi sang huyện/quận/thành phố mới |
| `src/config/configuration.ts` | `ward.province` / `WARD_PROVINCE` fallback | `Cần Thơ` | Tỉnh/thành phố | Đổi sang tỉnh/thành phố mới |
| `src/config/configuration.ts` | `WARD_DEFAULT_ZOOM` fallback | `13` | Zoom mặc định backend trả về trong `mapView` | Đổi theo kích thước địa bàn mới |
| `src/config/configuration.ts` | `WARD_CENTER_LAT`, `WARD_CENTER_LNG` fallback | `9.4466`, `105.9342` | Tọa độ trung tâm fallback khi chưa load được ranh | Đổi sang tâm địa bàn mới |
| `src/config/configuration.ts` | `WARD_BOUNDARY_DATASET` fallback | `can-tho.geojson` | File GeoJSON ranh giới hành chính | Đổi sang file boundary mới trong `data/ward-boundaries/` |
| `src/config/configuration.ts` | `WARD_BOUNDARY_MATCH_PROPERTY` fallback | `ten_xa` | Property dùng để match feature ranh | Đổi theo schema GeoJSON mới, ví dụ `name`, `ten_phuong` |
| `src/config/configuration.ts` | `WARD_BOUNDARY_MATCH_VALUE` fallback | `Ngọc Tố` | Giá trị property cần match | Đổi sang tên/mã feature địa bàn mới |
| `src/config/configuration.ts` | `WARD_BOUNDARY_ADMIN_CODE_PROPERTY` fallback | `ma_xa` | Property mã hành chính trong GeoJSON | Đổi theo property mã của file boundary mới |
| `src/config/configuration.ts` | `WARD_BOUNDARY_ADMIN_CODE` fallback | `31723` | Mã hành chính ưu tiên khi tìm ranh | Đổi sang mã hành chính mới hoặc bỏ nếu không dùng |
| `src/config/configuration.ts` | `DATABASE_NAME` fallback | `gis_ngocto` | Tên database mặc định | Đổi sang DB mới nếu clone riêng địa bàn |
| `src/config/configuration.ts` | `MINIO_BUCKET` fallback | `gis-ngocto` | Bucket lưu file upload | Đổi bucket riêng nếu tách địa bàn |
| `.env.example` | `DATABASE_URL`, `DATABASE_NAME` | `gis_ngocto` | Cấu hình DB mẫu | Đổi tên DB/port nếu clone địa bàn mới |
| `.env.example` | `WARD_NAME`, `WARD_CODE`, `WARD_DISTRICT`, `WARD_PROVINCE` | `Ngoc To`, `ngoc-to`, `My Xuyen`, `Can Tho` | Địa bàn mẫu | Đổi sang địa bàn mới; nên dùng tiếng Việt có dấu nếu hệ thống hỗ trợ |
| `.env.example` | `WARD_CENTER_LAT`, `WARD_CENTER_LNG` | `9.446632339808145`, `105.93422393213204` | Tâm bản đồ fallback | Đổi sang tâm địa bàn mới |
| `.env.example` | `WARD_BOUNDARY_*` | `can-tho.geojson`, `ten_xa`, `Ngoc To`, `31723`, `ma_xa` | Cấu hình match ranh | Đổi theo file boundary/mã mới |
| `.env.local` | `DATABASE_URL`, `DATABASE_NAME` | `gis_ngocto` | Cấu hình DB local hiện tại | Đổi khi chạy local cho địa bàn mới |
| `.env.local` | `MINIO_BUCKET` | `gis-ngocto` | Bucket upload local | Đổi nếu dùng bucket riêng |
| `.env.local` | `WARD_*` | `Ngọc Tố`, `Mỹ Xuyên`, `Cần Thơ`, `31723` | Địa bàn local hiện tại | Đổi toàn bộ theo địa bàn mới |
| `data/ward-boundaries/can-tho.geojson` | Feature/properties `ma_xa`, `ten_xa`, `ten_tinh` | Chứa dữ liệu ranh Cần Thơ, có feature Ngọc Tố | Nguồn ranh giới dùng để tính center/bounds và API boundary | Thay bằng GeoJSON tỉnh/thành mới hoặc thêm file mới, đảm bảo match được feature |
| `data/ward-boundaries/README.md` | Ví dụ `WARD_*` | `Ngọc Tố`, `ngoc-to`, `can-tho.geojson`, `31723` | Tài liệu cấu hình ranh | Cập nhật ví dụ theo địa bàn mới |
| `src/ward-boundary/ward-boundary.service.ts` | `boundaryEndpoint` | `/api/layers/administrative-boundary` | Endpoint ranh hành chính | Thường giữ nguyên; kiểm tra nếu đổi route |
| `src/ward-boundary/ward-boundary.service.ts` | Fallback bounds | `center +/- 0.02` | Bounds tạm khi không load được ranh | Không cần đổi nếu center đúng; nên đảm bảo boundary load thành công |
| `src/modules/administrative-boundary/administrative-boundary.service.ts` | `description` | `Ranh giới hành chính ${ward.name}, ${ward.district}, ${ward.province}` | Metadata layer ranh | Đã lấy từ env; kiểm tra sau đổi env |
| `src/main.ts` | Swagger title | `GIS Ngọc Tố API` | Tên API trên Swagger | Nên đổi sang `${WARD_NAME}` hoặc tên hệ thống chung |
| `src/health/health.controller.ts` | `service` | `GIS Ngọc Tố API` | Response root `/api` | Nên đổi sang tên hệ thống chung hoặc lấy từ config |
| `src/gis/gis-layers.service.ts` | `project.name` | `GIS Ngọc Tố` | Tên project trong API catalog cũ | Đổi thành tên địa bàn mới hoặc lấy từ config |
| `src/gis/gis-layers.service.ts` | `project.description` | `Hệ thống thông tin địa lý xã Ngọc Tố, Cần Thơ` | Mô tả project catalog cũ | Đổi theo địa bàn mới |
| `src/metadata/metadata.service.ts` | `getProjectInfo().name` | `GIS Ngọc Tố` | Tên project trả trong `/api/layers` | Đổi thành tên địa bàn mới hoặc lấy từ env |
| `src/metadata/metadata.service.ts` | `getProjectInfo().description` | `Hệ thống thông tin địa lý xã Ngọc Tố, Cần Thơ` | Mô tả project map/layers | Đổi theo địa bàn mới |
| `src/modules/cooperatives/cooperatives.service.ts` | `description` | `Lớp dữ liệu hợp tác xã trên địa bàn xã Ngọc Tố` | Layer planned cũ | Đổi hoặc chuyển sang dùng `ward.name` |
| `src/modules/cooperative-groups/cooperative-groups.service.ts` | `description` | `Lớp dữ liệu tổ hợp tác trên địa bàn xã Ngọc Tố` | Layer planned cũ | Đổi hoặc chuyển sang dùng `ward.name` |
| `src/modules/irrigation/irrigation.service.ts` | `description` | `... trên địa bàn xã Ngọc Tố` | Layer planned cũ | Đổi hoặc chuyển sang dùng `ward.name` |
| `migrations/008_seed_ngoc_to.sql` | Tenant code/name/settings | `ngoc-to`, `Xã Ngọc Tố`, `Mỹ Xuyên`, `Cần Thơ` | Seed tenant dev | Thay bằng tenant địa bàn mới hoặc tạo migration seed mới |
| `migrations/008_seed_ngoc_to.sql` | Organization | `ubnd-ngoc-to`, `UBND Xã Ngọc Tố` | Seed tổ chức | Đổi code/tên UBND mới |
| `migrations/008_seed_ngoc_to.sql` | Administrative units | `can-tho`, `my-xuyen`, `ngoc-to`, các khu vực Bình Lợi... | Cây hành chính và khu vực seed | Đổi tỉnh/huyện/xã/ấp/khu vực theo địa bàn mới |
| `migrations/008_seed_ngoc_to.sql` | Admin user | `admin@ngocto.local`, `Quản trị viên Ngọc Tố` | Tài khoản dev | Đổi email/tên cho địa bàn mới |
| `migrations/seed.sh` | `DATABASE_URL` fallback | `postgresql://postgres:postgres@localhost:5434/gis_ngocto` | Script seed DB | Đổi DB/port hoặc dùng env trước khi chạy |
| `migrations/run.sh` | `DATABASE_URL` fallback | `postgresql://postgres:postgres@localhost:5435/gis_ngocto` | Script chạy migration | Đổi DB/port hoặc dùng env trước khi chạy |
| `docker-compose.yml` | container names / DB | `gis_ngocto_postgres`, `gis_ngocto_redis`, `gis_ngocto_minio`, `gis_ngocto` | Tên container và database Docker | Đổi nếu chạy song song nhiều địa bàn |
| `package.json` | `name` | `gis_ngocto` | Tên package | Không bắt buộc runtime, nhưng nên đổi nếu rebrand source |
| `package.json` | `db:clear-*` scripts | `gis_ngocto` fallback | Script dọn dữ liệu | Đổi DB fallback nếu clone địa bàn mới |
| `test/app.e2e-spec.ts` | Expected project/service/admin | `GIS Ngọc Tố`, `admin@ngocto.local` | E2E test theo seed cũ | Cập nhật expected theo seed mới |
| `src/analytics/analytics.service.spec.ts` | Mock row name | `HTX Ngọc Tố` | Unit test mock | Đổi nếu muốn test theo địa bàn mới |
| `src/datasets/datasets.service.spec.ts` | Mock dashboard name | `Tổng quan Ngọc Tố` | Unit test mock | Đổi nếu rebrand test |
| `README.md` | Env/documentation examples | `Ngọc Tố`, `can-tho.geojson`, `31723`, `gis_ngocto` | Tài liệu chạy source | Cập nhật theo địa bàn mới |
| `docs/**` | Tài liệu/module/phase | Nhiều chuỗi Ngọc Tố/Cần Thơ/khu vực seed | Tài liệu thiết kế cũ | Cập nhật nếu bàn giao source cho địa bàn mới |
| `migrations/001_foundation.sql` đến `007_triggers.sql` | Comment header | `GIS Ngọc Tố v3.2` | Comment migration | Không ảnh hưởng runtime; đổi nếu cần rebrand |

## 3. Các giá trị hiện đang hardcode

Các giá trị địa bàn/runtime quan trọng đang xuất hiện trong backend:

- Tên xã/phường: `Ngọc Tố`, `Ngoc To`, `Xã Ngọc Tố`.
- Tên huyện/quận: `Mỹ Xuyên`, `My Xuyen`.
- Tên tỉnh/thành phố: `Cần Thơ`, `Can Tho`.
- Mã/slug: `ngoc-to`, `can-tho`, `my-xuyen`.
- Mã hành chính boundary: `31723`.
- Tọa độ fallback: `9.4466`, `105.9342`, giá trị local đầy đủ `9.446632339808145`, `105.93422393213204`.
- Database/bucket/container: `gis_ngocto`, `gis-ngocto`, `gis_ngocto_postgres`, `gis_ngocto_redis`, `gis_ngocto_minio`.
- File ranh giới mặc định: `data/ward-boundaries/can-tho.geojson`.
- Property ranh giới: `ten_xa`, `ma_xa`.
- Admin dev: `admin@ngocto.local`, `Quản trị viên Ngọc Tố`.
- Tên project/API: `GIS Ngọc Tố`, `GIS Ngọc Tố API`.
- Khu vực seed: `Bình Lợi`, `Bình Trung`, `Bình Hiếu`, `Bình Hòa`, `Bình Thuận`, `Bình Thạnh B`, `Bình Thạnh C`, `Bình Tân`, `An Hòa`, `Thạnh Hiếu`.

Các file có địa danh hoặc cấu hình cần kiểm tra thêm khi đổi địa bàn:

- Runtime/config/API: `src/config/configuration.ts`, `src/main.ts`, `src/health/health.controller.ts`, `src/gis/gis-layers.service.ts`, `src/metadata/metadata.service.ts`, `src/ward-boundary/ward-boundary.service.ts`, `src/modules/administrative-boundary/administrative-boundary.service.ts`.
- Planned layer cũ: `src/modules/cooperatives/cooperatives.service.ts`, `src/modules/cooperative-groups/cooperative-groups.service.ts`, `src/modules/irrigation/irrigation.service.ts`.
- Seed/migration/scripts: `migrations/008_seed_ngoc_to.sql`, `migrations/run.sh`, `migrations/seed.sh`, `docker-compose.yml`, `package.json`.
- Boundary data: `data/ward-boundaries/can-tho.geojson`, `data/ward-boundaries/README.md`.
- Test/spec: `test/app.e2e-spec.ts`, `src/analytics/analytics.service.spec.ts`, `src/datasets/datasets.service.spec.ts`.
- Docs cần cập nhật nếu bàn giao: `README.md`, `docs/README.md`, `docs/PROJECT.md`, `docs/data-model.md`, `docs/modules/*.md`, `docs/phases/*.md`, `docs/appendix/import-excel-ngoc-to.md`.

## 4. Cách đổi sang xã/thành phố khác

1. Đổi tên hiển thị địa phương:
   - Backend: cập nhật `WARD_NAME`, `WARD_CODE`, `WARD_DISTRICT`, `WARD_PROVINCE` trong `.env.local` hoặc env triển khai.
   - Nếu muốn không phụ thuộc env, đổi fallback trong `src/config/configuration.ts`.
2. Đổi mã hành chính:
   - Cập nhật `WARD_BOUNDARY_ADMIN_CODE` và `WARD_BOUNDARY_ADMIN_CODE_PROPERTY`.
   - Nếu file boundary không có mã, dùng `WARD_BOUNDARY_MATCH_PROPERTY` + `WARD_BOUNDARY_MATCH_VALUE`.
3. Đổi tọa độ center:
   - Cập nhật `WARD_CENTER_LAT`, `WARD_CENTER_LNG`.
   - Nếu boundary load thành công, center/bounds sẽ được tính từ geometry; center env chỉ là fallback.
4. Đổi bounds:
   - Không có env bounds riêng; backend tính bounds từ GeoJSON trong `WardBoundaryService`.
   - Đảm bảo file boundary đúng CRS WGS84 `[lng, lat]`.
5. Đổi dữ liệu boundary:
   - Thêm file mới vào `data/ward-boundaries/`.
   - Cập nhật `WARD_BOUNDARY_DATASET`.
   - Kiểm tra property match/mã hành chính.
6. Đổi layer mặc định:
   - Nếu dùng planned layer cũ trong `src/modules/*`, đổi description hoặc chuyển sang lấy `ward.name`.
   - Nếu layer đã tạo động trong DB, kiểm tra seed/migration/import dữ liệu mới.
7. Đổi seed/demo data:
   - Tạo hoặc sửa `migrations/008_seed_ngoc_to.sql` cho tenant/org/admin units/admin user.
   - Không dùng lại khu vực Bình Lợi... nếu địa bàn mới khác.
8. Kiểm tra dashboard/template:
   - Backend lưu dashboard/widgets trong DB; nếu clone DB cũ, cần xóa hoặc tạo dashboard mới.
   - Kiểm tra các widget có filter/source/layerId cũ.
9. Build/test:
   - Chạy migration/seed trên DB mới.
   - Kiểm tra `GET /api/layers`, `GET /api/metadata/map-view`, `GET /api/layers/administrative-boundary`.
   - Chạy `npm run build` và test e2e nếu đã cập nhật expected.

## 5. Những phần nên đưa về .env hoặc config tập trung

Nên tập trung hóa thêm các biến backend sau:

| Biến đề xuất | Ý nghĩa | Hiện trạng |
|---|---|---|
| `PROJECT_DISPLAY_NAME` | Tên project/API, ví dụ `GIS Phường X` | Đang hardcode `GIS Ngọc Tố` ở `MetadataService`, `GisLayersService`, Swagger/root |
| `PROJECT_DESCRIPTION` | Mô tả project | Đang hardcode mô tả Ngọc Tố/Cần Thơ |
| `DEFAULT_ADMIN_EMAIL` | Email admin seed dev | Đang hardcode trong `008_seed_ngoc_to.sql` |
| `DEFAULT_ADMIN_FULL_NAME` | Tên admin seed dev | Đang hardcode trong seed |
| `DEFAULT_ORG_CODE` | Code UBND/tổ chức | Đang hardcode `ubnd-ngoc-to` |
| `DEFAULT_ORG_NAME` | Tên tổ chức | Đang hardcode `UBND Xã Ngọc Tố` |
| `DEFAULT_TENANT_CODE` | Tenant code | Đang hardcode trong seed và `WARD_CODE` |
| `DEFAULT_BOUNDARY_LAYER_ID` | Nếu sau này dùng layer ranh trong DB thay GeoJSON file | Hiện dùng endpoint/service ranh riêng |
| `WARD_BOUNDS` | Bounds fallback khi chưa có boundary | Hiện tính `center +/- 0.02` |
| `PLANNED_LAYER_DESCRIPTION_TEMPLATE` | Template mô tả layer planned | Một số service đang hardcode `xã Ngọc Tố` |

Các biến đã có và nên tiếp tục dùng:

- `WARD_NAME`
- `WARD_CODE`
- `WARD_DISTRICT`
- `WARD_PROVINCE`
- `WARD_DEFAULT_ZOOM`
- `WARD_CENTER_LAT`
- `WARD_CENTER_LNG`
- `WARD_BOUNDARY_DATASET`
- `WARD_BOUNDARY_MATCH_PROPERTY`
- `WARD_BOUNDARY_MATCH_VALUE`
- `WARD_BOUNDARY_ADMIN_CODE`
- `WARD_BOUNDARY_ADMIN_CODE_PROPERTY`
- `DEFAULT_TENANT_ID`
- `DATABASE_NAME`, `DATABASE_URL`
- `MINIO_BUCKET`

## 6. Rủi ro khi đổi địa bàn

- Map không fit đúng nếu file boundary không match feature hoặc tọa độ bị đảo lat/lng.
- `mapView.bounds` rỗng/fallback quá nhỏ nếu `WARD_BOUNDARY_DATASET` sai.
- API `/api/layers` vẫn hiển thị `GIS Ngọc Tố` nếu chưa đổi hardcode trong `MetadataService`/`GisLayersService`.
- Swagger/root health vẫn hiển thị `GIS Ngọc Tố API` nếu chưa đổi `src/main.ts` và `HealthController`.
- Seed tenant/admin units vẫn là Ngọc Tố nếu dùng lại `008_seed_ngoc_to.sql`.
- Dashboard/widget trong DB cũ có thể trỏ `layerId`, `datasetId`, `viewId`, field code của địa bàn cũ.
- Import GeoJSON với `filterMode=current_ward` sẽ lọc sai nếu ranh mới chưa cấu hình đúng.
- Test e2e fail nếu expected vẫn là Ngọc Tố nhưng env/seed đã đổi.
- MinIO bucket/DB/container trùng nếu chạy song song nhiều địa bàn trên cùng máy.

## 7. Kết luận

Các file backend quan trọng nhất cần đổi/kiểm tra khi chuyển địa bàn là:

1. `.env.local` / `.env.example`
2. `src/config/configuration.ts`
3. `data/ward-boundaries/*.geojson`
4. `migrations/008_seed_ngoc_to.sql`
5. `src/metadata/metadata.service.ts`
6. `src/gis/gis-layers.service.ts`
7. `src/main.ts`
8. `src/health/health.controller.ts`
9. `docker-compose.yml` và `package.json` nếu đổi DB/container/package name

Nếu chỉ đổi runtime nhanh, ưu tiên `WARD_*` và boundary GeoJSON. Nếu clone thành sản phẩm cho địa bàn mới, cần tạo seed mới và loại bỏ toàn bộ chuỗi `Ngọc Tố` trong response/test/docs để tránh nhầm lẫn khi vận hành.
