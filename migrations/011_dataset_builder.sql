-- 011_dataset_builder.sql
-- Runtime Dataset Builder configuration on top of the legacy datasets table.

BEGIN;

ALTER TABLE datasets
    ALTER COLUMN source_layer_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{"fields":[],"sources":[],"previewLimit":20}',
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_by UUID;

ALTER TABLE datasets
    ADD CONSTRAINT fk_datasets_created_by_tenant
    FOREIGN KEY (created_by, tenant_id)
    REFERENCES users (id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_datasets_tenant_updated
    ON datasets (tenant_id, updated_at DESC);

COMMIT;
