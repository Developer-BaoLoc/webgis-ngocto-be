export function cleanDictionaryText(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeDictionaryName(value: string): string {
  return cleanDictionaryText(value).normalize('NFC').toLocaleLowerCase('vi-VN');
}

export function normalizeDictionaryCode(value: string): string {
  return cleanDictionaryText(value).toLocaleLowerCase('vi-VN');
}
