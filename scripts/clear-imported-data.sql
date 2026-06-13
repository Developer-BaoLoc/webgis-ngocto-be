-- Xóa dữ liệu records đã import (giữ layers, schema, templates, seed)
BEGIN;

DELETE FROM feature_relations;
DELETE FROM feature_administrative_units;
DELETE FROM import_job_errors;
DELETE FROM import_jobs;
DELETE FROM job_executions;
DELETE FROM features;

COMMIT;
