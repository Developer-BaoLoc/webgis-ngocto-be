-- 004_import_audit_outbox.sql
-- GIS Ngọc Tố v3.2 — Import, jobs, audit, outbox

BEGIN;

-- ---------------------------------------------------------------------------
-- Import templates
-- ---------------------------------------------------------------------------

CREATE TABLE import_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    name                VARCHAR(255) NOT NULL,
    root_layer_id       UUID,
    config              JSONB NOT NULL DEFAULT '{}',
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_import_templates_root_layer_tenant
        FOREIGN KEY (root_layer_id, tenant_id)
        REFERENCES layers (id, tenant_id),
    CONSTRAINT fk_import_templates_created_by_tenant
        FOREIGN KEY (created_by, tenant_id)
        REFERENCES users (id, tenant_id)
);

CREATE TRIGGER trg_import_templates_updated_at
    BEFORE UPDATE ON import_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE import_template_targets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES import_templates(id) ON DELETE CASCADE,
    layer_id        UUID NOT NULL,
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    alias           VARCHAR(64) NOT NULL,
    processing_order INT NOT NULL DEFAULT 0,
    config          JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT uq_import_template_targets_alias UNIQUE (template_id, alias),
    CONSTRAINT fk_import_template_targets_layer_tenant
        FOREIGN KEY (layer_id, tenant_id)
        REFERENCES layers (id, tenant_id)
);

-- ---------------------------------------------------------------------------
-- Job executions
-- ---------------------------------------------------------------------------

CREATE TABLE job_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    job_type        VARCHAR(64) NOT NULL,
    status          VARCHAR(32) NOT NULL DEFAULT 'pending',
    progress        JSONB NOT NULL DEFAULT '{}',
    payload         JSONB NOT NULL DEFAULT '{}',
    result          JSONB,
    error           TEXT,
    created_by      UUID,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_job_executions_created_by_tenant
        FOREIGN KEY (created_by, tenant_id)
        REFERENCES users (id, tenant_id)
);

CREATE INDEX idx_job_executions_tenant_status ON job_executions (tenant_id, status, created_at DESC);

CREATE TABLE import_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_execution_id    UUID NOT NULL REFERENCES job_executions(id) ON DELETE CASCADE,
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    import_template_id  UUID REFERENCES import_templates(id) ON DELETE SET NULL,
    file_storage_key    VARCHAR(512) NOT NULL,
    sheet_name          VARCHAR(128),
    stats               JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE import_job_errors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id   UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    sheet_name      VARCHAR(128),
    row_number      INT,
    column_name     VARCHAR(128),
    error_code      VARCHAR(64) NOT NULL,
    source_value    TEXT,
    message         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_job_errors_job ON import_job_errors (import_job_id);

-- ---------------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    entity_type     VARCHAR(64) NOT NULL,
    entity_id       UUID NOT NULL,
    action          VARCHAR(32) NOT NULL,
    old_value       JSONB,
    new_value       JSONB,
    actor_id        UUID,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_audit_logs_actor_tenant
        FOREIGN KEY (actor_id, tenant_id)
        REFERENCES users (id, tenant_id)
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_tenant ON audit_logs (tenant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Outbox events
-- ---------------------------------------------------------------------------

CREATE TABLE outbox_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    aggregate_type      VARCHAR(64) NOT NULL,
    aggregate_id        UUID NOT NULL,
    event_type          VARCHAR(128) NOT NULL,
    payload             JSONB NOT NULL,
    status              VARCHAR(32) NOT NULL DEFAULT 'pending',
    retry_count         INT NOT NULL DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,
    locked_at           TIMESTAMPTZ,
    locked_by           VARCHAR(128),
    last_error          TEXT,
    idempotency_key     VARCHAR(255) UNIQUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at        TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events (status, next_retry_at, created_at)
    WHERE status = 'pending';

COMMIT;
