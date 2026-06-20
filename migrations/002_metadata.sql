-- 002_metadata.sql
-- GIS Ngọc Tố v3.2 — Layers, fields, schema versions

BEGIN;

CREATE TYPE geometry_kind AS ENUM (
    'none',
    'point',
    'multipoint',
    'linestring',
    'multilinestring',
    'polygon',
    'multipolygon'
);

CREATE TYPE render_mode AS ENUM (
    'geojson',
    'vector_tile',
    'raster',
    'external'
);

CREATE TYPE schema_status AS ENUM (
    'draft',
    'migrating',
    'published',
    'archived'
);

-- ---------------------------------------------------------------------------
-- Layers
-- ---------------------------------------------------------------------------

CREATE TABLE layers (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    owner_organization_id       UUID,
    code                        VARCHAR(64) NOT NULL,
    name                        VARCHAR(255) NOT NULL,
    description                 TEXT,
    geometry_kind               geometry_kind NOT NULL DEFAULT 'none',
    geometry_required           BOOLEAN NOT NULL DEFAULT FALSE,
    storage_srid                INT NOT NULL DEFAULT 4326 CHECK (storage_srid = 4326),
    render_mode                 render_mode NOT NULL DEFAULT 'geojson',
    style_config                JSONB NOT NULL DEFAULT '{}',
    workflow_config             JSONB NOT NULL DEFAULT '{}',
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order                  INT NOT NULL DEFAULT 0,
    current_schema_version_id   UUID,
    row_version                 INT NOT NULL DEFAULT 1,
    created_by                  UUID,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_layers_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT uq_layers_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT fk_layers_owner_org_tenant
        FOREIGN KEY (owner_organization_id, tenant_id)
        REFERENCES organizations (id, tenant_id),
    CONSTRAINT fk_layers_created_by_tenant
        FOREIGN KEY (created_by, tenant_id)
        REFERENCES users (id, tenant_id)
);

CREATE INDEX idx_layers_tenant ON layers (tenant_id);

CREATE TRIGGER trg_layers_updated_at
    BEFORE UPDATE ON layers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Fields (stable identity)
-- ---------------------------------------------------------------------------

CREATE TABLE fields (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id        UUID NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    storage_key     VARCHAR(128) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_fields_id_layer UNIQUE (id, layer_id),
    CONSTRAINT uq_fields_layer_storage_key UNIQUE (layer_id, storage_key),
    CONSTRAINT chk_fields_storage_key
        CHECK (storage_key ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT fk_fields_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id)
);

CREATE INDEX idx_fields_layer ON fields (layer_id);

-- ---------------------------------------------------------------------------
-- Schema versions
-- ---------------------------------------------------------------------------

CREATE TABLE layer_schema_versions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id        UUID NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    version         INT NOT NULL,
    status          schema_status NOT NULL DEFAULT 'draft',
    change_summary  TEXT,
    row_version     INT NOT NULL DEFAULT 1,
    published_at    TIMESTAMPTZ,
    published_by    UUID,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_schema_version_id_layer UNIQUE (id, layer_id),
    CONSTRAINT uq_schema_layer_version UNIQUE (layer_id, version),
    CONSTRAINT fk_schema_versions_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id),
    CONSTRAINT fk_schema_published_by_tenant
        FOREIGN KEY (published_by, tenant_id)
        REFERENCES users (id, tenant_id),
    CONSTRAINT fk_schema_created_by_tenant
        FOREIGN KEY (created_by, tenant_id)
        REFERENCES users (id, tenant_id)
);

CREATE INDEX idx_layer_schema_versions_layer ON layer_schema_versions (layer_id, status);

ALTER TABLE layers
    ADD CONSTRAINT fk_layers_current_schema
    FOREIGN KEY (current_schema_version_id, id)
    REFERENCES layer_schema_versions (id, layer_id);

-- ---------------------------------------------------------------------------
-- Schema field versions
-- ---------------------------------------------------------------------------

CREATE TABLE schema_field_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_version_id   UUID NOT NULL,
    field_id            UUID NOT NULL,
    layer_id            UUID NOT NULL,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code                VARCHAR(128) NOT NULL,
    label               VARCHAR(255) NOT NULL,
    field_type          VARCHAR(64) NOT NULL,
    data_schema         JSONB NOT NULL DEFAULT '{}',
    ui_schema           JSONB NOT NULL DEFAULT '{}',
    display_schema      JSONB NOT NULL DEFAULT '{}',
    sort_order          INT NOT NULL DEFAULT 0,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_schema_field_version_field UNIQUE (schema_version_id, field_id),
    CONSTRAINT uq_schema_field_version_code UNIQUE (schema_version_id, code),
    CONSTRAINT fk_schema_field_field_layer
        FOREIGN KEY (field_id, layer_id)
        REFERENCES fields (id, layer_id),
    CONSTRAINT fk_schema_field_schema_layer
        FOREIGN KEY (schema_version_id, layer_id)
        REFERENCES layer_schema_versions (id, layer_id),
    CONSTRAINT fk_schema_field_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id)
);

CREATE INDEX idx_schema_field_versions_schema ON schema_field_versions (schema_version_id);

-- ---------------------------------------------------------------------------
-- Layer views & map styles (optional config)
-- ---------------------------------------------------------------------------

CREATE TABLE layer_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id        UUID NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    view_config     JSONB NOT NULL DEFAULT '{}',
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_layer_views_layer_code UNIQUE (layer_id, code),
    CONSTRAINT fk_layer_views_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id)
);

CREATE TABLE layer_map_styles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    layer_id        UUID NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name            VARCHAR(255) NOT NULL,
    style_config    JSONB NOT NULL DEFAULT '{}',
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_layer_map_styles_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id)
);

-- role_assignments.layer_id FK (deferred until layers exist)
ALTER TABLE role_assignments
    ADD CONSTRAINT fk_role_assignments_layer_tenant
    FOREIGN KEY (layer_id, tenant_id)
    REFERENCES layers (id, tenant_id);

COMMIT;
