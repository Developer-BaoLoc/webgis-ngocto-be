import {
  cleanDictionaryText,
  normalizeDictionaryName,
} from './dictionary-normalization.util';

describe('dictionary normalization', () => {
  it('collapses whitespace and ignores Vietnamese letter case', () => {
    expect(cleanDictionaryText('  Kênh   cấp 1  ')).toBe('Kênh cấp 1');
    expect(normalizeDictionaryName('KÊNH CẤP 1')).toBe(
      normalizeDictionaryName(' kênh   cấp 1 '),
    );
  });
});
