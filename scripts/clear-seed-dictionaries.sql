-- Xóa toàn bộ danh mục dùng chung (seed + do admin tạo).
-- Giữ: tenant, users, layers, records, administrative_units.

BEGIN;

DELETE FROM dictionary_items;
DELETE FROM dictionaries;

COMMIT;
