import * as XLSX from 'xlsx';
import {
  LAYER_EXCEL_DATA_SHEET,
  LAYER_EXCEL_FORMAT_VERSION,
  LAYER_EXCEL_META_SHEET,
  LAYER_EXCEL_STT_CODE,
} from './layer-excel.constants';
import { LayerExcelMeta, LayerExcelParsedRow } from './layer-excel.types';

function normalizeCell(value: unknown): string {
  return String(value ?? '').trim();
}

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function isRowEmpty(values: unknown[]): boolean {
  return values.every(
    (value) =>
      value === null ||
      value === undefined ||
      normalizeCell(value) === '',
  );
}

function stripRequiredMarker(value: string): string {
  return value.replace(/\*+$/, '').trim();
}

function rowMatchesFieldCodes(
  row: unknown[],
  expectedCodes: string[],
): boolean {
  let matches = 0;
  let checked = 0;

  expectedCodes.forEach((code, idx) => {
    const cell = normalizeCell(row[idx]);
    if (!cell) return;
    checked += 1;
    if (cell === code) {
      matches += 1;
    }
  });

  return matches >= 3 && matches >= Math.max(checked, 1) * 0.6;
}

function rowMatchesFieldLabels(
  row: unknown[],
  meta: LayerExcelMeta,
): boolean {
  let matches = 0;
  let checked = 0;

  meta.columns.forEach((column, idx) => {
    const cell = stripRequiredMarker(normalizeCell(row[idx]));
    if (!cell) return;
    checked += 1;
    if (cell === column.label || cell === column.fieldCode) {
      matches += 1;
    }
  });

  return matches >= 3 && matches >= Math.max(checked, 1) * 0.6;
}

function isTitleRow(row: unknown[]): boolean {
  const first = normalizeCell(row[0]);
  if (!first) return false;
  const normalized = stripAccents(first.toLowerCase());
  return (
    normalized.startsWith('mau import') || normalized.includes('mau import')
  );
}

/** Các dòng tiêu đề / header — mọi dòng khác (có dữ liệu) đều được import. */
export function resolveHeaderRowIndices(
  matrix: unknown[][],
  meta: LayerExcelMeta,
): Set<number> {
  const indices = new Set<number>();
  const expectedCodes = meta.columns.map((column) => column.fieldCode);
  const maxScan = Math.min(matrix.length, 25);

  for (let i = 0; i < maxScan; i += 1) {
    const row = matrix[i] ?? [];
    if (isRowEmpty(row)) continue;

    if (rowMatchesFieldCodes(row, expectedCodes)) {
      indices.add(i);
      continue;
    }

    if (rowMatchesFieldLabels(row, meta)) {
      indices.add(i);
      continue;
    }

    if (isTitleRow(row)) {
      indices.add(i);
    }
  }

  return indices;
}

function mapRowByColumns(
  rowArray: unknown[],
  meta: LayerExcelMeta,
): { raw: Record<string, unknown>; properties: Record<string, unknown> } {
  const raw: Record<string, unknown> = {};
  const properties: Record<string, unknown> = {};

  meta.columns.forEach((column, idx) => {
    const value = rowArray[idx] ?? null;
    raw[column.fieldCode] = value;

    if (column.fieldCode === LAYER_EXCEL_STT_CODE) return;
    if (value !== null && value !== undefined && normalizeCell(value) !== '') {
      properties[column.fieldCode] = value;
    }
  });

  return { raw, properties };
}

export function parseLayerImportMatrix(
  matrix: unknown[][],
  meta: LayerExcelMeta,
  limit?: number,
): LayerExcelParsedRow[] {
  const importColumns = meta.columns.filter(
    (col) => col.fieldCode !== LAYER_EXCEL_STT_CODE,
  );
  if (importColumns.length === 0) {
    throw new Error('File mẫu không có cột dữ liệu');
  }

  const headerRows = resolveHeaderRowIndices(matrix, meta);
  const rows: LayerExcelParsedRow[] = [];

  for (let i = 0; i < matrix.length; i += 1) {
    if (headerRows.has(i)) continue;

    const rowArray = matrix[i] ?? [];
    if (isRowEmpty(rowArray)) continue;

    const { raw, properties } = mapRowByColumns(rowArray, meta);
    if (Object.keys(properties).length === 0) continue;

    rows.push({
      rowNumber: i + 1,
      properties,
      raw,
    });

    if (limit && rows.length >= limit) break;
  }

  return rows;
}

export function readLayerExcelMeta(workbook: XLSX.WorkBook): LayerExcelMeta {
  const metaSheet = workbook.Sheets[LAYER_EXCEL_META_SHEET];
  if (!metaSheet) {
    throw new Error(
      'File không phải mẫu import của hệ thống (thiếu sheet _meta). Hãy tải file mẫu từ lớp dữ liệu.',
    );
  }

  const cell = metaSheet.A1?.v;
  if (!cell || typeof cell !== 'string') {
    throw new Error('Metadata import không hợp lệ');
  }

  const meta = JSON.parse(cell) as LayerExcelMeta;
  if (meta.formatVersion !== LAYER_EXCEL_FORMAT_VERSION) {
    throw new Error('Phiên bản file mẫu không được hỗ trợ');
  }

  return meta;
}

export function parseLayerImportWorkbook(
  filePath: string,
  limit?: number,
): { meta: LayerExcelMeta; rows: LayerExcelParsedRow[] } {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const meta = readLayerExcelMeta(workbook);

  const dataSheet =
    workbook.Sheets[LAYER_EXCEL_DATA_SHEET] ??
    workbook.Sheets[workbook.SheetNames[0] ?? ''];

  if (!dataSheet) {
    throw new Error(`Sheet ${LAYER_EXCEL_DATA_SHEET} không tồn tại`);
  }

  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(dataSheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  const rows = parseLayerImportMatrix(matrix, meta, limit);

  return { meta, rows };
}
