-- 003_records.sql
-- GIS Ngọc Tố v3.2 — Features, relations, dictionaries, attachments

BEGIN;

CREATE TYPE feature_status AS ENUM (
    'draft',
    'submitted',
    'approved',
    'rejected',
    'published',
    'archived'
);

CREATE TYPE location_status AS ENUM (
    'unlocated',
    'located',
    'needs_review',
    'verified'
);

CREATE TYPE geometry_source AS ENUM (
    'drawn',
    'imported',
    'geocoded',
    'linked',
    'generated'
);

CREATE TYPE relation_cardinality AS ENUM (
    'one_to_one',
    'one_to_many',
    'many_to_many'
);

CREATE TYPE delete_behavior AS ENUM (
    'restrict',
    'unlink',
    'cascade'
);

-- ---------------------------------------------------------------------------
-- Features
-- ---------------------------------------------------------------------------

CREATE TABLE features (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    layer_id                UUID NOT NULL,
    schema_version_id       UUID NOT NULL,
    owner_organization_id   UUID,
    administrative_unit_id  UUID,
    geometry                GEOMETRY(Geometry, 4326),
    geometry_area_m2        NUMERIC,
    properties              JSONB NOT NULL DEFAULT '{}',
    status                  feature_status NOT NULL DEFAULT 'draft',
    location_status         location_status NOT NULL DEFAULT 'unlocated',
    geometry_source         geometry_source,
    search_text             TSVECTOR,
    row_version             INT NOT NULL DEFAULT 1,
    created_by              UUID,
    updated_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    deleted_by              UUID,
    CONSTRAINT fk_features_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id),
    CONSTRAINT fk_features_schema_layer
        FOREIGN KEY (schema_version_id, layer_id)
        REFERENCES layer_schema_versions (id, layer_id),
    CONSTRAINT fk_features_org_tenant
        FOREIGN KEY (owner_organization_id, tenant_id)
        REFERENCES organizations (id, tenant_id),
    CONSTRAINT fk_features_admin_tenant
        FOREIGN KEY (administrative_unit_id, tenant_id)
        REFERENCES administrative_units (id, tenant_id),
    CONSTRAINT fk_features_created_by_tenant
        FOREIGN KEY (created_by, tenant_id)
        REFERENCES users (id, tenant_id),
    CONSTRAINT fk_features_updated_by_tenant
        FOREIGN KEY (updated_by, tenant_id)
        REFERENCES users (id, tenant_id),
    CONSTRAINT fk_features_deleted_by_tenant
        FOREIGN KEY (deleted_by, tenant_id)
        REFERENCES users (id, tenant_id)
);

CREATE INDEX idx_features_geometry ON features USING GIST (geometry) WHERE deleted_at IS NULL;
CREATE INDEX idx_features_tenant_layer ON features (tenant_id, layer_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_features_layer_status ON features (layer_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_features_admin_unit ON features (administrative_unit_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_features_created ON features (layer_id, created_at DESC);

CREATE TRIGGER trg_features_updated_at
    BEFORE UPDATE ON features
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE features
    ADD CONSTRAINT uq_features_id_tenant UNIQUE (id, tenant_id);

-- ---------------------------------------------------------------------------
-- Feature ↔ administrative units (N-N, e.g. trạm phục vụ nhiều khu)
-- ---------------------------------------------------------------------------

CREATE TABLE feature_administrative_units (
    feature_id              UUID NOT NULL REFERENCES features(id) ON DELETE CASCADE,
    administrative_unit_id  UUID NOT NULL,
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    relation_role           VARCHAR(64) NOT NULL DEFAULT 'service_area',
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (feature_id, administrative_unit_id, relation_role),
    CONSTRAINT fk_feature_admin_units_admin_tenant
        FOREIGN KEY (administrative_unit_id, tenant_id)
        REFERENCES administrative_units (id, tenant_id),
    CONSTRAINT fk_feature_admin_units_feature_tenant
        FOREIGN KEY (feature_id, tenant_id)
        REFERENCES features (id, tenant_id)
);

-- ---------------------------------------------------------------------------
-- Relation definitions
-- ---------------------------------------------------------------------------

CREATE TABLE relation_definitions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code                VARCHAR(64) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    source_layer_id     UUID NOT NULL,
    target_layer_id     UUID NOT NULL,
    relation_type       VARCHAR(64) NOT NULL,
    cardinality         relation_cardinality NOT NULL,
    delete_behavior     delete_behavior NOT NULL DEFAULT 'restrict',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    config              JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_relation_definitions_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT fk_relation_def_source_layer_tenant
        FOREIGN KEY (source_layer_id, tenant_id)
        REFERENCES layers (id, tenant_id),
    CONSTRAINT fk_relation_def_target_layer_tenant
        FOREIGN KEY (target_layer_id, tenant_id)
        REFERENCES layers (id, tenant_id)
);

-- ---------------------------------------------------------------------------
-- Feature relations
-- ---------------------------------------------------------------------------

CREATE TABLE feature_relations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    relation_definition_id  UUID NOT NULL REFERENCES relation_definitions(id) ON DELETE RESTRICT,
    source_feature_id       UUID NOT NULL,
    target_feature_id       UUID NOT NULL,
    metadata                JSONB NOT NULL DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_feature_relations_pair
        UNIQUE (relation_definition_id, source_feature_id, target_feature_id),
    CONSTRAINT fk_feature_relations_source_tenant
        FOREIGN KEY (source_feature_id, tenant_id)
        REFERENCES features (id, tenant_id),
    CONSTRAINT fk_feature_relations_target_tenant
        FOREIGN KEY (target_feature_id, tenant_id)
        REFERENCES features (id, tenant_id),
    CONSTRAINT chk_feature_relations_not_self
        CHECK (source_feature_id <> target_feature_id)
);

CREATE INDEX idx_feature_relations_source ON feature_relations (source_feature_id);
CREATE INDEX idx_feature_relations_target ON feature_relations (target_feature_id);

-- ---------------------------------------------------------------------------
-- Dictionaries
-- ---------------------------------------------------------------------------

CREATE TABLE dictionaries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE RESTRICT,
    code            VARCHAR(64) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    is_hierarchical BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_dictionaries_system_code
    ON dictionaries (code)
    WHERE tenant_id IS NULL;

CREATE UNIQUE INDEX uq_dictionaries_tenant_code
    ON dictionaries (tenant_id, code)
    WHERE tenant_id IS NOT NULL;

CREATE TABLE dictionary_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dictionary_id   UUID NOT NULL REFERENCES dictionaries(id) ON DELETE CASCADE,
    parent_id       UUID,
    code            VARCHAR(128) NOT NULL,
    label           VARCHAR(255) NOT NULL,
    path            VARCHAR(512),
    level           INT NOT NULL DEFAULT 0,
    sort_order      INT NOT NULL DEFAULT 0,
    metadata        JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_dictionary_items_id_dictionary UNIQUE (id, dictionary_id),
    CONSTRAINT uq_dictionary_items_dict_code UNIQUE (dictionary_id, code)
);

CREATE INDEX idx_dictionary_items_parent ON dictionary_items (dictionary_id, parent_id);

ALTER TABLE dictionary_items
    ADD CONSTRAINT fk_dictionary_items_parent
    FOREIGN KEY (parent_id, dictionary_id)
    REFERENCES dictionary_items (id, dictionary_id);

-- ---------------------------------------------------------------------------
-- Attachments
-- ---------------------------------------------------------------------------

CREATE TABLE attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    storage_key     VARCHAR(512) NOT NULL,
    original_name   VARCHAR(512) NOT NULL,
    mime_type       VARCHAR(128) NOT NULL,
    size_bytes      BIGINT NOT NULL,
    checksum        VARCHAR(128),
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_attachments_created_by_tenant
        FOREIGN KEY (created_by, tenant_id)
        REFERENCES users (id, tenant_id)
);

CREATE TABLE feature_attachments (
    feature_id      UUID NOT NULL,
    attachment_id   UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    field_id        UUID,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (feature_id, attachment_id),
    CONSTRAINT fk_feature_attachments_feature_tenant
        FOREIGN KEY (feature_id, tenant_id)
        REFERENCES features (id, tenant_id),
    CONSTRAINT fk_feature_attachments_field_layer
        FOREIGN KEY (field_id)
        REFERENCES fields (id)
);

CREATE INDEX idx_feature_attachments_feature ON feature_attachments (feature_id);

COMMIT;
