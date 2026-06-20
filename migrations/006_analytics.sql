-- 006_analytics.sql
-- GIS Ngọc Tố v3.2 — Datasets, metrics, dashboards

BEGIN;

CREATE TYPE dashboard_scope AS ENUM (
    'private',
    'organization',
    'public'
);

CREATE TYPE dashboard_status AS ENUM (
    'draft',
    'published',
    'archived'
);

-- ---------------------------------------------------------------------------
-- Datasets
-- ---------------------------------------------------------------------------

CREATE TABLE datasets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    code                VARCHAR(64) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    source_layer_id     UUID NOT NULL,
    grain               JSONB NOT NULL DEFAULT '["feature_id"]',
    default_filters     JSONB NOT NULL DEFAULT '[]',
    access_policy       JSONB NOT NULL DEFAULT '{}',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_datasets_tenant_code UNIQUE (tenant_id, code),
    CONSTRAINT fk_datasets_source_layer_tenant
        FOREIGN KEY (source_layer_id, tenant_id)
        REFERENCES layers (id, tenant_id)
);

CREATE TRIGGER trg_datasets_updated_at
    BEFORE UPDATE ON datasets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Metrics & dimensions
-- ---------------------------------------------------------------------------

CREATE TABLE metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    dataset_id      UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    code            VARCHAR(64) NOT NULL,
    label           VARCHAR(255) NOT NULL,
    field_id        UUID REFERENCES fields(id) ON DELETE RESTRICT,
    aggregation     VARCHAR(32) NOT NULL,
    filter_config   JSONB NOT NULL DEFAULT '{}',
    format_config   JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_metrics_dataset_code UNIQUE (dataset_id, code)
);

CREATE TABLE dimensions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    dataset_id      UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    code            VARCHAR(64) NOT NULL,
    label           VARCHAR(255) NOT NULL,
    dimension_type  VARCHAR(32) NOT NULL DEFAULT 'field',
    field_id        UUID REFERENCES fields(id) ON DELETE RESTRICT,
    config          JSONB NOT NULL DEFAULT '{}',
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dimensions_dataset_code UNIQUE (dataset_id, code)
);

-- ---------------------------------------------------------------------------
-- Dashboards
-- ---------------------------------------------------------------------------

CREATE TABLE dashboards (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    owner_user_id           UUID,
    owner_organization_id   UUID,
    code                    VARCHAR(64),
    name                    VARCHAR(255) NOT NULL,
    description             TEXT,
    scope                   dashboard_scope NOT NULL DEFAULT 'private',
    status                  dashboard_status NOT NULL DEFAULT 'draft',
    current_revision_id     UUID,
    row_version             INT NOT NULL DEFAULT 1,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dashboards_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_dashboards_owner_user_tenant
        FOREIGN KEY (owner_user_id, tenant_id)
        REFERENCES users (id, tenant_id),
    CONSTRAINT fk_dashboards_owner_org_tenant
        FOREIGN KEY (owner_organization_id, tenant_id)
        REFERENCES organizations (id, tenant_id),
    CONSTRAINT chk_dashboards_scope_owner CHECK (
        (scope = 'private' AND owner_user_id IS NOT NULL)
        OR (scope = 'organization' AND owner_organization_id IS NOT NULL)
        OR (scope = 'public')
    )
);

CREATE UNIQUE INDEX uq_dashboards_tenant_code
    ON dashboards (tenant_id, code)
    WHERE code IS NOT NULL;

CREATE TRIGGER trg_dashboards_updated_at
    BEFORE UPDATE ON dashboards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE dashboard_revisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id    UUID NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    version         INT NOT NULL,
    layout_config   JSONB NOT NULL DEFAULT '{}',
    filter_config   JSONB NOT NULL DEFAULT '[]',
    published_at    TIMESTAMPTZ,
    published_by    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dashboard_revisions_id_dashboard UNIQUE (id, dashboard_id),
    CONSTRAINT uq_dashboard_revisions_version UNIQUE (dashboard_id, version),
    CONSTRAINT fk_dashboard_revisions_dashboard_tenant
        FOREIGN KEY (dashboard_id, tenant_id)
        REFERENCES dashboards (id, tenant_id),
    CONSTRAINT fk_dashboard_revisions_published_by_tenant
        FOREIGN KEY (published_by, tenant_id)
        REFERENCES users (id, tenant_id)
);

ALTER TABLE dashboards
    ADD CONSTRAINT fk_dashboards_current_revision
    FOREIGN KEY (current_revision_id, id)
    REFERENCES dashboard_revisions (id, dashboard_id);

CREATE TABLE dashboard_widgets (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_revision_id   UUID NOT NULL REFERENCES dashboard_revisions(id) ON DELETE CASCADE,
    widget_type             VARCHAR(64) NOT NULL,
    title                   VARCHAR(255),
    layout_config           JSONB NOT NULL,
    data_source_config      JSONB NOT NULL,
    display_config          JSONB NOT NULL DEFAULT '{}',
    interaction_config      JSONB NOT NULL DEFAULT '{}',
    sort_order              INT NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dashboard_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id    UUID NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    role_id         UUID,
    user_id         UUID,
    can_view        BOOLEAN NOT NULL DEFAULT TRUE,
    can_edit        BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_dashboard_permissions_dashboard_tenant
        FOREIGN KEY (dashboard_id, tenant_id)
        REFERENCES dashboards (id, tenant_id),
    CONSTRAINT fk_dashboard_permissions_role_tenant
        FOREIGN KEY (role_id, tenant_id)
        REFERENCES roles (id, tenant_id),
    CONSTRAINT fk_dashboard_permissions_user_tenant
        FOREIGN KEY (user_id, tenant_id)
        REFERENCES users (id, tenant_id)
);

-- ---------------------------------------------------------------------------
-- Query executions
-- ---------------------------------------------------------------------------

CREATE TABLE query_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    query_hash      VARCHAR(64) NOT NULL,
    query_type      VARCHAR(32) NOT NULL,
    payload         JSONB NOT NULL,
    duration_ms     INT,
    rows_returned   INT,
    cache_hit       BOOLEAN NOT NULL DEFAULT FALSE,
    error           TEXT,
    user_id         UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_query_executions_user_tenant
        FOREIGN KEY (user_id, tenant_id)
        REFERENCES users (id, tenant_id)
);

CREATE INDEX idx_query_executions_tenant ON query_executions (tenant_id, created_at DESC);

COMMIT;
