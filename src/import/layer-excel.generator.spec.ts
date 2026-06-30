import * as XLSX from 'xlsx';
import {
  generateLayerImportWorkbook,
  buildDefaultSampleFieldsForGeometry,
} from './layer-excel.generator';
import {
  LAYER_EXCEL_DATA_SHEET,
  LAYER_EXCEL_META_SHEET,
} from './layer-excel.constants';
import { LayerExcelMeta } from './layer-excel.types';

describe('layer-excel.generator', () => {
  it('generates usable point template columns for an empty layer', () => {
    const buffer = generateLayerImportWorkbook({
      layerId: 'layer-1',
      layerCode: 'empty-point',
      layerName: 'Layer Point Trống',
      schemaVersionId: 'schema-1',
      fields: [],
      geometryType: 'point',
    });

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[LAYER_EXCEL_DATA_SHEET],
      { header: 1 },
    );
    const meta = JSON.parse(
      String(workbook.Sheets[LAYER_EXCEL_META_SHEET].A1.v),
    ) as LayerExcelMeta;

    expect(rows[0]).toEqual(
      expect.arrayContaining([
        'STT',
        'Mã đối tượng',
        'Tên đối tượng',
        'Kinh độ',
        'Vĩ độ',
        'Geometry WKT hoặc Tọa độ',
        'SRID',
      ]),
    );
    expect(rows[1]).toEqual(
      expect.arrayContaining([1, 'CT-001', 'Công trình mẫu 1', 105.9195]),
    );
    expect(rows[1]).not.toContain('__stt__');
    expect(meta.headerRow).toBe(1);
    expect(meta.fieldCodeRow).toBeNull();
    expect(meta.dataStartRow).toBe(2);
  });

  it('adds geometry helper columns when real fields exist but geometry helper is missing', () => {
    const buffer = generateLayerImportWorkbook({
      layerId: 'layer-2',
      layerCode: 'polygon',
      layerName: 'Layer Polygon',
      schemaVersionId: 'schema-2',
      geometryType: 'polygon',
      fields: [
        {
          code: 'ma',
          label: 'Mã',
          fieldType: 'text',
          dataSchema: {},
        },
        {
          code: 'ten',
          label: 'Tên',
          fieldType: 'text',
          dataSchema: {},
        },
        {
          code: 'loai',
          label: 'Loại',
          fieldType: 'category',
          dataSchema: {},
        },
      ],
    });

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets[LAYER_EXCEL_DATA_SHEET],
      { header: 1 },
    );

    expect(rows[0]).toEqual(
      expect.arrayContaining(['Mã', 'Tên', 'Loại', 'Tọa độ vùng', 'Diện tích']),
    );
  });

  it('builds default line and polygon sample field sets', () => {
    expect(buildDefaultSampleFieldsForGeometry('line').map((field) => field.label)).toEqual(
      expect.arrayContaining(['Tọa độ tuyến', 'Chiều dài', 'SRID']),
    );
    expect(
      buildDefaultSampleFieldsForGeometry('polygon').map((field) => field.label),
    ).toEqual(expect.arrayContaining(['Tọa độ vùng', 'Diện tích', 'SRID']));
  });
});
