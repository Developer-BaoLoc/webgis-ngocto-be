import { LAYER_EXCEL_IMPORT_OPTIONAL_TYPES } from '../../import/layer-excel.constants';

type SchemaField = {
  code: string;
  fieldType: string;
  dataSchema: Record<string, unknown>;
};

export function buildUnitHints(fields: SchemaField[]): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const field of fields) {
    if (field.fieldType === 'money' && field.dataSchema.unit) {
      hints[field.code] = String(field.dataSchema.unit);
    }
    if (field.fieldType === 'measurement' && field.dataSchema.unit) {
      hints[field.code] = String(field.dataSchema.unit);
    }
    if (field.fieldType === 'quantity' && field.dataSchema.unit) {
      hints[field.code] = String(field.dataSchema.unit);
    }
  }
  return hints;
}

export function fieldsForImportValidation(fields: SchemaField[]): SchemaField[] {
  return fields.map((field) => {
    if (!LAYER_EXCEL_IMPORT_OPTIONAL_TYPES.has(field.fieldType)) {
      return field;
    }
    return {
      ...field,
      dataSchema: { ...field.dataSchema, required: false },
    };
  });
}
