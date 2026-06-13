# Quy ước API REST

> **Tài liệu module:** [docs/modules/](../modules/) — cập nhật khi thêm/sửa endpoint.

Base URL: `/api`  
Auth: `Authorization: Bearer <JWT>`

## 1. Response format

### Success

```json
{
  "data": { },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2026-06-13T00:00:00Z"
  }
}
```

### Paginated list

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 120,
    "totalPages": 3
  }
}
```

### Error

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Mô tả lỗi",
    "details": [
      { "field": "dien_tich", "message": "Giá trị không hợp lệ" }
    ]
  },
  "meta": { "requestId": "uuid" }
}
```

## 2. HTTP status codes

| Code | Dùng khi |
|------|----------|
| 200 | OK |
| 201 | Created |
| 204 | Deleted |
| 400 | Validation error |
| 401 | Unauthorized |
| 403 | Forbidden (permission) |
| 404 | Not found |
| 409 | Conflict (dedup, schema migrating) |
| 422 | Business rule violation |
| 429 | Rate limit |
| 500 | Server error |

## 3. ID vs Code

| Context | Dùng |
|---------|------|
| API chính | **UUID** (`layerId`, `fieldId`, `recordId`) |
| Alias đọc | `GET /api/layers/by-code/:code` |
| Snapshot log | `layerCode`, `fieldCode` (debug only) |

Dashboard/metric/widget **bind `fieldId`** (fields.id), không bind code.

## 4. Tenant context

- JWT chứa `tenant_id`
- Mọi query tự filter `tenant_id`
- Header optional: `X-Organization-Id` cho scope org

## 5. API theo phase

### Phase 0

```
GET    /api/health
POST   /api/auth/login
GET    /api/auth/me
GET    /api/tenants/current
```

### Phase 1 — Schema

```
POST   /api/layers
GET    /api/layers
GET    /api/layers/:layerId
GET    /api/layers/by-code/:code
PATCH  /api/layers/:layerId

POST   /api/layers/:layerId/schema/drafts
GET    /api/layers/:layerId/schema
PATCH  /api/schema-drafts/:schemaId
POST   /api/schema-drafts/:schemaId/publish
```

### Phase 1 — Records

```
GET    /api/layers/:layerId/records
POST   /api/layers/:layerId/records
GET    /api/layers/:layerId/records/:recordId
PATCH  /api/layers/:layerId/records/:recordId
DELETE /api/layers/:layerId/records/:recordId

POST   /api/records/query
```

#### Records query body

```json
{
  "layerId": "uuid",
  "select": ["field-id-1", "field-id-2"],
  "filters": [
    { "fieldId": "uuid", "operator": "eq", "value": "active" }
  ],
  "spatialFilter": {
    "type": "bbox",
    "coordinates": [105.78, 10.01, 105.79, 10.02]
  },
  "sort": [{ "fieldId": "uuid", "direction": "asc" }],
  "page": 1,
  "pageSize": 50
}
```

### Phase 1 — Map

```
GET /api/layers/:layerId/geojson?bbox=minLng,minLat,maxLng,maxLat
```

Response: GeoJSON FeatureCollection. Features có `geometry: null` vẫn trả về nếu `includeUnlocated=true`.

### Phase 1 — Import

```
POST /api/imports/upload          multipart/form-data
POST /api/imports/:id/preview
POST /api/imports/:id/execute
GET  /api/imports/:id
GET  /api/jobs/:id
```

### Phase 3 — Workflow

```
POST /api/layers/:layerId/records/:id/submit
POST /api/layers/:layerId/records/:id/approve
POST /api/layers/:layerId/records/:id/reject
POST /api/layers/:layerId/records/:id/publish
GET  /api/layers/:layerId/records/:id/revisions
```

### Phase 4 — Analytics

```
POST /api/analytics/query
```

```json
{
  "datasetId": "uuid",
  "dimensions": ["dimension-id"],
  "metrics": ["metric-id"],
  "filters": [],
  "limit": 100
}
```

**Không** có endpoint nhận SQL thô.

### Phase 4 — Dashboard

```
POST   /api/dashboards
GET    /api/dashboards
GET    /api/dashboards/:id
PATCH  /api/dashboards/:id/draft
POST   /api/dashboards/:id/preview
POST   /api/dashboards/:id/publish
GET    /api/dashboards/:id/revisions
```

### Phase 5 — Tiles

```
GET /api/map/layers/:layerId/tiles/:z/:x/:y.pbf
```

## 6. GeoJSON feature properties

Properties trong GeoJSON dùng **field code** (readable), không field UUID:

```json
{
  "type": "Feature",
  "id": "record-uuid",
  "geometry": { "type": "Polygon", "coordinates": [] },
  "properties": {
    "ten_vung": "Vùng chuyên trồng dưa hấu",
    "nganh_nghe": "dua_hau",
    "dien_tich": { "value": 12, "unit": "ha" }
  }
}
```

## 7. Rate limits (Phase 5)

| Endpoint | Limit |
|----------|-------|
| analytics/query | 30 req/min/user |
| geojson bbox | 60 req/min/user |
| import execute | 5 req/hour/user |

## 8. Tham chiếu

- [architecture-v3.1.md](../architecture-v3.1.md)
- [phases/](../phases/)
