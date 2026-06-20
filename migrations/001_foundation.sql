-- 001_foundation.sql
-- GIS Ngọc Tố v3.2 — Tenant, organization, auth

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(64) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    settings        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    parent_id       UUID,
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_organizations_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_organizations_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX idx_organizations_tenant ON organizations (tenant_id);
CREATE INDEX idx_organizations_parent ON organizations (parent_id);

ALTER TABLE organizations
    ADD CONSTRAINT fk_organizations_parent_tenant
    FOREIGN KEY (parent_id, tenant_id)
    REFERENCES organizations (id, tenant_id);

CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Organization units
-- ---------------------------------------------------------------------------

CREATE TABLE organization_units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    parent_id       UUID,
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_organization_units_id_org UNIQUE (id, organization_id),
    CONSTRAINT uq_organization_units_org_code UNIQUE (organization_id, code)
);

CREATE INDEX idx_organization_units_org ON organization_units (organization_id);
CREATE INDEX idx_organization_units_tenant ON organization_units (tenant_id);

ALTER TABLE organization_units
    ADD CONSTRAINT fk_organization_units_parent
    FOREIGN KEY (parent_id, organization_id)
    REFERENCES organization_units (id, organization_id);

CREATE TRIGGER trg_organization_units_updated_at
    BEFORE UPDATE ON organization_units
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Administrative units
-- ---------------------------------------------------------------------------

CREATE TYPE admin_unit_level AS ENUM (
    'province',
    'district',
    'ward',
    'zone'
);

CREATE TABLE administrative_units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    parent_id       UUID,
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    level           admin_unit_level NOT NULL,
    path            VARCHAR(512),
    geometry        GEOMETRY(MultiPolygon, 4326),
    metadata        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_admin_units_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_admin_units_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX idx_admin_units_tenant_level ON administrative_units (tenant_id, level);
CREATE INDEX idx_admin_units_geometry ON administrative_units USING GIST (geometry);

ALTER TABLE administrative_units
    ADD CONSTRAINT fk_admin_units_parent_tenant
    FOREIGN KEY (parent_id, tenant_id)
    REFERENCES administrative_units (id, tenant_id);

CREATE TRIGGER trg_administrative_units_updated_at
    BEFORE UPDATE ON administrative_units
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Users & auth
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_users_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_users_tenant_email UNIQUE (tenant_id, email)
);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_roles_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_roles_tenant_code UNIQUE (tenant_id, code)
);

CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(128) NOT NULL UNIQUE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT
);

CREATE TABLE role_permissions (
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE organization_members (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    organization_id     UUID NOT NULL,
    organization_unit_id UUID,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_org_members_org_tenant
        FOREIGN KEY (organization_id, tenant_id)
        REFERENCES organizations (id, tenant_id),
    CONSTRAINT fk_org_members_user_tenant
        FOREIGN KEY (user_id, tenant_id)
        REFERENCES users (id, tenant_id),
    CONSTRAINT uq_org_members_user_org_unit
        UNIQUE NULLS NOT DISTINCT (user_id, organization_id, organization_unit_id)
);

CREATE INDEX idx_organization_members_user ON organization_members (user_id);

CREATE TYPE role_scope_type AS ENUM (
    'tenant',
    'organization',
    'organization_unit',
    'administrative_unit',
    'layer'
);

CREATE TABLE role_assignments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    role_id                 UUID NOT NULL,
    scope_type              role_scope_type NOT NULL DEFAULT 'tenant',
    organization_id         UUID,
    organization_unit_id    UUID,
    administrative_unit_id  UUID,
    layer_id                UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_role_assignments_user_tenant
        FOREIGN KEY (user_id, tenant_id)
        REFERENCES users (id, tenant_id),
    CONSTRAINT fk_role_assignments_role_tenant
        FOREIGN KEY (role_id, tenant_id)
        REFERENCES roles (id, tenant_id),
    CONSTRAINT fk_role_assignments_org_tenant
        FOREIGN KEY (organization_id, tenant_id)
        REFERENCES organizations (id, tenant_id),
    CONSTRAINT fk_role_assignments_admin_tenant
        FOREIGN KEY (administrative_unit_id, tenant_id)
        REFERENCES administrative_units (id, tenant_id)
);

CREATE INDEX idx_role_assignments_user ON role_assignments (user_id, tenant_id);

COMMIT;
