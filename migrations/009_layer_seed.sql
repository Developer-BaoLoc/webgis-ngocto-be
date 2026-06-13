-- 009_layer_seed.sql
-- Seed bổ sung Phase 1 — chỉ dictionaries (layers tạo qua CRUD API)

BEGIN;

-- nganh_nghe dictionary
INSERT INTO dictionaries (id, tenant_id, code, name, is_hierarchical)
SELECT '90000000-0000-4000-8000-000000000020', NULL, 'nganh_nghe', 'Ngành nghề', FALSE
WHERE NOT EXISTS (SELECT 1 FROM dictionaries WHERE code = 'nganh_nghe' AND tenant_id IS NULL);

INSERT INTO dictionary_items (dictionary_id, code, label, sort_order)
SELECT '90000000-0000-4000-8000-000000000020', v.code, v.label, v.ord
FROM (VALUES
  ('trong_trot', 'Trồng trọt', 1),
  ('chan_nuoi', 'Chân nuôi', 2),
  ('thuy_san', 'Thủy sản', 3),
  ('che_bien', 'Chế biến', 4),
  ('dich_vu', 'Dịch vụ', 5),
  ('cong_nghe_cao', 'Công nghệ cao', 6)
) AS v(code, label, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM dictionary_items di
  WHERE di.dictionary_id = '90000000-0000-4000-8000-000000000020' AND di.code = v.code
);

COMMIT;
