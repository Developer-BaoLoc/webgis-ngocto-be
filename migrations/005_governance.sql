-- 005_governance.sql
-- GIS Long Bình v3.2 — Revisions, dependencies, permissions

BEGIN;

-- ---------------------------------------------------------------------------
-- Feature revisions
-- ---------------------------------------------------------------------------

CREATE TABLE feature_revisions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_id          UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    schema_version_id   UUID NOT NULL,
    layer_id            UUID NOT NULL,
    revision_number     INT NOT NULL,
    geometry            GEOMETRY(Geometry, 4326),
    geometry_area_m2    NUMERIC,
    properties          JSONB NOT NULL,
    status              feature_status NOT NULL,
    location_status     location_status NOT NULL,
    geometry_source     geometry_source,
    change_summary      TEXT,
    action              VARCHAR(32) NOT NULL,
    changed_by          UUID,
    changed_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feature_revisions_number UNIQUE (feature_id, revision_number),
    CONSTRAINT fk_feature_revisions_feature_tenant
        FOREIGN KEY (feature_id, tenant_id)
        REFERENCES features (id, tenant_id),
    CONSTRAINT fk_feature_revisions_schema_layer
        FOREIGN KEY (schema_version_id, layer_id)
        REFERENCES layer_schema_versions (id, layer_id)
);

CREATE INDEX idx_feature_revisions_feature ON feature_revisions (feature_id, revision_number DESC);

-- ---------------------------------------------------------------------------
-- Field dependencies (dashboard, metric, form rules)
-- ---------------------------------------------------------------------------

CREATE TABLE field_dependencies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    field_id            UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    dependency_type     VARCHAR(64) NOT NULL,
    dependency_id       UUID NOT NULL,
    metadata            JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_field_dependencies_field ON field_dependencies (field_id);
CREATE UNIQUE INDEX uq_field_dependencies_unique
    ON field_dependencies (field_id, dependency_type, dependency_id);

-- ---------------------------------------------------------------------------
-- Layer & field permissions (Phase 3)
-- ---------------------------------------------------------------------------

CREATE TABLE layer_permissions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    layer_id            UUID NOT NULL,
    role_id             UUID NOT NULL,
    can_view            BOOLEAN NOT NULL DEFAULT TRUE,
    can_create          BOOLEAN NOT NULL DEFAULT FALSE,
    can_update          BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete          BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve         BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_layer_permissions_role_layer UNIQUE (layer_id, role_id),
    CONSTRAINT fk_layer_permissions_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id),
    CONSTRAINT fk_layer_permissions_role_tenant
        FOREIGN KEY (role_id, tenant_id)
        REFERENCES roles (id, tenant_id)
);

CREATE TABLE field_permissions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    field_id            UUID NOT NULL REFERENCES fields(id) ON DELETE CASCADE,
    role_id             UUID NOT NULL,
    can_view            BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit            BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_field_permissions_role_field UNIQUE (field_id, role_id),
    CONSTRAINT fk_field_permissions_role_tenant
        FOREIGN KEY (role_id, tenant_id)
        REFERENCES roles (id, tenant_id)
);

-- ---------------------------------------------------------------------------
-- Schema migration jobs
-- ---------------------------------------------------------------------------

CREATE TABLE schema_migration_jobs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_execution_id        UUID NOT NULL REFERENCES job_executions(id) ON DELETE CASCADE,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    layer_id                UUID NOT NULL,
    from_schema_version_id  UUID NOT NULL,
    to_schema_version_id    UUID NOT NULL,
    stats                   JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT fk_schema_migration_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id),
    CONSTRAINT fk_schema_migration_from
        FOREIGN KEY (from_schema_version_id, layer_id)
        REFERENCES layer_schema_versions (id, layer_id),
    CONSTRAINT fk_schema_migration_to
        FOREIGN KEY (to_schema_version_id, layer_id)
        REFERENCES layer_schema_versions (id, layer_id)
);

COMMIT;
