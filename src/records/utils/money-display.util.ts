import {
  getMoneyMultiplier,
  getMoneyUnitLabel,
} from '../../metadata/constants/field-units.constants';
import { sanitizeMoneySourceValue, roundMoneySourceValue } from './money-import.util';

export function normalizeMoneyUnitCode(code: string | undefined): string {
  const normalized = String(code ?? 'vnd').trim();
  if (normalized === 'million_vnd') return 'million';
  return normalized;
}

export function resolveMoneyDisplay(
  value: unknown,
  fieldUnit: string | undefined,
): { displayAmount: number; unitCode: string } | null {
  const defaultUnit = normalizeMoneyUnitCode(fieldUnit);

  if (typeof value === 'number') {
    const multiplier = getMoneyMultiplier(defaultUnit);
    if (defaultUnit !== 'vnd' && Math.abs(value) >= multiplier) {
      return {
        displayAmount: roundMoneySourceValue(value / multiplier),
        unitCode: defaultUnit,
      };
    }
    return {
      displayAmount: roundMoneySourceValue(value),
      unitCode: defaultUnit,
    };
  }

  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const obj = value as {
    sourceValue?: number;
    amount?: number;
    sourceUnit?: string;
    unit?: string;
    sourceScale?: string;
  };

  const unitCode = normalizeMoneyUnitCode(
    obj.sourceUnit ??
      obj.unit ??
      (obj.sourceScale === 'million_vnd' ? 'million' : obj.sourceScale) ??
      defaultUnit,
  );

  if (typeof obj.sourceValue === 'number') {
    const sanitized = sanitizeMoneySourceValue(obj.sourceValue, unitCode);
    return { displayAmount: sanitized, unitCode };
  }

  if (typeof obj.amount === 'number') {
    const multiplier = getMoneyMultiplier(unitCode);
    return {
      displayAmount: roundMoneySourceValue(obj.amount / multiplier),
      unitCode,
    };
  }

  return null;
}

export function formatMoneyDisplayValue(
  value: unknown,
  fieldUnit: string | undefined,
): string {
  const resolved = resolveMoneyDisplay(value, fieldUnit);
  if (!resolved) return '—';

  const { displayAmount, unitCode } = resolved;
  const formatted = Number.isInteger(displayAmount)
    ? displayAmount.toLocaleString('vi-VN')
    : displayAmount.toLocaleString('vi-VN', { maximumFractionDigits: 4 });

  return `${formatted} ${getMoneyUnitLabel(unitCode)}`;
}
