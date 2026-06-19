-- 010_saved_views.sql
-- Saved Views: reusable filtered/sorted projections between layers and widgets.

BEGIN;

CREATE TABLE saved_views (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    layer_id        UUID NOT NULL,
    view_type       VARCHAR(32) NOT NULL DEFAULT 'table',
    config          JSONB NOT NULL DEFAULT '{"filters":[],"sorts":[],"visibleFields":[],"limit":100}',
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_saved_views_id_tenant UNIQUE (id, tenant_id),
    CONSTRAINT fk_saved_views_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id),
    CONSTRAINT fk_saved_views_created_by_tenant
        FOREIGN KEY (created_by, tenant_id)
        REFERENCES users (id, tenant_id),
    CONSTRAINT chk_saved_views_type CHECK (view_type IN ('table')),
    CONSTRAINT chk_saved_views_config_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE INDEX idx_saved_views_tenant_layer
    ON saved_views (tenant_id, layer_id, name);

CREATE TRIGGER trg_saved_views_updated_at
    BEFORE UPDATE ON saved_views
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
