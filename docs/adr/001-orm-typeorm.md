# ADR 001 — ORM: TypeORM

**Trạng thái:** Chấp nhận  
**Ngày:** 2026-06-13

## Bối cảnh

Phase 0 cần kết nối PostgreSQL + PostGIS từ NestJS. Schema đã định nghĩa bằng SQL migrations v3.2 (không generate schema từ ORM).

## Quyết định

Dùng **TypeORM** với `@nestjs/typeorm`.

## Lý do

| Tiêu chí | TypeORM | Prisma |
|----------|---------|--------|
| NestJS integration | Native module | Client riêng |
| PostGIS / raw geometry | Raw query + entity column dễ | Cần extension / raw SQL |
| SQL migrations sẵn có | `synchronize: false`, map entity | Prisma migrate trùng lặp |
| Team GIS | Query builder + repository pattern | Tốt cho CRUD thuần |

## Quy ước

- `synchronize: false` — chỉ SQL migrations trong `migrations/`
- Entity map bảng hiện có; snake_case DB → `@Column({ name: '...' })`
- Geometry Phase 1+: raw query hoặc column type `geometry` với transformer
- Không dùng TypeORM migrations song song SQL — SQL là source of truth

## Hệ quả

- Cài `@nestjs/typeorm`, `typeorm`, `pg`
- Entity trong `src/database/entities/`
