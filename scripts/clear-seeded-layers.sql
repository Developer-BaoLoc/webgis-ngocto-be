-- Xóa toàn bộ layers seed (metadata) — layers sẽ tạo lại qua CRUD API
-- Giữ: tenant, users, dictionaries, administrative_units

BEGIN;

DELETE FROM feature_relations;
DELETE FROM feature_administrative_units;
DELETE FROM import_job_errors;
DELETE FROM import_jobs;
DELETE FROM job_executions;
DELETE FROM import_template_targets;
DELETE FROM import_templates
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

DELETE FROM features
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

DELETE FROM relation_definitions
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

DELETE FROM schema_field_versions
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE layers SET current_schema_version_id = NULL
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

DELETE FROM layer_schema_versions
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

DELETE FROM fields
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

DELETE FROM layer_views
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

DELETE FROM layer_map_styles
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

UPDATE role_assignments SET layer_id = NULL
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001'
  AND layer_id IS NOT NULL;

DELETE FROM layers
WHERE tenant_id = 'a0000000-0000-4000-8000-000000000001';

COMMIT;
