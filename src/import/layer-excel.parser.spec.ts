import {
  estimateLayerImportWorkbookRowCount,
  inspectLayerImportWorkbookColumns,
  parseLayerImportMatrix,
  parseLayerImportWorkbookWithMeta,
  resolveHeaderRowIndices,
} from './layer-excel.parser';
import { LayerExcelMeta } from './layer-excel.types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as XLSX from 'xlsx';

function buildMeta(): LayerExcelMeta {
  return {
    formatVersion: 1,
    layerId: 'layer-1',
    layerCode: 'test',
    layerName: 'Test',
    schemaVersionId: 'schema-1',
    headerRow: 2,
    fieldCodeRow: 3,
    dataStartRow: 4,
    columns: [
      {
        fieldCode: '__stt__',
        label: 'STT',
        fieldType: 'stt',
        required: false,
      },
      {
        fieldCode: 'ten',
        label: 'Tên',
        fieldType: 'text',
        required: true,
      },
      {
        fieldCode: 'dia_chi',
        label: 'Địa chỉ',
        fieldType: 'text',
        required: true,
      },
      {
        fieldCode: 'loai',
        label: 'Loại',
        fieldType: 'category',
        required: false,
      },
    ],
  };
}

describe('layer-excel.parser', () => {
  const meta = buildMeta();
  const titleRow = ['Mẫu import — Test'];
  const labelRow = ['STT', 'Tên*', 'Địa chỉ*', 'Loại'];
  const codeRow = ['__stt__', 'ten', 'dia_chi', 'loai'];

  it('imports first data row from standard template (row 4)', () => {
    const matrix = [
      titleRow,
      labelRow,
      codeRow,
      ['1', 'HTX A', '123 Đường A', 'Trồng trọt'],
      ['2', 'HTX B', '456 Đường B', 'Chăn nuôi'],
    ];

    const rows = parseLayerImportMatrix(matrix, meta);
    expect(rows).toHaveLength(2);
    expect(rows[0].rowNumber).toBe(4);
    expect(rows[0].properties.ten).toBe('HTX A');
  });

  it('imports first data row when field code row was deleted', () => {
    const matrix = [
      titleRow,
      labelRow,
      ['1', 'HTX A', '123 Đường A', 'Trồng trọt'],
      ['2', 'HTX B', '456 Đường B', 'Chăn nuôi'],
    ];

    const rows = parseLayerImportMatrix(matrix, meta);
    expect(rows).toHaveLength(2);
    expect(rows[0].rowNumber).toBe(3);
    expect(rows[0].properties.ten).toBe('HTX A');
  });

  it('imports data when title row was replaced with first record', () => {
    const matrix = [
      ['1', 'HTX A', '123 Đường A', 'Trồng trọt'],
      labelRow,
      codeRow,
      ['2', 'HTX B', '456 Đường B', 'Chăn nuôi'],
    ];

    const rows = parseLayerImportMatrix(matrix, meta);
    expect(rows).toHaveLength(2);
    expect(rows[0].rowNumber).toBe(1);
    expect(rows[0].properties.ten).toBe('HTX A');
  });

  it('skips only header rows, not adjacent data', () => {
    const headerRows = resolveHeaderRowIndices(
      [titleRow, labelRow, codeRow],
      meta,
    );
    expect(headerRows).toEqual(new Set([0, 1, 2]));
  });

  it('imports workbook with title, labels, and data but without field-code row when meta is supplied', () => {
    const filePath = writeWorkbook([
      ['Mẫu import — Hợp tác xã'],
      ['STT', 'Tên*'],
      ['1', 'HTX Test 1'],
      ['2', 'HTX Test 2'],
    ]);

    const result = parseLayerImportWorkbookWithMeta(filePath, {
      ...meta,
      columns: meta.columns.slice(0, 2),
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].properties.ten).toBe('HTX Test 1');
    expect(result.rows[1].properties.ten).toBe('HTX Test 2');
  });

  it('imports workbook with labels, field-code row, and blank STT data when meta is supplied', () => {
    const filePath = writeWorkbook([
      ['STT', 'Tên*'],
      ['__stt__', 'ten'],
      ['', 'HTX Test 1'],
      ['', 'HTX Test 2'],
    ]);

    const result = parseLayerImportWorkbookWithMeta(filePath, {
      ...meta,
      columns: meta.columns.slice(0, 2),
    });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].properties.ten).toBe('HTX Test 1');
    expect(result.rows[1].properties.ten).toBe('HTX Test 2');
  });

  it('detects unknown columns from workbook headers', () => {
    const filePath = writeWorkbook([
      ['Mẫu import — Hợp tác xã'],
      ['STT', 'Tên*', 'Đường kính'],
      ['__stt__', 'ten', 'duong_kinh'],
      ['1', 'HTX Test 1', '1200'],
      ['2', 'HTX Test 2', '1500'],
    ]);

    const columns = inspectLayerImportWorkbookColumns(filePath);

    expect(columns.map((column) => column.code)).toEqual([
      'ten',
      'duong_kinh',
    ]);
    expect(columns[1].values).toEqual(['1200', '1500']);
    expect(estimateLayerImportWorkbookRowCount(filePath)).toBe(2);
  });

  it('maps data by field-code header when workbook has no STT column', () => {
    const filePath = writeWorkbook([
      ['ten', 'dia_chi'],
      ['HTX Test 1', 'Đường A'],
      ['HTX Test 2', 'Đường B'],
    ]);

    const result = parseLayerImportWorkbookWithMeta(filePath, meta);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].properties.ten).toBe('HTX Test 1');
    expect(result.rows[0].properties.dia_chi).toBe('Đường A');
  });
});

function writeWorkbook(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    'Du_lieu',
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'layer-import-'));
  const filePath = path.join(dir, 'plain.xlsx');
  XLSX.writeFile(workbook, filePath);
  return filePath;
}
