# Phase 4 — Dashboard MVP

**Thời gian ước tính:** 5–7 tuần (1–2 dev)  
**Phụ thuộc:** [phase-3-governance.md](./phase-3-governance.md)  
**Phase tiếp theo:** [phase-5-scale.md](./phase-5-scale.md)

## 1. Mục tiêu

Dashboard tự thiết kế: stat, chart, table, mini map, global filter — dữ liệu từ semantic layer (Dataset → Metric → Dimension → Widget).

## 2. Phạm vi

### Semantic layer

- **datasets**: source_layer, grain, default_filters, access_policy
- **metrics**: field_id, aggregation (sum, count, avg), format
- **dimensions**: field_id, groupable
- Bind bằng `fields.id` (UUID ổn định), không chỉ fieldCode

### Dashboard engine

- `dashboards`, `dashboard_revisions`, `dashboard_widgets`
- Status: draft · published · archived
- Layout grid 12 cột + responsive breakpoints (desktop, tablet, mobile)

### Widget types (giới hạn, kiểm soát)

| Type | Mô tả |
|------|--------|
| stat | Một số KPI |
| bar | Biểu đồ cột |
| line | Biểu đồ đường (theo năm) |
| pie / donut | Phân bố |
| table | Bảng dữ liệu |
| map | Mini map một layer |
| text | Markdown tĩnh |
| global_filter | Bộ lọc toàn dashboard |

**Không** cho user viết SQL/JS/HTML tùy ý.

### Analytics API

```
POST /api/analytics/query
```

Request mẫu:

```json
{
  "datasetId": "uuid",
  "dimensions": ["dimension-uuid"],
  "metrics": ["metric-uuid"],
  "filters": [],
  "limit": 100
}
```

### Query governance

- Validator: field tồn tại, quyền xem, operator hợp lệ
- Limits: max rows, timeout 30s, max buckets 100
- `query_executions` log

### Global filter

Widget khai báo `acceptedFilters`:

```json
{
  "acceptedFilters": [
    { "filterId": "khu_vuc", "bindToFieldId": "field-uuid" },
    { "filterId": "nam", "bindToFieldId": "field-uuid" }
  ]
}
```

User chọn filter → dashboard context → mọi widget cập nhật.

### Dashboard builder UI

- Kéo thả widget
- Chọn dataset → metric → dimension
- Preview draft
- Publish revision

## 3. Dataset seed Long Bình

| Dataset | Source | Grain | Default filter |
|---------|--------|-------|----------------|
| HTX/THT đã duyệt | economic_collective | feature_id | status=published |
| Trạm bơm | pump_station | feature_id | — |
| Sản phẩm OCOP | ocop_product | feature_id | — |
| Vùng sản xuất | production_zone | feature_id | — |
| Số liệu theo năm | annual_statistics | feature_id + year | — |

### Metrics seed

| Code | Label | Aggregation |
|------|-------|-------------|
| total_collectives | Tổng HTX/THT | count |
| total_area | Tổng diện tích | sum(dien_tich) |
| total_profit | Tổng lợi nhuận | sum(profit) from annual_statistics |
| ocop_product_count | Số sản phẩm OCOP | count |
| pump_active_count | Trạm bơm đang HĐ | count filter active |

### Dimensions seed

| Code | Label | Field |
|------|-------|-------|
| by_nganh_nghe | Theo ngành nghề | nganh_nghe |
| by_khu_vuc | Theo khu vực | khu_vuc |
| by_loai_chu_the | HTX vs THT | loai_chu_the |
| by_xep_hang | Xếp hạng OCOP | xep_hang |
| by_loai_bom | Loại bơm | loai_bom |
| by_year | Theo năm | reporting_year |

## 4. Dashboard mẫu — Tổng quan Long Bình

Layout đề xuất (desktop):

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Stat: HTX   │ Stat: THT   │ Stat: OCOP  │ Stat: Diện  │
│             │             │  sản phẩm   │    tích     │
├─────────────┴─────────────┴─────────────┴─────────────┤
│ Global filter: Khu vực | Năm | Ngành nghề             │
├──────────────────────────┬────────────────────────────┤
│ Bar: HTX theo ngành nghề │ Pie: OCOP theo xếp hạng    │
├──────────────────────────┴────────────────────────────┤
│ Map: HTX + Vùng sản xuất + Trạm bơm                   │
├───────────────────────────────────────────────────────┤
│ Table: Danh sách HTX (filterable)                     │
└───────────────────────────────────────────────────────┘
```

## 5. Ngoài phạm vi

- Join multi-layer dataset (Phase 5)
- Scheduled report PDF
- Public share link (Phase 5)
- MVT on dashboard map (dùng GeoJSON Phase 4)

## 6. Task checklist

- [ ] Dataset / metric / dimension CRUD API
- [ ] Analytics query engine + SQL builder an toàn
- [ ] query_executions logging
- [ ] Dashboard + revision CRUD
- [ ] Widget registry + config schema
- [ ] Dashboard builder UI (react-grid-layout)
- [ ] Widget renderers: stat, bar, pie, table, map
- [ ] Global filter component + context
- [ ] Draft / preview / publish flow
- [ ] Seed dashboard "Tổng quan Long Bình"
- [ ] Permission: dashboard private / org / public

## 7. Definition of Done

- [ ] Admin tạo dashboard mới kéo thả widget
- [ ] Widget bind metric/dimension by ID
- [ ] Global filter khu vực cập nhật chart + map + table
- [ ] Dashboard mẫu Long Bình publish được
- [ ] Analytics query < 5s với dữ liệu hiện tại
- [ ] query_executions ghi duration + rows
- [ ] Đổi label field không hỏng widget (bind field_id)

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|--------|------------|
| Query chậm | Index JSONB, cache Redis Phase 5 |
| Builder phức tạp | Giới hạn widget types Phase 4 |

## 9. Tham chiếu

- [architecture-v3.1.md](../architecture-v3.1.md) — Query Engine
- [api-conventions.md](../appendix/api-conventions.md)
