# Frontend — Hướng dẫn CRUD Admin

Tài liệu tích hợp API cho team frontend (Next.js).  
Base URL: `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api`

> Chi tiết từng module: [metadata.md](./metadata.md) · [records.md](./records.md) · [dictionaries.md](./dictionaries.md) · [import.md](./import.md) · [dashboards.md](./dashboards.md) · [auth.md](./auth.md)

## 1. Tổng quan — CRUD đã có API

| Nhóm | CRUD | Ghi chú |
|------|------|---------|
| **Layer** | ✅ Create, Read, Update, Delete | `POST/PATCH/DELETE /api/layers` |
| **Field (schema)** | ✅ Thêm / sửa / ẩn trong **draft** | Publish mới áp dụng records |
| **Record (bản ghi)** | ✅ Full CRUD + GeoJSON | Theo `layerId` |
| **Dictionary** | ✅ Full CRUD | [dictionaries.md](./dictionaries.md) |
| **Dashboard** | ✅ Builder MVP | Draft/publish + analytics query |
| **Import Excel** | ✅ Theo layer | Tải mẫu schema → điền → import |

**Layers không còn seed sẵn** — admin tạo layer qua API (BE **tự publish** schema rỗng), rồi thêm fields (BE **tự publish** sau mỗi lần thêm/sửa/xóa/sắp xếp trường).

## 2. Auth (bắt buộc trước mọi thao tác admin)

```typescript
const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

async function login(email: string, password: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  return json.data.accessToken as string;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
```

Dev seed: `admin@ngocto.local` / `Admin@123`

## 2.1. Map — zoom phường + vẽ ranh (khi vào app)

**Không cần auth.** Gọi ngay khi mount trang bản đồ:

```
GET /api/layers
GET /api/layers/administrative-boundary
```

Từ `data.project.mapView`:

| Field | Dùng cho |
|-------|----------|
| `bounds` | `[minLng, minLat, maxLng, maxLat]` → `map.fitBounds()` |
| `center` | fallback nếu không dùng fitBounds |
| `defaultZoom` | fallback zoom |
| `boundaryEndpoint` | path GeoJSON ranh (vd. `/api/layers/administrative-boundary`) |

```typescript
const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

async function initWardMap(map: maplibregl.Map) {
  const catalog = await fetch(`${API}/layers`).then((r) => r.json());
  const mapView = catalog.data.project.mapView;

  const boundary = await fetch(`${API}/layers/administrative-boundary`).then((r) => r.json());

  map.addSource('ward-boundary', { type: 'geojson', data: boundary });
  map.addLayer({
    id: 'ward-fill',
    type: 'fill',
    source: 'ward-boundary',
    paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.08 },
  });
  map.addLayer({
    id: 'ward-line',
    type: 'line',
    source: 'ward-boundary',
    paint: { 'line-color': '#2563eb', 'line-width': 2 },
  });

  const [minLng, minLat, maxLng, maxLat] = mapView.bounds;
  map.fitBounds(
    [
      [minLng, minLat],
      [maxLng, maxLat],
    ],
    { padding: 48, duration: 0 },
  );
}
```

> Chi tiết cấu hình phường khác: [administrative-boundary.md](./administrative-boundary.md) · `data/ward-boundaries/README.md`

### Load điểm layer (HTX, …)

**Cách đơn giản nhất** — một request lấy tất cả điểm mọi lớn active (Public):

```
GET /api/map/geojson
GET /api/map/geojson?layerId=:layerId   # chỉ lớp HTX
```

```typescript
const { data } = await fetch(`${API}/map/geojson?layerId=${htxLayerId}`).then((r) => r.json());
const { layers, featureCollection } = data;

map.addSource('data-points', { type: 'geojson', data: featureCollection });
map.addLayer({
  id: 'data-points-circle',
  type: 'circle',
  source: 'data-points',
  paint: {
    'circle-radius': 8,
    'circle-color': '#ef4444',
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  },
});
```

Hoặc từng lớp:

```typescript
async function loadLayerPoints(map: maplibregl.Map, layerId: string) {
  const res = await fetch(`${API}/layers/${layerId}/geojson`);
  const { data: geojson } = await res.json();

  if (!geojson.features.length) return;

  const sourceId = `layer-${layerId}`;
  if (map.getSource(sourceId)) {
    (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
    return;
  }

  map.addSource(sourceId, { type: 'geojson', data: geojson });
  map.addLayer({
    id: `${sourceId}-circle`,
    type: 'circle',
    source: sourceId,
    paint: {
      'circle-radius': 8,
      'circle-color': '#ef4444',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#fff',
    },
  });
}

// Sau initWardMap: load từng layer active
const catalog = await fetch(`${API}/layers`).then((r) => r.json());
for (const layer of catalog.data.layers) {
  if (layer.geometryType === 'point') {
    await loadLayerPoints(map, layer.id);
  }
}
```

### Click điểm — popup (bắt buộc) + chi tiết (đầy đủ)

**Quy tắc hiển thị (BE tính sẵn):**

| Chế độ | Fields |
|--------|--------|
| **Popup** (click map) | Trường bật `displaySchema.showOnMapPopup: true` (tuỳ chọn **Hiển thị khi click trên bản đồ**). Schema cũ chưa có tuỳ chọn: trường **bắt buộc** vẫn hiện popup |
| **Chi tiết** | Tất cả fields trong schema published |

**Luồng FE:**

1. **Click điểm** → đọc `feature.properties.popupSummary` (đã có sẵn trong GeoJSON):

```json
{
  "popupSummary": [
    {
      "code": "ten_mo_hinh",
      "label": "Tên mô hình",
      "displayValue": "HTX Ngọc Liên Phát",
      "popupStyle": { "bold": true, "fontSize": "large", "color": "#2563eb" }
    },
    { "code": "nguoi_dai_dien", "label": "Người đại diện", "displayValue": "Ngô Hoài Tâm" }
  ],
  "_recordId": "uuid",
  "_layerId": "uuid"
}
```

2. **Nút "Xem chi tiết"** → gọi:

```
GET /api/layers/:layerId/records/:recordId/display
```

Response:

```json
{
  "data": {
    "recordId": "uuid",
    "layerId": "uuid",
    "layerCode": "htx",
    "layerName": "HTX",
    "popup": [ { "code", "label", "fieldType", "required", "value", "displayValue" } ],
    "detail": [ /* tất cả fields */ ]
  }
}
```

Hoặc `GET /api/layers/:layerId/records/:recordId` (JWT) — response gồm thêm `display.popup` + `display.detail` + `geometry`.

```typescript
map.on('click', 'htx-points-circle', (e) => {
  const feature = e.features?.[0];
  if (!feature) return;

  const props = feature.properties as {
    popupSummary?: Array<{
      label: string;
      displayValue: string;
      popupStyle?: { bold?: boolean; fontSize?: string; color?: string };
    }>;
    _recordId?: string;
    _layerId?: string;
  };

  const fontSizePx: Record<string, string> = { small: '12px', medium: '14px', large: '18px' };

  const html = (props.popupSummary ?? [])
    .map((f) => {
      const style = [
        f.popupStyle?.bold ? 'font-weight:700' : '',
        f.popupStyle?.fontSize ? `font-size:${fontSizePx[f.popupStyle.fontSize] ?? '14px'}` : '',
        f.popupStyle?.color ? `color:${f.popupStyle.color}` : '',
      ].filter(Boolean).join(';');
      return `<div><strong>${f.label}:</strong> <span style="${style}">${f.displayValue}</span></div>`;
    })
    .join('');

  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(`${html}<button id="view-detail">Xem chi tiết</button>`)
    .addTo(map);

  document.getElementById('view-detail')?.addEventListener('click', async () => {
    const res = await fetch(`${API}/layers/${props._layerId}/records/${props._recordId}/display`);
    const { data } = await res.json();
    openDetailPanel(data.detail); // drawer/modal toàn bộ fields
  });
});
```

**Tuỳ chọn popup bản đồ** — trong form thêm/sửa trường, hiển thị checkbox từ catalog:

```
GET /api/metadata/field-display-options
```

```json
{
  "data": {
    "groups": [
      {
        "key": "mapPopup",
        "label": "Tuỳ chỉnh popup bản đồ",
        "hint": "Áp dụng khi trường được bật Hiển thị khi click trên bản đồ"
      }
    ],
    "options": [
      { "key": "showOnMapPopup", "label": "Hiển thị khi click trên bản đồ", "type": "boolean", "default": false, "group": "mapPopup" },
      { "key": "popupBold", "label": "In đậm", "type": "boolean", "default": false, "group": "mapPopup", "dependsOn": { "key": "showOnMapPopup", "value": true } },
      { "key": "popupFontSize", "label": "Cỡ chữ", "type": "select", "options": [{ "code": "small", "label": "Nhỏ" }, { "code": "medium", "label": "Vừa" }, { "code": "large", "label": "Lớn" }], "default": "medium", "group": "mapPopup" },
      { "key": "popupTextColor", "label": "Màu chữ", "type": "color", "default": null, "group": "mapPopup" }
    ]
  }
}
```

Gửi khi tạo/sửa field (`displaySchema`):

```json
{
  "label": "Tên mô hình",
  "fieldType": "text",
  "dataSchema": { "required": true },
  "displaySchema": {
    "showOnMapPopup": true,
    "popupBold": true,
    "popupFontSize": "large",
    "popupTextColor": "#2563eb"
  }
}
```

| Key | Label UI | Giá trị |
|-----|----------|---------|
| `showOnMapPopup` | Hiển thị khi click trên bản đồ | `true` / `false` |
| `popupBold` | In đậm | `true` / `false` |
| `popupFontSize` | Cỡ chữ | `small` · `medium` · `large` |
| `popupTextColor` | Màu chữ | Hex `#2563eb` (hoặc bỏ trống = mặc định) |

Response GeoJSON / `/display` trả `popupStyle: { bold, fontSize, color }` trên từng dòng popup — FE áp dụng CSS khi render.

- Bật **Hiển thị khi click trên bản đồ** → hiện popup khi click icon (kể cả trường không bắt buộc)
- Tắt → không hiện popup (kể cả trường bắt buộc)
- Không gửi `showOnMapPopup` trên schema cũ → giữ hành vi cũ (bắt buộc = hiện popup)

## 3. Response format

Mọi endpoint Phase 1 trả `{ data, meta }`:

```json
{
  "data": { },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

List có pagination (records):

```json
{
  "data": [
    {
      "id": "uuid",
      "properties": { },
      "cells": { "ten_mo_hinh": "HTX ABC", "chi_phi_nam": "2,6 Triệu đồng" }
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 120,
    "totalPages": 6,
    "columns": [{ "code": "ten_mo_hinh", "label": "Tên mô hình", "fieldType": "text", "required": true }]
  }
}
```

Lỗi validation:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": [{ "field": "ten_chu_the", "message": "..." }]
  }
}
```

## 4. Flow admin — Layer + Field + Publish

### Bước 1 — Lấy catalog loại layer / field types

```
GET /api/metadata/layer-geometry-types
GET /api/metadata/field-types
```

**`layer-geometry-types`** — dùng cho form tạo lớp:

```json
{
  "data": [
    {
      "type": "point",
      "label": "Điểm",
      "geometryKind": "point",
      "styleFields": [{ "key": "icon", "label": "Icon", "type": "icon" }]
    },
    {
      "type": "line",
      "label": "Đường",
      "geometryKind": "linestring",
      "styleFields": [
        { "key": "iconAttachmentId", "label": "Icon (upload)", "type": "icon_upload" },
        { "key": "lineColor", "label": "Màu đường", "type": "color" },
        { "key": "lineWidth", "label": "Kích thước đường", "type": "number" }
      ]
    },
    {
      "type": "polygon",
      "label": "Vùng",
      "geometryKind": "polygon",
      "styleFields": [
        { "key": "iconAttachmentId", "label": "Icon (upload)", "type": "icon_upload" },
        { "key": "fillColor", "label": "Màu vùng", "type": "color" },
        { "key": "strokeColor", "label": "Màu viền vùng", "type": "color" }
      ]
    }
  ]
}
```

### Bước 2 — Upload icon (mọi loại lớp: điểm / đường / vùng)

```
POST /api/assets/layer-icons/upload
Content-Type: multipart/form-data
Field: file   (PNG/JPEG/WebP/SVG, max 512KB)
Authorization: Bearer {token}
```

```typescript
const form = new FormData();
form.append('file', iconFile);

const uploadRes = await fetch(`${API}/assets/layer-icons/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const { data: iconAsset } = await uploadRes.json();
// iconAsset.attachmentId, iconAsset.url
```

Chi tiết: [assets.md](./assets.md)

### Bước 3 — Tạo layer

```
POST /api/layers
```

**Điểm (icon upload):**

```json
{
  "geometryType": "point",
  "name": "Chủ thể kinh tế tập thể",
  "description": "HTX và THT trên địa bàn phường",
  "sortOrder": 1,
  "style": {
    "iconAttachmentId": "uuid-từ-upload",
    "iconUrl": "/api/assets/uuid/file"
  }
}
```

**Đường:**

```json
{
  "geometryType": "line",
  "name": "Kênh thủy lợi",
  "sortOrder": 2,
  "style": { "lineColor": "#2563eb", "lineWidth": 3 }
}
```

**Vùng:**

```json
{
  "geometryType": "polygon",
  "name": "Vùng sản xuất",
  "sortOrder": 3,
  "style": { "fillColor": "#22c55e80", "strokeColor": "#15803d" }
}
```

**Response** gồm `code` (BE sinh), `geometryType`, `style`, `currentSchemaVersionId`, `schemaStatus`:

```json
{
  "data": {
    "id": "uuid",
    "code": "chu_the_kinh_te_tap_the",
    "name": "Chủ thể kinh tế tập thể",
    "geometryType": "point",
    "geometryKind": "point",
    "style": {
      "geometryType": "point",
      "icon": {
        "source": "upload",
        "attachmentId": "uuid",
        "url": "/api/assets/uuid/file"
      }
    },
    "sortOrder": 1,
    "currentSchemaVersionId": "uuid",
    "draftSchemaId": null,
    "schemaStatus": "published"
  }
}
```

> BE **tự publish** schema rỗng v1 ngay khi tạo layer — không còn trạng thái “bản nháp chưa xuất bản”.

### Bước 3 — Thêm fields

Dùng `currentSchemaVersionId` (hoặc `draftSchemaId` nếu layer đang có draft chỉnh sửa) làm `schemaId`:

```
POST /api/schema-drafts/:schemaId/fields
```

BE tự tạo draft từ published nếu cần, rồi **tự publish** sau khi thêm/sửa/xóa/sắp xếp trường.

Hoặc lấy schema theo layer:

```
GET /api/layers/:layerId/schema
GET /api/layers/:layerId/schema/draft
GET /api/schema-drafts/:schemaId
```

Response schema có `id` (= `schemaVersionId`) và `fields`.

Nếu layer cũ chưa có draft khi muốn chỉnh → `POST /api/layers/:layerId/schema/drafts`.

```
POST /api/schema-drafts/:schemaId/fields
```

**Mã trường (`code`) backend tự sinh** từ `label` (slug snake_case). FE không gửi `code`.

```json
{
  "label": "Tên chủ thể",
  "fieldType": "text",
  "dataSchema": { "required": true },
  "displaySchema": {
    "showOnMapPopup": true,
    "popupBold": true,
    "popupFontSize": "medium",
    "popupTextColor": "#16a34a"
  },
  "sortOrder": 1
}
```

**BE tự xuất bản** sau khi thêm/sửa/xóa/sắp xếp trường — response trả schema `status: "published"`. Không cần gọi `POST .../publish` riêng.

Response schema trả `fields[].code` — dùng key này khi ghi `properties` của record.

**Field types hỗ trợ:** `text`, `textarea`, `integer`, `decimal`, `money`, `measurement`, `quantity`, `phone`, `boolean`, `date`, `category`, `multi_category`, `reference`, `lat_lng`, `image`, `file`.

Lấy catalog có label, `uiComponent`, `configFields` (đơn vị / danh mục bắt buộc):

```
GET /api/metadata/field-types
```

```json
{
  "data": [
    { "type": "text", "label": "Văn bản ngắn", "uiComponent": "text" },
    {
      "type": "money",
      "label": "Tiền tệ",
      "uiComponent": "money",
      "configFields": [
        {
          "key": "unit",
          "label": "Đơn vị tiền tệ",
          "required": true,
          "type": "select",
          "options": [
            { "code": "vnd", "label": "VNĐ" },
            { "code": "hundred_thousand", "label": "Trăm nghìn đồng" },
            { "code": "million", "label": "Triệu đồng" },
            { "code": "billion", "label": "Tỷ đồng" }
          ]
        }
      ]
    },
    {
      "type": "measurement",
      "label": "Đo lường",
      "uiComponent": "measurement",
      "configFields": [
        {
          "key": "measurementType",
          "label": "Loại đo lường",
          "required": true,
          "type": "select",
          "options": [
            { "code": "distance", "label": "Khoảng cách" },
            { "code": "area", "label": "Diện tích" }
          ]
        },
        {
          "key": "unit",
          "label": "Đơn vị khoảng cách",
          "dependsOn": { "key": "measurementType", "value": "distance" },
          "options": [{ "code": "m", "label": "m" }, { "code": "km", "label": "km" }]
        },
        {
          "key": "unit",
          "label": "Đơn vị diện tích",
          "dependsOn": { "key": "measurementType", "value": "area" },
          "options": [{ "code": "m2", "label": "m²" }, { "code": "ha", "label": "ha" }]
        }
      ]
    },
    {
      "type": "quantity",
      "label": "Sản lượng",
      "uiComponent": "quantity",
      "configFields": [
        {
          "key": "unit",
          "label": "Đơn vị sản lượng",
          "required": true,
          "type": "select",
          "options": [
            { "code": "kg", "label": "kg" },
            { "code": "tan", "label": "tấn" },
            { "code": "lit", "label": "lít" }
          ]
        }
      ]
    },
    {
      "type": "category",
      "label": "Danh mục",
      "uiComponent": "category",
      "configFields": [
        { "key": "dictionary", "label": "Danh mục dùng chung", "required": true, "type": "dictionary" }
      ]
    },
    { "type": "lat_lng", "label": "Toạ độ", "uiComponent": "lat_lng", "valueShape": { "lat": "number", "lng": "number" } }
  ]
}
```

**FE render form thêm field:** đọc `configFields` từ catalog — hiển thị dropdown đơn vị / chọn danh mục tương ứng với `fieldType` đã chọn. Gửi các giá trị đó vào `dataSchema` khi `POST .../fields`.

#### Tiền tệ (`money`)

Bắt buộc chọn `dataSchema.unit`:

```json
{
  "label": "Chi phí/năm",
  "fieldType": "money",
  "dataSchema": { "unit": "million", "required": true }
}
```

Giá trị record (user nhập theo đơn vị đã chọn):

```json
{ "chi_phi_nam": { "value": 2420 } }
```

BE normalize → `{ amount: 2420000000, currency: "VND", unit: "million", sourceValue: 2420, sourceUnit: "million" }`.

#### Đo lường (`measurement`)

```json
{
  "label": "Diện tích",
  "fieldType": "measurement",
  "dataSchema": { "measurementType": "area", "unit": "ha", "required": true }
}
```

Khoảng cách:

```json
{
  "label": "Chiều dài kênh",
  "fieldType": "measurement",
  "dataSchema": { "measurementType": "distance", "unit": "km" }
}
```

Giá trị record: `{ "value": 17 }` hoặc `{ "value": 17, "unit": "ha" }`.

#### Sản lượng (`quantity`)

```json
{
  "label": "Sản lượng lươn",
  "fieldType": "quantity",
  "dataSchema": { "unit": "kg", "required": true }
}
```

Giá trị record: `{ "value": 1500 }`.

#### Toạ độ (`lat_lng`)

```json
{
  "label": "Vị trí",
  "fieldType": "lat_lng",
  "dataSchema": { "required": false }
}
```

Giá trị record:

```json
{
  "properties": {
    "vi_tri": { "lat": 9.4466, "lng": 105.9342 }
  }
}
```

Với **lớp điểm**, chỉ cần gửi `properties` — không cần gửi thêm `geometry`. BE tự tạo Point trên bản đồ.

#### Chọn một / Chọn nhiều (`category` / `multi_category`)

Danh mục = **nhóm giá trị lựa chọn** dùng chung cho các field lớp dữ liệu.

| fieldType | UI form bản ghi |
|-----------|-----------------|
| `category` | Select — chọn **một** giá trị |
| `multi_category` | Multi-select — chọn **nhiều** giá trị |

**Bước 1 — Tạo danh mục + các giá trị:**

```json
POST /api/dictionaries
{
  "name": "Ngành nghề sản xuất",
  "values": [
    { "label": "Trồng trọt" },
    { "label": "Chăn nuôi" }
  ]
}
```

Hoặc thêm giá trị sau: `POST /api/dictionaries/:code/items` hoặc `.../items/batch`.

**Bước 2 — Gắn danh mục vào field:**

```json
{
  "label": "Ngành nghề",
  "fieldType": "category",
  "dataSchema": { "dictionary": "nganh_nghe_san_xuat", "required": true }
}
```

**Bước 3 — Form bản ghi load options:**

```
GET /api/dictionaries/nganh_nghe_san_xuat/items
```

Lưu `properties.nganh_nghe = "trong_trot"` (mã giá trị, không phải label).

#### Hình ảnh / Tệp tin (`image` / `file`)

Mỗi trường lưu **mảng** attachment — upload được **nhiều ảnh** hoặc **nhiều file**.

**Thêm field vào schema:**

```json
{
  "label": "Hình ảnh HTX",
  "fieldType": "image",
  "dataSchema": { "required": false, "maxCount": 10 }
}
```

**Upload (trước khi lưu bản ghi):**

```typescript
// Một ảnh
const form = new FormData();
form.append('file', imageFile);
const { data: uploaded } = await fetch(`${API}/assets/field-images/upload`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
}).then((r) => r.json());

// Nhiều ảnh cùng lúc
const batch = new FormData();
for (const f of imageFiles) batch.append('files', f);
const { data: batchResult } = await fetch(`${API}/assets/field-images/upload-batch`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: batch,
}).then((r) => r.json());
// batchResult.items = [{ attachmentId, url, originalName, ... }, ...]
```

Tương tự file: `/assets/field-files/upload` và `/assets/field-files/upload-batch`.

**Lưu bản ghi:**

```json
{
  "properties": {
    "hinh_anh_htx": [
      { "attachmentId": "uuid-1", "url": "/api/assets/uuid-1/file", "originalName": "a.jpg" },
      { "attachmentId": "uuid-2" }
    ],
    "tai_lieu": [
      { "attachmentId": "uuid-3", "originalName": "hop-dong.pdf" }
    ]
  }
}
```

Hiển thị ảnh: `GET /api/assets/:attachmentId/file` (public, không cần JWT).

| Kiểu | Upload | Định dạng | Giới hạn |
|------|--------|-----------|----------|
| `image` | `field-images/upload` | PNG, JPEG, WebP, GIF | 5MB/ảnh, max 20 |
| `file` | `field-files/upload` | PDF, Word, Excel, ZIP, TXT, CSV | 10MB/file, max 20 |

Chi tiết: [assets.md](./assets.md)

### Bước 4 — Sửa / xóa / sắp xếp field trong draft

```
PATCH /api/schema-drafts/:schemaId/fields/:fieldId
DELETE /api/schema-drafts/:schemaId/fields/:fieldId
PATCH /api/schema-drafts/:schemaId/fields/reorder
```

Chỉ sửa được khi schema **status = draft**. Xóa = đặt `isActive: false`.

**Thứ tự hiển thị** — mỗi field có `sortOrder`. Schema trả `fields[]` đã sort theo `sortOrder` ASC → FE dùng thứ tự này cho form nhập liệu, bảng danh sách, popup map.

**Kéo thả sắp xếp (drag & drop):**

```json
PATCH /api/schema-drafts/:schemaId/fields/reorder
{
  "fieldIds": [
    "uuid-field-ten",
    "uuid-field-loai",
    "uuid-field-anh"
  ]
}
```

- Gửi **đủ tất cả** `fieldId` active trong draft, theo thứ tự muốn hiển thị (trên → dưới)
- BE gán `sortOrder = 1, 2, 3, ...`
- Response trả lại schema đầy đủ với `fields` đã sắp xếp

```typescript
async function reorderFields(schemaId: string, orderedFieldIds: string[], token: string) {
  await fetch(`${API}/schema-drafts/${schemaId}/fields/reorder`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ fieldIds: orderedFieldIds }),
  });
}
```

Cách khác: `PATCH .../fields/:fieldId` với `{ "sortOrder": 3 }` cho từng field (ít dùng hơn khi kéo thả nhiều dòng).

Sau khi đổi thứ tự → BE **tự xuất bản** — form/bản ghi production dùng thứ tự mới ngay.

### Bước 5 — Xuất bản schema (tuỳ chọn)

Thêm/sửa/xóa/sắp xếp trường **đã tự xuất bản**. Chỉ cần gọi thủ công khi chỉ sửa `changeSummary` draft:

```
POST /api/schema-drafts/:schemaId/publish
```

Sau khi schema đã published:
- Muốn sửa tiếp → `POST /api/layers/:layerId/schema/drafts` (copy từ published) → chỉnh field → BE tự publish lại

### Bước 6 — Sửa layer

```
PATCH /api/layers/:layerId
```

```json
{
  "name": "Tên mới",
  "description": "Mô tả cập nhật",
  "sortOrder": 5,
  "style": { "icon": "store" }
}
```

### Xóa layer

```
DELETE /api/layers/:layerId
```

**Xóa hẳn** layer khỏi database (không còn trạng thái “không hoạt động”). BE xóa luôn schema, fields, bản ghi, quan hệ, dataset analytics liên quan.

Response:

```json
{ "data": { "id": "uuid", "deleted": true, "recordsDeleted": 2 } }
```

> Hành động **không thể hoàn tác**. Muốn tạm ẩn layer khỏi catalog public → dùng `PATCH /api/layers/:layerId` với `{ "isActive": false }`.

### Bảng dữ liệu (có phân trang)

**Không** dùng GeoJSON cho bảng — GeoJSON trả hết feature cho bản đồ. Bảng dùng:

```
GET /api/layers/:layerId/records?page=1&pageSize=20&sortBy=createdAt&sortOrder=desc&q=HTX
```

```typescript
async function fetchRecordTable(
  token: string,
  layerId: string,
  params: { page?: number; pageSize?: number; q?: string } = {},
) {
  const query = new URLSearchParams({
    page: String(params.page ?? 1),
    pageSize: String(params.pageSize ?? 20),
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(params.q ? { q: params.q } : {}),
  });

  const res = await fetch(`${API}/layers/${layerId}/records?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data, meta } = await res.json();

  return {
    rows: data as Array<{ id: string; cells: Record<string, string>; rowVersion: number }>,
    columns: meta.columns as Array<{ code: string; label: string; fieldType: string }>,
    page: meta.page as number,
    pageSize: meta.pageSize as number,
    total: meta.total as number,
    totalPages: meta.totalPages as number,
  };
}
```

**UI gợi ý:**

| Thành phần | Nguồn |
|------------|-------|
| Header cột | `meta.columns[].label` |
| Ô dữ liệu | `row.cells[col.code]` |
| Phân trang | `page`, `totalPages`, `total` |
| Tìm kiếm | query `q` (debounce 300ms) |
| Đổi trang | `page=2&pageSize=20` |

Mặc định `pageSize=20`, tối đa `200`.

### Tạo

```
POST /api/layers/:layerId/records
```

```json
{
  "properties": {
    "ten_chu_the": "HTX NN Bình Lợi",
    "loai_chu_the": "hop_tac_xa",
    "khu_vuc": "binh_loi"
  }
}
```

Geometry optional:

```json
{
  "properties": { "ten_tram_bom": "Trạm Bình Lợi" },
  "geometry": { "type": "Point", "coordinates": [105.9342, 9.4466] }
}
```

### Cập nhật (optimistic lock)

```
PATCH /api/layers/:layerId/records/:recordId
```

```json
{
  "rowVersion": 1,
  "properties": { "tinh_trang": "active" }
}
```

409/400 nếu `rowVersion` lệch → reload record.

### Xóa

```
DELETE /api/layers/:layerId/records/:recordId
```

### GeoJSON (bản đồ)

```
GET /api/layers/:layerId/geojson
```

**Public** — không bắt buộc JWT (dùng `DEFAULT_TENANT_ID`). Nếu có token thì theo tenant user.

**Response bọc `{ data, meta }`:**

```typescript
const res = await fetch(`${API}/layers/${layerId}/geojson`);
const { data: featureCollection } = await res.json();
// featureCollection.type === 'FeatureCollection'
// featureCollection.features[].geometry.coordinates === [lng, lat]
```

**Quan trọng — `bbox`:**

- Lần đầu load map: **không gửi `bbox`** (hoặc dùng `project.mapView.bounds` từ `GET /api/layers`).
- Không hardcode bbox quanh `10.01, 105.78` — Ngọc Tố thực tế ~**lat 9.68–9.78**, **lng 105.55–105.62**.
- Ví dụ bbox sai → 0 điểm dù DB có dữ liệu.

```
# Đúng — không bbox
GET /api/layers/:layerId/geojson

# Hoặc bbox theo mapView.bounds
GET /api/layers/:layerId/geojson?bbox=105.55,9.68,105.62,9.78
```

Public catalog (sidebar map, không cần login):

```
GET /api/layers
```

→ `{ data: { project, layers: [] } }` — rỗng cho đến khi admin tạo layer.

## 6. Gợi ý màn hình FE

| Màn | API chính |
|-----|-----------|
| **Tạo lớp dữ liệu** | `GET /metadata/layer-geometry-types` → form điểm/đường/vùng + style |
| **Quản lý lớp** | `GET /layers/admin`, `POST/PATCH/DELETE /layers` |
| **Thiết kế schema** | draft fields (tự publish); `GET /metadata/field-types` + `GET /metadata/field-display-options` |
| **Bảng bản ghi layer** | `GET/POST .../records` + **Tải mẫu / Import Excel** — xem mục 9 |
| **Quản lý danh mục dùng chung** | CRUD `/dictionaries` — xem mục 6.1 |

### 6.1. Màn quản trị — Danh mục dùng chung

**Mô hình dữ liệu**

```
Danh mục (Dictionary)     = nhóm lựa chọn (vd: "Ngành nghề sản xuất")
  └── Giá trị (values)    = từng option trong select (vd: "Trồng trọt", "Chăn nuôi")

Field lớp dữ liệu:
  category        → user chọn 1 giá trị
  multi_category  → user chọn nhiều giá trị
  dataSchema.dictionary → mã danh mục ở trên
```

Menu admin: **Quản trị → Danh mục dùng chung**.

**Màn danh sách** — `GET /api/dictionaries`

| Cột | Ý nghĩa |
|-----|---------|
| Tên | Tên danh mục |
| Mã | `code` — dùng khi gắn vào field |
| Số giá trị | `itemCount` |

**Tạo danh mục + giá trị** (modal 2 bước hoặc một form):

```typescript
// Cách 1: tạo kèm giá trị ban đầu
await fetch(`${API}/dictionaries`, {
  method: 'POST',
  headers: h,
  body: JSON.stringify({
    name: 'Ngành nghề sản xuất',
    values: [
      { label: 'Trồng trọt' },
      { label: 'Chăn nuôi' },
      { label: 'Dịch vụ bơm tưới' },
    ],
  }),
});

// Cách 2: tạo danh mục rỗng, thêm giá trị ở màn chi tiết
await fetch(`${API}/dictionaries/${code}/items`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ label: 'Trồng trọt' }),
});

// Thêm nhiều giá trị một lúc
await fetch(`${API}/dictionaries/${code}/items/batch`, {
  method: 'POST', headers: h,
  body: JSON.stringify({
    values: [{ label: 'Chế biến' }, { label: 'Thủy sản' }],
  }),
});
```

**Màn chi tiết danh mục** — quản lý **giá trị lựa chọn**:

```
GET /api/dictionaries/:code?includeItems=true
```

Response có `values` (alias của `items`): `{ code, label, sortOrder }`.

UI: bảng giá trị + nút **Thêm giá trị**, sửa label, ẩn (DELETE item).

**Dùng danh mục khi thiết kế schema**

1. Field type **Chọn một** (`category`) hoặc **Chọn nhiều** (`multi_category`)
2. Dropdown **Nhóm danh mục** ← `GET /api/dictionaries`
3. Lưu `dataSchema.dictionary = code`

**Dùng danh mục khi nhập bản ghi**

```typescript
const { data: options } = await fetch(
  `${API}/dictionaries/${dictionaryCode}/items`, { headers: h },
).then((r) => r.json());

// category → select một: properties[fieldCode] = option.code
// multi_category → checkbox/tags: properties[fieldCode] = ['code1', 'code2']
```

**Lưu ý:** Không còn danh mục seed sẵn. DB cũ: `yarn db:clear-dictionaries`.

| Màn | API chính |
|-----|-----------|
| **Danh sách bản ghi** | `GET .../records` + render cột từ `GET .../schema` |
| **Form thêm/sửa** | render input từ `fieldType` + `dataSchema` |
| **Bản đồ** | `GET /layers` → `mapView` + `GET /layers/:id/geojson` (dùng `response.data`) |

## 7. Ví dụ Ngọc Tố — tạo layer HTX

```typescript
// 1. Login
const token = await login('admin@ngocto.local', 'Admin@123');
const h = authHeaders(token);

// 2. Upload icon
const form = new FormData();
form.append('file', iconFile);
const iconRes = await fetch(`${API}/assets/layer-icons/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const { data: iconAsset } = await iconRes.json();

// 3. Tạo layer (code do BE sinh)
const layerRes = await fetch(`${API}/layers`, {
  method: 'POST', headers: h,
  body: JSON.stringify({
    geometryType: 'point',
    name: 'Chủ thể kinh tế tập thể',
    sortOrder: 1,
    style: {
      iconAttachmentId: iconAsset.attachmentId,
      iconUrl: iconAsset.url,
    },
  }),
});
const { data: layer } = await layerRes.json();
const schemaId = layer.currentSchemaVersionId ?? layer.draftSchemaId;

// 4. Tạo danh mục + fields
const dictRes = await fetch(`${API}/dictionaries`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ name: 'Loại chủ thể' }),
});
const { data: loaiDict } = await dictRes.json();
await fetch(`${API}/dictionaries/${loaiDict.code}/items`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ label: 'Hợp tác xã' }),
});

const fields = [
  { label: 'Tên chủ thể', fieldType: 'text', dataSchema: { required: true } },
  { label: 'Loại chủ thể', fieldType: 'category', dataSchema: { dictionary: loaiDict.code, required: true } },
];
for (const [i, f] of fields.entries()) {
  await fetch(`${API}/schema-drafts/${schemaId}/fields`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ ...f, sortOrder: i + 1 }),
  });
}

// 5. Tạo record (BE đã tự publish schema sau mỗi field)
await fetch(`${API}/layers/${layer.id}/records`, {
  method: 'POST', headers: h,
  body: JSON.stringify({
    properties: { ten_chu_the: 'HTX NN Bình Lợi', loai_chu_the: 'hop_tac_xa' },
  }),
});
```

## 8. Danh mục dùng chung

Không seed sẵn — admin tạo trong màn **Quản lý danh mục dùng chung**. Chi tiết API: [dictionaries.md](./dictionaries.md).

Dọn DB cũ (xóa Khu vực, Loại bơm, Loại chủ thể…):

```bash
yarn db:clear-dictionaries
```

yarn db:clear-dictionaries
```

## 9. Import Excel theo lớp dữ liệu

Chi tiết: [import.md](./import.md).

Luồng trên **màn bảng dữ liệu** của từng layer (VD: Hợp tác xã):

```
[Tải mẫu Excel] → User điền → [Import] → Preview → Xác nhận
```

### Tải file mẫu

```typescript
async function downloadImportTemplate(token: string, layerId: string) {
  const res = await fetch(`${API}/layers/${layerId}/imports/template`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Không tải được mẫu');

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="(.+)"/);
  const fileName = match ? decodeURIComponent(match[1]) : `mau_import_${layerId}.xlsx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
```

File mẫu gồm 3 sheet: `Du_lieu` (điền từ **dòng 4**), `Huong_dan`, `_meta` (không sửa).

### Upload + Preview + Execute

```typescript
async function importLayerExcel(token: string, layerId: string, file: File) {
  const h = { Authorization: `Bearer ${token}` };

  const form = new FormData();
  form.append('file', file);

  const uploaded = await fetch(`${API}/layers/${layerId}/imports/upload`, {
    method: 'POST',
    headers: h,
    body: form,
  }).then(r => r.json());

  const { importId, totalRows } = uploaded.data;

  const preview = await fetch(
    `${API}/layers/${layerId}/imports/${importId}/preview`,
    { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' } },
  ).then(r => r.json());

  const { canImport, errors, errorRows, errorCount, validRows, totalRows: total, columns } = preview.data;

  if (!canImport) {
    // Hiển thị bảng lỗi — user sửa Excel rồi upload lại
    // errors[]: { rowNumber, fieldLabel, rawValue, code, message }
    // errorRows = số dòng lỗi; errorCount = tổng lỗi chi tiết (badge "48 lỗi" → errorCount)
    // columns[]: header bảng preview — map rawProperties[col.fieldCode]
    return { success: false, errors, errorRows, errorCount, validRows, totalRows: total, columns };
  }

  const result = await fetch(
    `${API}/layers/${layerId}/imports/${importId}/execute`,
    { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' } },
  ).then(r => r.json());

  if (!result.data) {
    // HTTP 400 — IMPORT_VALIDATION_FAILED (file thay đổi sau preview)
    return { success: false, errors: result.message?.errors ?? [] };
  }

  return {
    success: true,
    totalRows: total,
    created: result.data.created,
    duplicates: result.data.duplicates,
    duplicateRows: result.data.duplicateRows,
    message: result.data.message,
  };
}
```

### UI hiển thị lỗi (gợi ý)

| Cột bảng lỗi | Nguồn |
|--------------|-------|
| Dòng Excel | `error.rowNumber` |
| Cột | `error.fieldLabel` |
| Giá trị đang nhập | `error.rawValue` |
| Lỗi | `error.message` |

Nút **Import** chỉ enable khi `canImport === true`. Khi có lỗi: *"Sửa file Excel và tải lên lại"*.

### UI gợi ý

| Thành phần | Mô tả |
|------------|-------|
| Nút **Tải mẫu Excel** | Trên toolbar bảng records của layer |
| Nút **Import Excel** | Mở dialog upload `.xlsx` |
| Bước Preview | Bảng **toàn bộ lỗi** (`errors`, badge = `errorCount`) + preview (`previewRows`, header = `columns`) |
| Kết quả | `{ created, duplicates, duplicateRows }` hoặc danh sách `errors` |

### Lưu ý FE

- Layer **phải publish schema** trước khi tải mẫu / import
- Chỉ chấp nhận file **tải từ hệ thống** (có sheet `_meta` đúng `layerId`)
- Schema thay đổi sau khi tải mẫu → báo user tải mẫu mới
- `lat_lng`, `image`, `file` có thể bỏ trống khi import; gán sau trên bản đồ / form chi tiết
- Cột danh mục: user nhập **label** (VD: `Kv Bình Lợi`) — sai label → lỗi `INVALID_CATEGORY` kèm gợi ý giá trị hợp lệ
- **Execute bị chặn** nếu còn bất kỳ lỗi validation — user phải sửa Excel và upload lại
- Bảng preview: header lấy từ `columns[]`, ô = `row.rawProperties[col.fieldCode]`; cột Lỗi hiển thị `error.message` (không render cả object)

## 10. Dashboard động (MVP)

Chi tiết API: [dashboards.md](./dashboards.md).

### Luồng builder

```typescript
// 1. Nguồn dữ liệu (layers + fields)
const sources = await fetch(`${API}/dashboards/data-sources`, { headers: h }).then(r => r.json());

// 2. Tạo dashboard
const { data: dashboard } = await fetch(`${API}/dashboards`, {
  method: 'POST', headers: h,
  body: JSON.stringify({ name: 'Tổng quan HTX', scope: 'private' }),
}).then(r => r.json());

// 3. Thêm widgets vào draft
await fetch(`${API}/dashboards/${dashboard.id}/draft`, {
  method: 'PATCH', headers: h,
  body: JSON.stringify({
    widgets: [
      {
        widgetType: 'stat',
        title: 'Tổng HTX',
        layoutConfig: { x: 0, y: 0, w: 3, h: 2 },
        dataSourceConfig: {
          layerId: sources.data[0].layerId,
          aggregation: 'count',
        },
      },
      {
        widgetType: 'bar',
        title: 'Theo ngành nghề',
        layoutConfig: { x: 3, y: 0, w: 6, h: 4 },
        dataSourceConfig: {
          layerId: sources.data[0].layerId,
          aggregation: 'count',
          groupByFieldCode: 'nganh_nghe',
        },
      },
    ],
  }),
});

// 4. Preview widget khi chỉnh config
const preview = await fetch(`${API}/analytics/preview`, {
  method: 'POST', headers: h,
  body: JSON.stringify({
    dataSourceConfig: {
      layerId: sources.data[0].layerId,
      aggregation: 'count',
      groupByFieldCode: 'nganh_nghe',
    },
  }),
}).then(r => r.json());
// preview.data.rows → render bar/pie

// 5. Publish
await fetch(`${API}/dashboards/${dashboard.id}/publish`, { method: 'POST', headers: h });

// 6. Viewer — load published + query từng widget
const published = await fetch(`${API}/dashboards/${dashboard.id}`, { headers: h }).then(r => r.json());
for (const widget of published.data.widgets) {
  if (widget.widgetType === 'map') {
    // GET /api/layers/:layerId/geojson
    continue;
  }
  const chartData = await fetch(`${API}/analytics/preview`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ dataSourceConfig: widget.dataSourceConfig }),
  }).then(r => r.json());
}
```

### Widget `dataSourceConfig`

| aggregation | fieldCode | groupByFieldCode | Widget gợi ý |
|-------------|-----------|------------------|--------------|
| `count` | — | — | `stat` |
| `sum` / `avg` | field số | — | `stat` |
| `count` / `sum` / `avg` | tùy aggregation | field category | `bar`, `pie`, `table` |

## 11. Prototype routes — không dùng

Các route cũ (`/api/cooperatives`, `/api/irrigation`, …) deprecated. Dùng `/api/layers/:layerId/...` thay thế.

## 12. Tham chiếu

- [api-conventions.md](../appendix/api-conventions.md)
- [field-types.md](../appendix/field-types.md)
