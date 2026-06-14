export type LayerExcelFieldColumn = {
  fieldCode: string;
  label: string;
  fieldType: string;
  required: boolean;
  dictionary?: string;
  unitHint?: string;
  hint?: string;
};

export type LayerExcelMeta = {
  formatVersion: number;
  layerId: string;
  layerCode: string;
  layerName: string;
  schemaVersionId: string;
  headerRow: number;
  fieldCodeRow: number;
  dataStartRow: number;
  columns: LayerExcelFieldColumn[];
};

export type LayerExcelParsedRow = {
  rowNumber: number;
  properties: Record<string, unknown>;
  raw: Record<string, unknown>;
};
