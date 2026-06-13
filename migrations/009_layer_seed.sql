-- 009_layer_seed.sql
-- Phase 1 — layers, published schemas, dictionaries, import templates

BEGIN;

DO $$
DECLARE
  tid UUID := 'a0000000-0000-4000-8000-000000000001';
  uid UUID := 'f0000000-0000-4000-8000-000000000001';
  lid UUID;
  sid UUID;
  fid UUID;
  f RECORD;
  idx INT;
BEGIN
  -- -------------------------------------------------------------------------
  -- economic_collective
  -- -------------------------------------------------------------------------
  lid := '10000000-0000-4000-8000-000000000001';
  sid := '11000000-0000-4000-8000-000000000001';

  INSERT INTO layers (id, tenant_id, code, name, geometry_kind, geometry_required, sort_order, created_by)
  VALUES (lid, tid, 'economic_collective', 'Chủ thể kinh tế tập thể', 'point', FALSE, 1, uid)
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO layer_schema_versions (id, layer_id, tenant_id, version, status, published_at, published_by, created_by)
  VALUES (sid, lid, tid, 1, 'published', NOW(), uid, uid)
  ON CONFLICT (layer_id, version) DO NOTHING;

  UPDATE layers SET current_schema_version_id = sid WHERE id = lid;

  idx := 0;
  FOR f IN SELECT * FROM (VALUES
    ('ten_chu_the', 'Tên chủ thể', 'text'),
    ('loai_chu_the', 'Loại chủ thể', 'category'),
    ('nguoi_dai_dien', 'Người đại diện', 'text'),
    ('dia_chi_text', 'Địa chỉ', 'text'),
    ('khu_vuc', 'Khu vực', 'category'),
    ('nganh_nghe', 'Ngành nghề', 'multi_category'),
    ('dien_tich', 'Diện tích', 'measurement'),
    ('quy_trinh', 'Quy trình sản xuất', 'textarea'),
    ('so_thanh_vien', 'Số thành viên', 'integer'),
    ('san_luong', 'Sản lượng', 'quantity'),
    ('kenh_tieu_thu', 'Kênh tiêu thụ', 'text'),
    ('chi_phi_nam', 'Chi phí/năm', 'money'),
    ('thu_nhap_nam', 'Thu nhập/năm', 'money'),
    ('loi_nhuan_nam', 'Lợi nhuận/năm', 'money'),
    ('so_dien_thoai', 'Số điện thoại', 'phone'),
    ('tinh_trang', 'Tình trạng HĐ', 'category'),
    ('ghi_chu', 'Ghi chú', 'textarea')
  ) AS t(code, label, field_type)
  LOOP
    idx := idx + 1;
    fid := ('20100000-0000-4000-8000-' || lpad(idx::text, 12, '0'))::uuid;
    INSERT INTO fields (id, layer_id, tenant_id, storage_key)
    VALUES (fid, lid, tid, f.code)
    ON CONFLICT (layer_id, storage_key) DO NOTHING;
    SELECT id INTO fid FROM fields WHERE layer_id = lid AND storage_key = f.code;
    INSERT INTO schema_field_versions (schema_version_id, field_id, layer_id, tenant_id, code, label, field_type, data_schema, sort_order)
    VALUES (sid, fid, lid, tid, f.code, f.label, f.field_type,
      CASE f.code
        WHEN 'loai_chu_the' THEN '{"dictionary":"loai_chu_the"}'::jsonb
        WHEN 'khu_vuc' THEN '{"dictionary":"khu_vuc"}'::jsonb
        WHEN 'nganh_nghe' THEN '{"dictionary":"nganh_nghe"}'::jsonb
        WHEN 'tinh_trang' THEN '{"dictionary":"tinh_trang_hoat_dong"}'::jsonb
        WHEN 'dien_tich' THEN '{"defaultUnit":"ha"}'::jsonb
        WHEN 'chi_phi_nam' THEN '{"unitHint":"million_vnd"}'::jsonb
        WHEN 'thu_nhap_nam' THEN '{"unitHint":"million_vnd"}'::jsonb
        WHEN 'loi_nhuan_nam' THEN '{"unitHint":"million_vnd"}'::jsonb
        ELSE '{}'::jsonb
      END,
      idx)
    ON CONFLICT (schema_version_id, field_id) DO NOTHING;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- pump_station
  -- -------------------------------------------------------------------------
  lid := '10000000-0000-4000-8000-000000000002';
  sid := '11000000-0000-4000-8000-000000000002';

  INSERT INTO layers (id, tenant_id, code, name, geometry_kind, geometry_required, sort_order, created_by)
  VALUES (lid, tid, 'pump_station', 'Trạm bơm', 'point', FALSE, 2, uid)
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO layer_schema_versions (id, layer_id, tenant_id, version, status, published_at, published_by, created_by)
  VALUES (sid, lid, tid, 1, 'published', NOW(), uid, uid)
  ON CONFLICT (layer_id, version) DO NOTHING;

  UPDATE layers SET current_schema_version_id = sid WHERE id = lid;

  idx := 0;
  FOR f IN SELECT * FROM (VALUES
    ('ten_tram_bom', 'Tên trạm bơm', 'text'),
    ('nguoi_dai_dien', 'Người đại diện', 'text'),
    ('khu_vuc', 'Khu vực', 'category'),
    ('nganh_nghe', 'Ngành nghề', 'multi_category'),
    ('dien_tich_phuc_vu', 'Diện tích phục vụ', 'measurement'),
    ('quy_trinh', 'Quy trình', 'textarea'),
    ('so_thanh_vien', 'Số thành viên', 'integer'),
    ('san_luong', 'Sản lượng', 'quantity'),
    ('kenh_tieu_thu', 'Kênh tiêu thụ', 'text'),
    ('chi_phi_nam', 'Chi phí/năm', 'money'),
    ('thu_nhap_nam', 'Thu nhập/năm', 'money'),
    ('loi_nhuan_nam', 'Lợi nhuận/năm', 'money'),
    ('so_dien_thoai', 'Số điện thoại', 'phone'),
    ('tinh_trang', 'Tình trạng HĐ', 'category'),
    ('loai_bom', 'Loại bơm', 'category')
  ) AS t(code, label, field_type)
  LOOP
    idx := idx + 1;
    fid := ('20200000-0000-4000-8000-' || lpad(idx::text, 12, '0'))::uuid;
    INSERT INTO fields (id, layer_id, tenant_id, storage_key)
    VALUES (fid, lid, tid, f.code)
    ON CONFLICT (layer_id, storage_key) DO NOTHING;
    SELECT id INTO fid FROM fields WHERE layer_id = lid AND storage_key = f.code;
    INSERT INTO schema_field_versions (schema_version_id, field_id, layer_id, tenant_id, code, label, field_type, data_schema, sort_order)
    VALUES (sid, fid, lid, tid, f.code, f.label, f.field_type,
      CASE f.code
        WHEN 'khu_vuc' THEN '{"dictionary":"khu_vuc"}'::jsonb
        WHEN 'loai_bom' THEN '{"dictionary":"loai_bom"}'::jsonb
        WHEN 'tinh_trang' THEN '{"dictionary":"tinh_trang_hoat_dong"}'::jsonb
        WHEN 'chi_phi_nam' THEN '{"unitHint":"million_vnd"}'::jsonb
        WHEN 'dien_tich_phuc_vu' THEN '{"defaultUnit":"ha"}'::jsonb
        ELSE '{}'::jsonb
      END,
      idx)
    ON CONFLICT (schema_version_id, field_id) DO NOTHING;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- production_zone
  -- -------------------------------------------------------------------------
  lid := '10000000-0000-4000-8000-000000000003';
  sid := '11000000-0000-4000-8000-000000000003';

  INSERT INTO layers (id, tenant_id, code, name, geometry_kind, geometry_required, sort_order, created_by)
  VALUES (lid, tid, 'production_zone', 'Vùng sản xuất', 'polygon', FALSE, 3, uid)
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO layer_schema_versions (id, layer_id, tenant_id, version, status, published_at, published_by, created_by)
  VALUES (sid, lid, tid, 1, 'published', NOW(), uid, uid)
  ON CONFLICT (layer_id, version) DO NOTHING;

  UPDATE layers SET current_schema_version_id = sid WHERE id = lid;

  idx := 0;
  FOR f IN SELECT * FROM (VALUES
    ('ten_vung', 'Tên vùng', 'text'),
    ('danh_sach_nguoi', 'Danh sách người', 'textarea'),
    ('khu_vuc', 'Khu vực', 'category'),
    ('nganh_nghe', 'Ngành nghề', 'multi_category'),
    ('dien_tich', 'Diện tích', 'measurement'),
    ('quy_trinh', 'Quy trình sản xuất', 'textarea'),
    ('so_thanh_vien', 'Số thành viên', 'integer'),
    ('san_luong', 'Sản lượng', 'quantity'),
    ('kenh_tieu_thu', 'Kênh tiêu thụ', 'text'),
    ('chi_phi_nam', 'Chi phí/năm', 'money'),
    ('thu_nhap_nam', 'Thu nhập/năm', 'money'),
    ('loi_nhuan_nam', 'Lợi nhuận/năm', 'money'),
    ('so_dien_thoai', 'Số điện thoại', 'phone'),
    ('tinh_trang', 'Tình trạng HĐ', 'category'),
    ('ghi_chu', 'Ghi chú', 'textarea')
  ) AS t(code, label, field_type)
  LOOP
    idx := idx + 1;
    fid := ('20300000-0000-4000-8000-' || lpad(idx::text, 12, '0'))::uuid;
    INSERT INTO fields (id, layer_id, tenant_id, storage_key)
    VALUES (fid, lid, tid, f.code)
    ON CONFLICT (layer_id, storage_key) DO NOTHING;
    SELECT id INTO fid FROM fields WHERE layer_id = lid AND storage_key = f.code;
    INSERT INTO schema_field_versions (schema_version_id, field_id, layer_id, tenant_id, code, label, field_type, data_schema, sort_order)
    VALUES (sid, fid, lid, tid, f.code, f.label, f.field_type, '{}'::jsonb, idx)
    ON CONFLICT (schema_version_id, field_id) DO NOTHING;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- ocop_subject
  -- -------------------------------------------------------------------------
  lid := '10000000-0000-4000-8000-000000000004';
  sid := '11000000-0000-4000-8000-000000000004';

  INSERT INTO layers (id, tenant_id, code, name, geometry_kind, geometry_required, sort_order, created_by)
  VALUES (lid, tid, 'ocop_subject', 'Chủ thể OCOP', 'point', FALSE, 4, uid)
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO layer_schema_versions (id, layer_id, tenant_id, version, status, published_at, published_by, created_by)
  VALUES (sid, lid, tid, 1, 'published', NOW(), uid, uid)
  ON CONFLICT (layer_id, version) DO NOTHING;

  UPDATE layers SET current_schema_version_id = sid WHERE id = lid;

  idx := 0;
  FOR f IN SELECT * FROM (VALUES
    ('ten_chu_the', 'Chủ thể', 'text'),
    ('nguoi_dai_dien', 'Người đại diện', 'text'),
    ('khu_vuc', 'Khu vực', 'category'),
    ('so_dien_thoai', 'Số điện thoại', 'phone'),
    ('tinh_trang', 'Tình trạng HĐ', 'category')
  ) AS t(code, label, field_type)
  LOOP
    idx := idx + 1;
    fid := ('20400000-0000-4000-8000-' || lpad(idx::text, 12, '0'))::uuid;
    INSERT INTO fields (id, layer_id, tenant_id, storage_key)
    VALUES (fid, lid, tid, f.code)
    ON CONFLICT (layer_id, storage_key) DO NOTHING;
    SELECT id INTO fid FROM fields WHERE layer_id = lid AND storage_key = f.code;
    INSERT INTO schema_field_versions (schema_version_id, field_id, layer_id, tenant_id, code, label, field_type, data_schema, sort_order)
    VALUES (sid, fid, lid, tid, f.code, f.label, f.field_type, '{}'::jsonb, idx)
    ON CONFLICT (schema_version_id, field_id) DO NOTHING;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- ocop_product
  -- -------------------------------------------------------------------------
  lid := '10000000-0000-4000-8000-000000000005';
  sid := '11000000-0000-4000-8000-000000000005';

  INSERT INTO layers (id, tenant_id, code, name, geometry_kind, geometry_required, sort_order, created_by)
  VALUES (lid, tid, 'ocop_product', 'Sản phẩm OCOP', 'none', FALSE, 5, uid)
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO layer_schema_versions (id, layer_id, tenant_id, version, status, published_at, published_by, created_by)
  VALUES (sid, lid, tid, 1, 'published', NOW(), uid, uid)
  ON CONFLICT (layer_id, version) DO NOTHING;

  UPDATE layers SET current_schema_version_id = sid WHERE id = lid;

  idx := 0;
  FOR f IN SELECT * FROM (VALUES
    ('ten_san_pham', 'Tên sản phẩm', 'text'),
    ('xep_hang', 'Xếp hạng', 'category'),
    ('nganh_nghe', 'Ngành nghề', 'multi_category'),
    ('dien_tich', 'Diện tích', 'measurement'),
    ('quy_trinh', 'Quy trình sản xuất', 'textarea'),
    ('so_thanh_vien', 'Số thành viên', 'integer'),
    ('san_luong', 'Sản lượng', 'quantity'),
    ('kenh_tieu_thu', 'Kênh tiêu thụ', 'text'),
    ('chi_phi_nam', 'Chi phí/năm', 'money'),
    ('thu_nhap_nam', 'Thu nhập/năm', 'money'),
    ('loi_nhuan_nam', 'Lợi nhuận/năm', 'money')
  ) AS t(code, label, field_type)
  LOOP
    idx := idx + 1;
    fid := ('20500000-0000-4000-8000-' || lpad(idx::text, 12, '0'))::uuid;
    INSERT INTO fields (id, layer_id, tenant_id, storage_key)
    VALUES (fid, lid, tid, f.code)
    ON CONFLICT (layer_id, storage_key) DO NOTHING;
    SELECT id INTO fid FROM fields WHERE layer_id = lid AND storage_key = f.code;
    INSERT INTO schema_field_versions (schema_version_id, field_id, layer_id, tenant_id, code, label, field_type, data_schema, sort_order)
    VALUES (sid, fid, lid, tid, f.code, f.label, f.field_type,
      CASE f.code WHEN 'xep_hang' THEN '{"dictionary":"xep_hang_ocop"}'::jsonb ELSE '{}'::jsonb END,
      idx)
    ON CONFLICT (schema_version_id, field_id) DO NOTHING;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- administrative_zone
  -- -------------------------------------------------------------------------
  lid := '10000000-0000-4000-8000-000000000006';
  sid := '11000000-0000-4000-8000-000000000006';

  INSERT INTO layers (id, tenant_id, code, name, geometry_kind, geometry_required, sort_order, created_by)
  VALUES (lid, tid, 'administrative_zone', 'Khu vực', 'polygon', FALSE, 6, uid)
  ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO layer_schema_versions (id, layer_id, tenant_id, version, status, published_at, published_by, created_by)
  VALUES (sid, lid, tid, 1, 'published', NOW(), uid, uid)
  ON CONFLICT (layer_id, version) DO NOTHING;

  UPDATE layers SET current_schema_version_id = sid WHERE id = lid;

  idx := 0;
  FOR f IN SELECT * FROM (VALUES
    ('ten_khu_vuc', 'Tên khu vực', 'text'),
    ('ma_khu_vuc', 'Mã khu vực', 'text'),
    ('mo_ta', 'Mô tả', 'textarea')
  ) AS t(code, label, field_type)
  LOOP
    idx := idx + 1;
    fid := ('20600000-0000-4000-8000-' || lpad(idx::text, 12, '0'))::uuid;
    INSERT INTO fields (id, layer_id, tenant_id, storage_key)
    VALUES (fid, lid, tid, f.code)
    ON CONFLICT (layer_id, storage_key) DO NOTHING;
    SELECT id INTO fid FROM fields WHERE layer_id = lid AND storage_key = f.code;
    INSERT INTO schema_field_versions (schema_version_id, field_id, layer_id, tenant_id, code, label, field_type, data_schema, sort_order)
    VALUES (sid, fid, lid, tid, f.code, f.label, f.field_type, '{}'::jsonb, idx)
    ON CONFLICT (schema_version_id, field_id) DO NOTHING;
  END LOOP;
END $$;

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

-- OCOP relation definition
INSERT INTO relation_definitions (id, tenant_id, code, name, source_layer_id, target_layer_id, relation_type, cardinality)
VALUES (
  '40000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'ocop_owns',
  'Chủ thể OCOP sở hữu sản phẩm',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
  'owns',
  'one_to_many'
)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Import templates
INSERT INTO import_templates (id, tenant_id, name, root_layer_id, config, created_by)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'HTX', '10000000-0000-4000-8000-000000000001',
    '{"code":"htx","sheetName":"HTX","headerRow":2,"targetLayer":"economic_collective","fixedValues":{"loai_chu_the":"hop_tac_xa"},"columnMapping":{"Tên Mô hình":"ten_chu_the","Người đại diện":"nguoi_dai_dien","Địa chỉ":"khu_vuc","Ngành nghề sản xuất/kinh doanh":"nganh_nghe","Diện tích (ha)":"dien_tich","Quy trình sản xuất":"quy_trinh","Số thành viên":"so_thanh_vien","Sản lượng":"san_luong","Kênh tiêu thụ":"kenh_tieu_thu","Chi phí/năm\n (triệu đồng)":"chi_phi_nam","Thu nhập/năm \n(triệu đồng)":"thu_nhap_nam","Lợi nhuận/năm (triệu đồng)":"loi_nhuan_nam","Số điện thoại":"so_dien_thoai","Tình trạng HĐ":"tinh_trang","Ghi chú":"ghi_chu"},"unitHints":{"chi_phi_nam":"million_vnd","thu_nhap_nam":"million_vnd","loi_nhuan_nam":"million_vnd","dien_tich":"ha"},"dedupKey":["ten_chu_the","loai_chu_the"]}'::jsonb,
    'f0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Tổ hợp tác', '10000000-0000-4000-8000-000000000001',
    '{"code":"to_hop_tac","sheetName":"Tổ hợp tác","headerRow":2,"targetLayer":"economic_collective","fixedValues":{"loai_chu_the":"to_hop_tac"},"columnMapping":{"Tên Mô hình":"ten_chu_the","Người đại diện":"nguoi_dai_dien","Địa chỉ":"khu_vuc","Ngành nghề sản xuất/kinh doanh":"nganh_nghe","Diện tích (ha)":"dien_tich","Quy trình sản xuất":"quy_trinh","Số thành viên":"so_thanh_vien","Sản lượng":"san_luong","Kênh tiêu thụ":"kenh_tieu_thu","Chi phí/năm\n (triệu đồng)":"chi_phi_nam","Thu nhập/năm \n(triệu đồng)":"thu_nhap_nam","Lợi nhuận/năm (triệu đồng)":"loi_nhuan_nam","Số điện thoại":"so_dien_thoai","Tình trạng HĐ":"tinh_trang","Ghi chú":"ghi_chu"},"unitHints":{"chi_phi_nam":"million_vnd","thu_nhap_nam":"million_vnd","loi_nhuan_nam":"million_vnd","dien_tich":"ha"},"dedupKey":["ten_chu_the","loai_chu_the"]}'::jsonb,
    'f0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Thủy Lợi', '10000000-0000-4000-8000-000000000002',
    '{"code":"thuy_loi","sheetName":"Thủy Lợi","headerRow":2,"targetLayer":"pump_station","columnMapping":{"Tên trạm bơm":"ten_tram_bom","Người đại diện":"nguoi_dai_dien","Địa chỉ":"khu_vuc","Ngành nghề sản xuất/kinh doanh":"nganh_nghe","Diện tích (ha)":"dien_tich_phuc_vu","Quy trình sản xuất":"quy_trinh","Số thành viên":"so_thanh_vien","Sản lượng":"san_luong","Kênh tiêu thụ":"kenh_tieu_thu","Chi phí/năm (triệu đồng)":"chi_phi_nam","Thu nhập/năm (triệu đồng)":"thu_nhap_nam","Lợi nhuận/năm(triệu đồng)":"loi_nhuan_nam","Số điện thoại":"so_dien_thoai","Tình trạng HĐ":"tinh_trang","Ghi chú":"loai_bom"},"unitHints":{"chi_phi_nam":"million_vnd","dien_tich_phuc_vu":"ha"}}'::jsonb,
    'f0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Vùng sản xuất', '10000000-0000-4000-8000-000000000003',
    '{"code":"vung_san_xuat","sheetName":"Vùng sản xuất","headerRow":2,"targetLayer":"production_zone","columnMapping":{"Tên trạm bơm":"ten_vung","Người đại diện":"danh_sach_nguoi","Địa chỉ":"khu_vuc","Ngành nghề\n sản xuất/\nkinh doanh":"nganh_nghe","Diện tích\n (ha)":"dien_tich","Quy trình\n sản xuất":"quy_trinh","Số thành \nviên":"so_thanh_vien","Sản lượng":"san_luong","Kênh tiêu\n thụ":"kenh_tieu_thu","Chi phí/năm \n(triệu đồng)":"chi_phi_nam","Thu nhập/\nnăm \n(triệu đồng)":"thu_nhap_nam","Lợi nhuận/\nnăm\n(triệu đồng)":"loi_nhuan_nam","Số điện thoại":"so_dien_thoai","Tình trạng \nHĐ":"tinh_trang","Ghi chú":"ghi_chu"},"unitHints":{"chi_phi_nam":"million_vnd","thu_nhap_nam":"million_vnd","loi_nhuan_nam":"million_vnd","dien_tich":"ha"}}'::jsonb,
    'f0000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'SP OCOP', '10000000-0000-4000-8000-000000000004',
    '{"code":"sp_ocop","sheetName":"SP OCOP","headerRow":2,"mode":"parent_child","parentLayer":"ocop_subject","childLayer":"ocop_product","parentDetect":"stt_not_empty","forwardFillParentFields":["Chủ thể","Người đại diện","Địa chỉ","Số điện thoại","Tình trạng HĐ"],"parentMapping":{"Chủ thể":"ten_chu_the","Người đại diện":"nguoi_dai_dien","Địa chỉ":"khu_vuc","Số điện thoại":"so_dien_thoai","Tình trạng HĐ":"tinh_trang"},"childMapping":{"Tên Sản phẩm OCOP":"ten_san_pham","Xếp hạng":"xep_hang","Ngành nghề sản xuất/kinh doanh":"nganh_nghe","Diện tích (ha)":"dien_tich","Quy trình sản xuất":"quy_trinh","Số thành viên":"so_thanh_vien","Sản lượng":"san_luong","Kênh tiêu thụ":"kenh_tieu_thu","Chi phí/năm ":"chi_phi_nam","Thu nhập/năm":"thu_nhap_nam","Lợi nhuận/năm":"loi_nhuan_nam"},"unitHints":{"chi_phi_nam":"million_vnd","thu_nhap_nam":"million_vnd","loi_nhuan_nam":"million_vnd"}}'::jsonb,
    'f0000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

COMMIT;
