import * as XLSX from 'xlsx';

export type ImportTemplateConfig = {
  code?: string;
  sheetName: string;
  headerRow: number;
  targetLayer?: string;
  mode?: 'flat' | 'parent_child';
  parentLayer?: string;
  childLayer?: string;
  parentDetect?: string;
  forwardFillParentFields?: string[];
  fixedValues?: Record<string, string>;
  columnMapping?: Record<string, string>;
  parentMapping?: Record<string, string>;
  childMapping?: Record<string, string>;
  unitHints?: Record<string, string>;
  dedupKey?: string[];
};

export type ParsedRow = {
  rowNumber: number;
  raw: Record<string, unknown>;
  properties: Record<string, unknown>;
  isParent?: boolean;
  parentProperties?: Record<string, unknown>;
  childProperties?: Record<string, unknown>;
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumnKey(headers: string[], mappingKey: string): string | null {
  const normalizedKey = normalizeHeader(mappingKey);
  const exact = headers.find((h) => h === normalizedKey);
  if (exact) return exact;
  const loose = headers.find(
    (h) => h.replace(/\s+/g, ' ').toLowerCase() === normalizedKey.toLowerCase(),
  );
  return loose ?? null;
}

function mapRow(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  headers: string[],
  fixedValues: Record<string, string> = {},
): Record<string, unknown> {
  const properties: Record<string, unknown> = { ...fixedValues };
  for (const [excelCol, fieldCode] of Object.entries(mapping)) {
    const header = findColumnKey(headers, excelCol);
    if (!header) continue;
    const value = row[header];
    if (value !== null && value !== undefined && value !== '') {
      properties[fieldCode] = value;
    }
  }
  return properties;
}

function isRowEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).every(
    (v) => v === null || v === undefined || String(v).trim() === '',
  );
}

export function parseSheetRows(
  filePath: string,
  config: ImportTemplateConfig,
  limit?: number,
): { headers: string[]; rows: ParsedRow[]; totalRows: number } {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet =
    workbook.Sheets[config.sheetName] ??
    workbook.Sheets[workbook.SheetNames.find((n) => n.includes(config.sheetName)) ?? ''];

  if (!sheet) {
    throw new Error(`Sheet không tồn tại: ${config.sheetName}`);
  }

  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  const headerIndex = Math.max(0, (config.headerRow ?? 1) - 1);
  const headerRow = matrix[headerIndex] ?? [];
  const headers = headerRow.map((cell) => normalizeHeader(cell));

  const dataRows = matrix.slice(headerIndex + 1);
  const parsed: ParsedRow[] = [];

  if (config.mode === 'parent_child') {
    let currentParent: Record<string, unknown> = {};
    const parentMapping = config.parentMapping ?? {};
    const childMapping = config.childMapping ?? {};

    for (let i = 0; i < dataRows.length; i += 1) {
      const rowArray = dataRows[i] ?? [];
      const row: Record<string, unknown> = {};
      headers.forEach((header, idx) => {
        if (header) row[header] = rowArray[idx] ?? null;
      });
      if (isRowEmpty(row)) continue;

      const sttHeader = findColumnKey(headers, 'STT') ?? headers[0];
      const sttValue = row[sttHeader ?? ''];
      const isParentRow =
        sttValue !== null &&
        sttValue !== undefined &&
        String(sttValue).trim() !== '';

      if (isParentRow) {
        currentParent = mapRow(row, parentMapping, headers);
        for (const field of config.forwardFillParentFields ?? []) {
          const header = findColumnKey(headers, field);
          if (header && row[header]) {
            const target = parentMapping[field];
            if (target) currentParent[target] = row[header];
          }
        }
      }

      const childProps = mapRow(row, childMapping, headers);
      if (!childProps.ten_san_pham) continue;

      parsed.push({
        rowNumber: headerIndex + 2 + i,
        raw: row,
        properties: { ...currentParent, ...childProps },
        isParent: isParentRow,
        parentProperties: { ...currentParent },
        childProperties: childProps,
      });

      if (limit && parsed.length >= limit) break;
    }

    return { headers, rows: parsed, totalRows: parsed.length };
  }

  const mapping = config.columnMapping ?? {};
  for (let i = 0; i < dataRows.length; i += 1) {
    const rowArray = dataRows[i] ?? [];
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      if (header) row[header] = rowArray[idx] ?? null;
    });
    if (isRowEmpty(row)) continue;

    const properties = mapRow(row, mapping, headers, config.fixedValues ?? {});
    if (Object.keys(properties).length === 0) continue;

    parsed.push({
      rowNumber: headerIndex + 2 + i,
      raw: row,
      properties,
    });

    if (limit && parsed.length >= limit) break;
  }

  return { headers, rows: parsed, totalRows: parsed.length };
}
