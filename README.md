# GIS Long Bình — Backend API

Hệ thống GIS metadata-driven cho **phường/xã** — NestJS + PostgreSQL/PostGIS + Redis + MinIO.

Một codebase có thể phục vụ nhiều phường: chỉ cần đổi biến môi trường và database riêng, không cần copy GeoJSON ranh giới theo từng phường (file `can-tho.geojson` chứa 103 phường/xã Cần Thơ).

**Tài liệu chi tiết**

| Tài liệu | Mô tả |
|----------|--------|
| [docs/PROJECT.md](./docs/PROJECT.md) | Tổng quan, khái niệm, luồng frontend |
| [docs/modules/](./docs/modules/) | API từng module |
| [docs/phases/phase-0-foundation.md](./docs/phases/phase-0-foundation.md) | Phase 0 — Foundation |
| [data/ward-boundaries/README.md](./data/ward-boundaries/README.md) | Cấu hình ranh giới phường |

---

## Yêu cầu

- Node.js 20+
- Yarn
- Docker & Docker Compose (PostgreSQL/PostGIS, Redis, MinIO)
- `psql` (client PostgreSQL) — dùng cho migration

---

## Setup local (lần đầu)

### 1. Clone và cài dependency

```bash
git clone <repo-url> gis_longbinh
cd gis_longbinh
yarn install
```

### 2. Cấu hình môi trường

```bash
cp .env.example .env
```

Chỉnh `.env` theo phường triển khai. Mặc định repo này trỏ **Phường Long Bình, Cần Thơ**:

```env
WARD_NAME=Long Bình
WARD_CODE=long-binh
WARD_BOUNDARY_DATASET=can-tho.geojson
WARD_BOUNDARY_ADMIN_CODE=31473
```

Xem đầy đủ biến trong [.env.example](./.env.example).

### 3. Khởi động hạ tầng

```bash
yarn db:up
```

Services:

| Service | Port | Ghi chú |
|---------|------|---------|
| PostgreSQL + PostGIS | 5434 | DB `gis_longbinh` |
| Redis | 6379 | BullMQ queue |
| MinIO | 9000 (API), 9001 (console) | Object storage |

Đợi Postgres sẵn sàng (~10s), rồi chạy migration:

```bash
yarn db:migrate
```

### 4. Seed dữ liệu dev (Long Bình)

Chỉ dùng khi setup **Phường Long Bình** — tạo tenant, user admin, lớp dữ liệu mẫu:

```bash
yarn db:seed
```

Tài khoản dev (sau seed):

- Email: `admin@longbinh.local`
- Password: `Admin@123`

> **Phường khác:** không chạy `db:seed`. Tạo tenant/user/lớp qua API hoặc SQL riêng; cập nhật `DEFAULT_TENANT_ID` trong `.env`.

### 5. Chạy API

```bash
# development (watch)
yarn start:dev

# production build
yarn build && yarn start:prod
```

API prefix: `/api` — mặc định `http://localhost:4000/api`.

Kiểm tra nhanh:

```bash
curl -s http://localhost:4000/api/metadata/map-view | jq
curl -s http://localhost:4000/api/layers/administrative-boundary | jq '.type'
```

---

## Triển khai phường/xã khác

1. **Database riêng** — đổi `DATABASE_NAME`, `DATABASE_URL` (và tên bucket MinIO nếu cần).
2. **Cập nhật `.env`** — ví dụ phường An Khánh:

```env
DATABASE_NAME=gis_an_khanh
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/gis_an_khanh
MINIO_BUCKET=gis-an-khanh

WARD_NAME=An Khánh
WARD_CODE=an-khanh
WARD_DISTRICT=Ninh Kiều
WARD_PROVINCE=Cần Thơ
WARD_BOUNDARY_DATASET=can-tho.geojson
WARD_BOUNDARY_ADMIN_CODE=<ma_xa trong GeoJSON>
DEFAULT_TENANT_ID=<uuid tenant mới>
```

3. **GeoJSON** — đặt file tỉnh vào `data/ward-boundaries/` (vd. `can-tho.geojson`). Tra `ma_xa` / `ten_xa` trong properties của feature.
4. **Migration** — `yarn db:migrate` (không seed Long Bình).
5. **Restart API** — BE tự tính `center`, `bounds` từ geometry ranh giới.

Chi tiết: [data/ward-boundaries/README.md](./data/ward-boundaries/README.md).

---

## Deploy lên server

### Chuẩn bị server

- Ubuntu 22.04+ (hoặc tương đương)
- Docker Compose cho Postgres/Redis/MinIO **hoặc** dịch vụ managed riêng
- Reverse proxy (Nginx/Caddy) + HTTPS
- Process manager: **systemd** hoặc **PM2**

### 1. Clone và build

```bash
git clone <repo-url> /opt/gis_longbinh
cd /opt/gis_longbinh
yarn install --frozen-lockfile
yarn build
```

### 2. File `.env` production

```bash
cp .env.example .env
nano .env
```

Bắt buộc đổi trên production:

```env
NODE_ENV=production
PORT=4000

JWT_SECRET=<chuỗi-ngẫu-nhiên-dài>
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>
REDIS_HOST=<redis-host>
MINIO_ENDPOINT=<minio-host>
MINIO_ACCESS_KEY=<key>
MINIO_SECRET_KEY=<secret>
MINIO_BUCKET=<bucket-theo-phuong>

# Phường triển khai
WARD_NAME=...
WARD_BOUNDARY_DATASET=can-tho.geojson
WARD_BOUNDARY_ADMIN_CODE=...
DEFAULT_TENANT_ID=...
```

Không commit `.env` lên git.

### 3. Database

Trên server có Postgres + PostGIS:

```bash
# Tạo DB (một lần)
psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;"
yarn db:migrate
# Chỉ seed Long Bình nếu đúng tenant đó:
# yarn db:seed
```

Nếu dùng Docker trên cùng máy:

```bash
docker compose up -d
sleep 10
yarn db:migrate
```

### 4. Chạy bằng systemd

`/etc/systemd/system/gis-api.service`:

```ini
[Unit]
Description=GIS Backend API
After=network.target docker.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/gis_longbinh
EnvironmentFile=/opt/gis_longbinh/.env
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gis-api
sudo systemctl status gis-api
```

### 5. Nginx reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name gis.example.com;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50M;
    }
}
```

Frontend (repo riêng) trỏ `VITE_API_URL` (hoặc tương đương) tới `https://gis.example.com/api`.

### 6. Cập nhật phiên bản

```bash
cd /opt/gis_longbinh
git pull
yarn install --frozen-lockfile
yarn build
yarn db:migrate
sudo systemctl restart gis-api
```

---

## Scripts hữu ích

| Lệnh | Mô tả |
|------|--------|
| `yarn db:up` | Docker: Postgres, Redis, MinIO |
| `yarn db:migrate` | Chạy migration SQL |
| `yarn db:seed` | Seed Long Bình (dev) |
| `yarn db:reset` | Xóa volume Docker + migrate lại |
| `yarn start:dev` | API watch mode |
| `yarn build` | Build production → `dist/` |
| `yarn test` | Unit tests |

---

## Cấu trúc thư mục chính

```
src/                    # NestJS source
migrations/             # SQL schema + seed
data/ward-boundaries/   # GeoJSON ranh giới (theo tỉnh)
docs/                   # Tài liệu dự án
docker-compose.yml      # Dev infrastructure
```

---

## License

UNLICENSED — private project.
