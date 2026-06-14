import {
  parseLayerImportMatrix,
  resolveHeaderRowIndices,
} from './layer-excel.parser';
import { LayerExcelMeta } from './layer-excel.types';

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
});
