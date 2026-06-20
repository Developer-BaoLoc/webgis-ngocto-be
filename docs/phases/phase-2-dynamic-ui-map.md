# Phase 2 — Dynamic UI & Map

**Thời gian ước tính:** 4–6 tuần (1–2 dev)  
**Phụ thuộc:** [phase-1-data-core.md](./phase-1-data-core.md)  
**Phase tiếp theo:** [phase-3-governance.md](./phase-3-governance.md)

## 1. Mục tiêu

Giao diện admin và bản đồ: nhập liệu động, vẽ polygon/point, xem dữ liệu Ngọc Tố trên map.

## 2. Phạm vi

### Admin Web App (React + TypeScript)

- Layer list + schema viewer (designer cơ bản Phase 2, đầy đủ hơn sau)
- **Dynamic form** — render từ `GET /api/layers/:id/schema`
- **Dynamic table** — cột từ display_schema
- Record CRUD UI
- Import wizard: upload → map cột → preview → execute

### Map (MapLibre GL)

- Load layers GeoJSON theo bbox
- **Point editor** — ghim HTX, trạm bơm, chủ thể OCOP
- **Polygon editor** — vẽ vùng sản xuất, khu vực, vùng phục vụ trạm bơm
- Popup feature (fields có visibleInPopup)
- Filter panel: khu vực, ngành nghề, trạng thái
- Map style cơ bản: fill color theo category

### location_status workflow

```
unlocated → (user vẽ) → point_placed | polygon_drawn → imported (nếu GeoJSON)
```

### File upload

- Field type `image`, `file`
- MinIO storage
- attachment_id trong properties

### Viewer app (hoặc role viewer trong cùng app)

- Xem bản đồ + bảng read-only

## 3. Ngoài phạm vi

- Dashboard builder (Phase 4)
- Workflow submit/approve UI đầy đủ (Phase 3 — có thể stub)
- MVT tiles (Phase 5)
- Form conditional visibility phức tạp (Phase 3)

## 4. Use case ưu tiên Ngọc Tố

| # | Use case | Layer | Geometry |
|---|----------|-------|----------|
| 1 | Import Excel → xem bảng HTX/THT | economic_collective | — |
| 2 | Ghim vị trí HTX trên bản đồ | economic_collective | Point |
| 3 | Vẽ polygon 3 vùng sản xuất | production_zone | **Polygon** |
| 4 | Ghim 18 trạm bơm | pump_station | Point |
| 5 | Vẽ khu vực Bình Lợi, Bình Trung… | administrative_zone | Polygon |
| 6 | Xem OCOP trên bản đồ (theo chủ thể) | ocop_subject | Point |

### Polygon — Vùng sản xuất

- Layer `production_zone`: `geometryType: Polygon`
- Sau import (geometry null): admin vẽ polygon trên map
- Backend: `ST_Area(geometry)` so sánh field `dien_tich` → warning nếu lệch > 20%
- Hiển thị: fill + outline + label tên vùng

## 5. Component frontend

```
apps/
├── admin/
│   ├── features/
│   │   ├── layers/
│   │   ├── records/
│   │   ├── import/
│   │   └── map/
│   └── shared/
│       ├── schema-form/      # Dynamic form renderer
│       ├── schema-table/     # Dynamic table
│       └── field-widgets/    # text, money, measurement…
└── web/                      # Viewer (optional tách sau)
```

## 6. Task checklist

### Schema renderer

- [ ] FormField component per field_type
- [ ] Section / tab từ ui_schema
- [ ] Validation client-side mirror server rules
- [ ] Table columns từ display_schema

### Map

- [ ] MapLibre GL setup, base map (OSM hoặc VN tile)
- [ ] GeoJSON layer loader + bbox on moveend
- [ ] Draw control: Point mode
- [ ] Draw control: Polygon mode
- [ ] Save geometry PATCH record API
- [ ] Popup on click
- [ ] Layer visibility toggle
- [ ] Style: fill color by category field

### Import UI

- [ ] Upload xlsx
- [ ] Column mapping UI
- [ ] Preview table
- [ ] Job progress bar

### File

- [ ] Upload component
- [ ] Image preview

### Auth UI

- [ ] Login
- [ ] Role-based menu

## 7. Definition of Done

- [ ] Đăng nhập admin, xem danh sách HTX import từ Phase 1
- [ ] Sửa 1 HTX qua form động
- [ ] Ghim ít nhất 5 HTX trên bản đồ (Point)
- [ ] Vẽ polygon cho 3 vùng sản xuất
- [ ] Ghim 18 trạm bơm
- [ ] Filter bản đồ theo khu vực
- [ ] Upload ảnh (nếu layer có field image)
- [ ] Viewer role chỉ xem, không sửa

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|--------|------------|
| Draw plugin phức tạp | Mapbox GL Draw hoặc Terra Draw |
| Performance nhiều polygon | Simplify geometry, bbox load |

## 9. Tham chiếu

- [data-model.md](../data-model.md) — layers geometry
- [field-types.md](../appendix/field-types.md)
