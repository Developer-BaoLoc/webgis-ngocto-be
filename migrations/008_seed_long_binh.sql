-- 008_seed_long_binh.sql
-- Dev seed — Phường Long Bình, Cần Thơ

BEGIN;

-- Tenant
INSERT INTO tenants (id, code, name, settings)
VALUES (
    'a0000000-0000-4000-8000-000000000001',
    'long-binh',
    'Phường Long Bình',
    '{"ward":"Long Bình","district":"Cái Răng","province":"Cần Thơ"}'
);

-- Organization
INSERT INTO organizations (id, tenant_id, code, name)
VALUES (
    'b0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'ubnd-long-binh',
    'UBND Phường Long Bình'
);

-- Administrative tree
INSERT INTO administrative_units (id, tenant_id, parent_id, code, name, level, path) VALUES
    ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', NULL, 'can-tho', 'Thành phố Cần Thơ', 'province', '/can-tho'),
    ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'cai-rang', 'Quận Cái Răng', 'district', '/can-tho/cai-rang'),
    ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'long-binh', 'Phường Long Bình', 'ward', '/can-tho/cai-rang/long-binh');

INSERT INTO administrative_units (id, tenant_id, parent_id, code, name, level, path) VALUES
    ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'binh-loi', 'Khu vực Bình Lợi', 'zone', '/can-tho/cai-rang/long-binh/binh-loi'),
    ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'binh-trung', 'Khu vực Bình Trung', 'zone', '/can-tho/cai-rang/long-binh/binh-trung'),
    ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'binh-hieu', 'Khu vực Bình Hiếu', 'zone', '/can-tho/cai-rang/long-binh/binh-hieu'),
    ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'binh-hoa', 'Khu vực Bình Hòa', 'zone', '/can-tho/cai-rang/long-binh/binh-hoa'),
    ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'binh-thuan', 'Khu vực Bình Thuận', 'zone', '/can-tho/cai-rang/long-binh/binh-thuan'),
    ('d0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'binh-thanh-b', 'Khu vực Bình Thạnh B', 'zone', '/can-tho/cai-rang/long-binh/binh-thanh-b'),
    ('d0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'binh-thanh-c', 'Khu vực Bình Thạnh C', 'zone', '/can-tho/cai-rang/long-binh/binh-thanh-c'),
    ('d0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'binh-tan', 'Khu vực Bình Tân', 'zone', '/can-tho/cai-rang/long-binh/binh-tan'),
    ('d0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'an-hoa', 'Khu vực An Hòa', 'zone', '/can-tho/cai-rang/long-binh/an-hoa'),
    ('d0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'thanh-hieu', 'Khu vực Thạnh Hiếu', 'zone', '/can-tho/cai-rang/long-binh/thanh-hieu');

-- Permissions
INSERT INTO permissions (code, name) VALUES
    ('layer.create', 'Tạo lớp dữ liệu'),
    ('layer.update', 'Cập nhật lớp dữ liệu'),
    ('schema.publish', 'Publish schema'),
    ('feature.create', 'Tạo bản ghi'),
    ('feature.update', 'Cập nhật bản ghi'),
    ('feature.approve', 'Duyệt bản ghi'),
    ('feature.delete', 'Xóa bản ghi'),
    ('dashboard.create', 'Tạo dashboard'),
    ('dashboard.publish', 'Publish dashboard'),
    ('import.execute', 'Thực thi import');

-- Roles
INSERT INTO roles (id, tenant_id, code, name) VALUES
    ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'super_admin', 'Super Admin'),
    ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'admin_phuong', 'Admin phường'),
    ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'data_editor', 'Nhập liệu'),
    ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'viewer', 'Xem');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'e0000000-0000-4000-8000-000000000001', id FROM permissions;

-- Admin user — password: Admin@123 (dev only)
INSERT INTO users (id, tenant_id, email, password_hash, full_name)
VALUES (
    'f0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'admin@longbinh.local',
    crypt('Admin@123', gen_salt('bf')),
    'Quản trị viên Long Bình'
);

INSERT INTO organization_members (user_id, tenant_id, organization_id, is_primary)
VALUES (
    'f0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    TRUE
);

INSERT INTO role_assignments (user_id, tenant_id, role_id, scope_type)
VALUES (
    'f0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'e0000000-0000-4000-8000-000000000001',
    'tenant'
);

COMMIT;
