import { BadRequestException } from '@nestjs/common';
import {
  isValidMeasurementUnit,
  isValidMoneyUnit,
  isValidQuantityUnit,
  MEASUREMENT_TYPES,
} from '../constants/field-units.constants';

export function resolveDictionaryCode(dataSchema: Record<string, unknown>): string {
  return String(dataSchema.dictionary ?? dataSchema.dictionaryCode ?? '').trim();
}

export function validateFieldDataSchema(
  fieldType: string,
  dataSchema: Record<string, unknown> = {},
): void {
  switch (fieldType) {
    case 'money': {
      const unit = String(dataSchema.unit ?? dataSchema.unitHint ?? '').trim();
      if (!unit) {
        throw new BadRequestException(
          'Trường tiền tệ bắt buộc chọn đơn vị (unit): vnd, hundred_thousand, million, billion',
        );
      }
      if (!isValidMoneyUnit(unit) && unit !== 'million_vnd') {
        throw new BadRequestException(`Đơn vị tiền tệ không hợp lệ: ${unit}`);
      }
      break;
    }
    case 'measurement': {
      const measurementType = String(dataSchema.measurementType ?? '').trim();
      if (!measurementType) {
        throw new BadRequestException(
          'Trường đo lường bắt buộc chọn loại (measurementType): distance hoặc area',
        );
      }
      if (!MEASUREMENT_TYPES.some((t) => t.code === measurementType)) {
        throw new BadRequestException(
          `Loại đo lường không hợp lệ: ${measurementType}`,
        );
      }
      const unit = String(
        dataSchema.unit ?? dataSchema.defaultUnit ?? '',
      ).trim();
      if (!unit) {
        throw new BadRequestException(
          'Trường đo lường bắt buộc chọn đơn vị (unit)',
        );
      }
      if (!isValidMeasurementUnit(measurementType, unit)) {
        throw new BadRequestException(
          `Đơn vị đo lường không hợp lệ cho ${measurementType}: ${unit}`,
        );
      }
      break;
    }
    case 'quantity': {
      const unit = String(dataSchema.unit ?? dataSchema.defaultUnit ?? '').trim();
      if (!unit) {
        throw new BadRequestException(
          'Trường sản lượng bắt buộc chọn đơn vị (unit): kg, tan, lit, ...',
        );
      }
      if (!isValidQuantityUnit(unit)) {
        throw new BadRequestException(`Đơn vị sản lượng không hợp lệ: ${unit}`);
      }
      break;
    }
    case 'category':
    case 'multi_category': {
      const dictionaryCode = resolveDictionaryCode(dataSchema);
      if (!dictionaryCode) {
        throw new BadRequestException(
          'Trường danh mục bắt buộc chọn danh mục dùng chung (dataSchema.dictionary)',
        );
      }
      break;
    }
    default:
      break;
  }
}
