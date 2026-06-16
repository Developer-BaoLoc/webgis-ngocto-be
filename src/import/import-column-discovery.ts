import { slugifyFieldCode } from '../metadata/utils/field-code.util';
import { ImportNewFieldType } from './dto/import-new-field.dto';

export type ImportDetectedColumn = {
  code: string;
  label: string;
  values: unknown[];
};

export type ImportColumnSuggestion = {
  code: string;
  label: string;
  suggestedType: ImportNewFieldType;
  confidence: number;
};

export type ImportColumnAnalysis = {
  detectedColumns: string[];
  existingFields: string[];
  unknownColumns: string[];
  columnSuggestions: ImportColumnSuggestion[];
};

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === '';
}

function parseBooleanLike(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  const normalized = String(value).trim().toLowerCase();
  return [
    'true',
    'false',
    'yes',
    'no',
    'y',
    'n',
    'co',
    'khong',
    'có',
    'không',
  ].includes(normalized);
}

function parseNumberLike(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  const raw = String(value).trim().replace(/,/g, '');
  return raw !== '' && Number.isFinite(Number(raw));
}

function parseDateLike(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const raw = String(value).trim();
  if (
    !/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw) &&
    !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(raw));
}

function confidence(matches: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((matches / total) * 100) / 100;
}

export function normalizeImportColumnCode(value: string): string {
  return slugifyFieldCode(value);
}

export function suggestImportFieldType(
  values: unknown[],
): { suggestedType: ImportNewFieldType; confidence: number } {
  const samples = values.filter((value) => !isEmpty(value)).slice(0, 20);
  if (samples.length === 0) {
    return { suggestedType: 'text', confidence: 0.5 };
  }

  const booleanMatches = samples.filter(parseBooleanLike).length;
  if (booleanMatches === samples.length) {
    return {
      suggestedType: 'boolean',
      confidence: confidence(booleanMatches, samples.length),
    };
  }

  const dateMatches = samples.filter(parseDateLike).length;
  if (dateMatches === samples.length) {
    return {
      suggestedType: 'date',
      confidence: confidence(dateMatches, samples.length),
    };
  }

  const numberMatches = samples.filter(parseNumberLike).length;
  if (numberMatches === samples.length) {
    return {
      suggestedType: 'decimal',
      confidence: confidence(numberMatches, samples.length),
    };
  }

  return { suggestedType: 'text', confidence: 0.8 };
}

export function buildImportColumnAnalysis(
  columns: ImportDetectedColumn[],
  schemaFields: Array<{ code: string; label: string }>,
): ImportColumnAnalysis {
  const existingSet = new Set(schemaFields.map((field) => field.code));
  const seen = new Set<string>();
  const normalizedColumns = columns
    .map((column) => ({
      ...column,
      code: normalizeImportColumnCode(column.code || column.label),
    }))
    .filter((column) => column.code && !seen.has(column.code))
    .map((column) => {
      seen.add(column.code);
      return column;
    });

  const detectedColumns = normalizedColumns.map((column) => column.code);
  const unknownColumnSet = new Set(
    normalizedColumns
      .filter((column) => !existingSet.has(column.code))
      .map((column) => column.code),
  );

  return {
    detectedColumns,
    existingFields: schemaFields.map((field) => field.code),
    unknownColumns: [...unknownColumnSet],
    columnSuggestions: normalizedColumns
      .filter((column) => unknownColumnSet.has(column.code))
      .map((column) => {
        const suggestion = suggestImportFieldType(column.values);
        return {
          code: column.code,
          label: column.label || column.code,
          suggestedType: suggestion.suggestedType,
          confidence: suggestion.confidence,
        };
      }),
  };
}
