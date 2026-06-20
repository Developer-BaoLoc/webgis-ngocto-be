# Phase 0 — Foundation

**Thời gian ước tính:** 1–2 tuần (1–2 dev)  
**Phụ thuộc:** Không  
**Phase tiếp theo:** [phase-1-data-core.md](./phase-1-data-core.md)

## 1. Mục tiêu

Chốt kiến trúc, convention, database skeleton, tenant/organization — **chưa** triển khai feature nghiệp vụ đầy đủ.

## 2. Phạm vi

### Trong phạm vi

- PostgreSQL + PostGIS + Redis + MinIO (docker-compose)
- Migration framework (TypeORM hoặc Prisma — **chốt 1**)
- Bảng foundation: tenants, organizations, administrative_units, users, roles, permissions
- Auth JWT cơ bản
- Tenant Ngọc Tố seed
- Coding convention NestJS theo [architecture-v3.1.md](../architecture-v3.1.md)
- CI: lint, build, test
- Cập nhật `.env.example`

### Ngoài phạm vi

- Layer designer UI
- Feature CRUD generic
- Import Excel
- Dashboard
- Frontend admin

## 3. Deliverables

| # | Output | Mô tả |
|---|--------|--------|
| 1 | `docker-compose.yml` | postgis/postgis, redis, minio |
| 2 | Migration `001_foundation.sql` | Tenant, org, auth tables |
| 3 | Module skeleton | `tenants/`, `organizations/`, `auth/` |
| 4 | Seed Ngọc Tố | 1 tenant, org phường, cây admin units |
| 5 | ADR ORM | TypeORM vs Prisma quyết định |
| 6 | Deprecate plan | Ghi rõ lộ trình bỏ module prototype |

## 4. Task checklist

### Infrastructure

- [ ] `docker-compose.yml`: PostgreSQL PostGIS 16, Redis 7, MinIO
- [ ] Script init PostGIS: `CREATE EXTENSION postgis`
- [ ] `.env.example` đầy đủ (DB, Redis, MinIO, JWT)

### Database

- [ ] Bảng `tenants`
- [ ] Bảng `organizations`, `organization_units`
- [ ] Bảng `administrative_units` (cây hành chính + khu vực)
- [ ] Bảng `users`, `roles`, `permissions`, `organization_members`
- [ ] Seed tenant `ngoc-to`, xã Ngọc Tố, quận Mỹ Xuyên, Cần Thơ
- [ ] Seed admin user mặc định (dev only)

### Backend

- [ ] Module `tenants/`, `organizations/`, `auth/`
- [ ] JWT auth + guard
- [ ] Request context: inject `tenant_id`, `user_id`
- [ ] `ResourceScope` enum + helper
- [ ] Structured logging: `request_id` mỗi request
- [ ] Global prefix `/api`, CORS (giữ như hiện tại)

### Convention

- [ ] Cấu trúc thư mục `src/` theo architecture doc
- [ ] Quy ước naming: snake_case DB, camelCase TS
- [ ] Migration naming: `YYYYMMDDHHMMSS_description.sql`

## 5. API Phase 0

| Method | Path | Mô tả |
|--------|------|--------|
| GET | `/api` | Thông tin hệ thống |
| GET | `/api/health` | Health check |
| POST | `/api/auth/login` | Đăng nhập |
| GET | `/api/auth/me` | User hiện tại |
| GET | `/api/tenants/current` | Tenant context |

## 6. Seed administrative_units (khu vực)

Từ file Excel, seed các khu vực (level = `zone`):

- Bình Lợi, Bình Trung, Bình Hiếu, Bình Hòa, Bình Thuận
- Bình Thạnh B, Bình Thạnh C, Bình Tân
- An Hòa, Thạnh Hiếu

## 7. Roles mặc định

| Role | Quyền |
|------|--------|
| super_admin | Toàn hệ thống |
| admin_phuong | Quản trị phường |
| data_editor | Nhập/sửa dữ liệu |
| data_reviewer | Duyệt dữ liệu |
| viewer | Xem |

## 8. Definition of Done

- [ ] `docker compose up` → PostGIS + Redis + MinIO chạy
- [ ] Migration chạy thành công, PostGIS enabled
- [ ] `yarn build` + test pass
- [ ] Login API trả JWT, `/api/auth/me` hoạt động
- [ ] Tenant Ngọc Tố + khu vực seed trong DB
- [ ] Tài liệu Phase 1 được review/approve

## 9. Rủi ro

| Rủi ro | Giảm thiểu |
|--------|------------|
| Chốt ORM chậm | ADR trong tuần 1, spike 1 ngày |
| PostGIS local khó cài | Luôn dùng Docker |

## 10. Tham chiếu

- [data-model.md](../data-model.md) — nhóm Tenant & Organization
- [architecture-v3.1.md](../architecture-v3.1.md)
