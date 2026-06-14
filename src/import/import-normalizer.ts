import { DictionaryItemEntity } from '../database/entities/dictionary.entity';

const KHU_VUC_ALIASES: Record<string, string> = {
  'bình lợi': 'binh_loi',
  'binh loi': 'binh_loi',
  'bình trung': 'binh_trung',
  'binh trung': 'binh_trung',
  'bình hiếu': 'binh_hieu',
  'binh hieu': 'binh_hieu',
  'bình hòa': 'binh_hoa',
  'binh hoa': 'binh_hoa',
  'bình thuận': 'binh_thuan',
  'binh thuan': 'binh_thuan',
  'bình thạnh b': 'binh_thanh_b',
  'binh thanh b': 'binh_thanh_b',
  'bình thạnh c': 'binh_thanh_c',
  'binh thanh c': 'binh_thanh_c',
  'bình tân': 'binh_tan',
  'binh tan': 'binh_tan',
  'an hòa': 'an_hoa',
  'an hoa': 'an_hoa',
  'thạnh hiếu': 'thanh_hieu',
  'thanh hieu': 'thanh_hieu',
};

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizeText(value: string): string {
  return stripAccents(value.toLowerCase().trim().replace(/^kv\s*/i, ''));
}

export function normalizeKhuVuc(
  raw: unknown,
  items: DictionaryItemEntity[],
): string | string[] | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const text = String(raw);
  const parts = text.split(/[,+]/).map((p) => normalizeText(p)).filter(Boolean);
  const codes: string[] = [];

  for (const part of parts) {
    const alias = KHU_VUC_ALIASES[part];
    if (alias) {
      codes.push(alias);
      continue;
    }
    const match = items.find((item) => {
      const label = normalizeText(item.label.replace(/^khu vực\s*/i, ''));
      return part.includes(label) || label.includes(part);
    });
    if (match) codes.push(match.code);
  }

  if (codes.length === 0) return text;
  return codes.length === 1 ? codes[0] : codes;
}

export function normalizeCategory(
  raw: unknown,
  items: DictionaryItemEntity[],
): string | null {
  return matchCategoryCode(raw, items) ?? (String(raw ?? '').trim() || null);
}

/** Import: chỉ trả code khi khớp danh mục, không fallback text thô. */
export function matchCategoryCode(
  raw: unknown,
  items: DictionaryItemEntity[],
): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const text = normalizeText(String(raw));
  const match = items.find(
    (item) =>
      normalizeText(item.label) === text ||
      item.code === text ||
      normalizeText(item.label).includes(text),
  );
  return match?.code ?? null;
}

export function normalizeLoaiBom(raw: unknown): string | null {
  if (!raw) return null;
  const text = normalizeText(String(raw));
  if (text.includes('dien') || text.includes('điện')) return 'bom_dien';
  if (text.includes('dau') || text.includes('dầu')) return 'bom_dau';
  return String(raw).trim();
}

export function normalizeNganhNghe(raw: unknown): string[] | null {
  if (!raw) return null;
  const text = String(raw);
  return text
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeXepHang(raw: unknown): string | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (text.includes('3')) return '3_sao';
  if (text.includes('4')) return '4_sao';
  return text;
}

export function normalizeTinhTrang(raw: unknown): string | null {
  if (!raw) return null;
  const text = normalizeText(String(raw));
  if (text.includes('dang') || text.includes('đang')) return 'active';
  if (text.includes('khong') || text.includes('không')) return 'inactive';
  if (text.includes('vu') || text.includes('vụ')) return 'seasonal';
  return String(raw).trim();
}
