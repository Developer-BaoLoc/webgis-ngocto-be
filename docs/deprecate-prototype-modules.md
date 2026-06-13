# Lộ trình deprecate module prototype

Các module GIS cố định hiện tại là **prototype Phase 0 trước Dynamic Engine**.

## Module sẽ thay thế

| Prototype | Path | Thay bằng (Phase 1) |
|-----------|------|---------------------|
| Cooperatives | `src/modules/cooperatives/` | Layer `economic_collective` |
| Cooperative groups | `src/modules/cooperative-groups/` | Layer `economic_collective` + `loai_chu_the` |
| Irrigation | `src/modules/irrigation/` | `pump_station`, `pump_service_area` |
| Administrative boundary | `src/modules/administrative-boundary/` | `administrative_zone` + ward boundary |
| GisLayersService hardcoded | `src/gis/gis-layers.service.ts` | `GET /api/layers` từ DB metadata |

## Chiến lược

1. **Phase 0–1:** Giữ prototype — FE dùng `GET /api/layers` catalog
2. **Phase 1:** Implement metadata + records API song song
3. **Phase 1 cuối:** Prototype endpoints trả header `Deprecation: true` hoặc redirect
4. **Phase 2:** Xóa prototype modules sau FE chuyển sang dynamic API

## Không làm

- Xóa prototype đột ngột trước khi Phase 1 API sẵn sàng
- Duplicate business logic — prototype chỉ adapter tạm
