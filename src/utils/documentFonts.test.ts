import { getDocumentFontFamily, getDocumentFontName } from './documentFonts';

describe('documentFonts', () => {
  describe('getDocumentFontFamily', () => {
    it('returns Times New Roman for English', () => {
      expect(getDocumentFontFamily('en')).toContain('Times New Roman');
    });

    it('returns Devanagari font for Marathi', () => {
      const family = getDocumentFontFamily('mr');
      expect(family).toContain('Noto Sans Devanagari');
      expect(family).toContain('Mangal');
    });

    it('returns script-specific fonts for Indian languages', () => {
      expect(getDocumentFontFamily('hi')).toContain('Noto Sans Devanagari');
      expect(getDocumentFontFamily('bn')).toContain('Noto Sans Bengali');
      expect(getDocumentFontFamily('ta')).toContain('Noto Sans Tamil');
      expect(getDocumentFontFamily('te')).toContain('Noto Sans Telugu');
      expect(getDocumentFontFamily('kn')).toContain('Noto Sans Kannada');
      expect(getDocumentFontFamily('ml')).toContain('Noto Sans Malayalam');
      expect(getDocumentFontFamily('gu')).toContain('Noto Sans Gujarati');
      expect(getDocumentFontFamily('pa')).toContain('Noto Sans Gurmukhi');
      expect(getDocumentFontFamily('ur')).toContain('Noto Nastaliq Urdu');
    });

    it('defaults to Times New Roman when language is missing', () => {
      expect(getDocumentFontFamily()).toContain('Times New Roman');
    });

    it('defaults to Times New Roman for unknown languages', () => {
      expect(getDocumentFontFamily('fr')).toContain('Times New Roman');
    });
  });

  describe('getDocumentFontName', () => {
    it('returns Times New Roman for English', () => {
      expect(getDocumentFontName('en')).toBe('Times New Roman');
    });

    it('returns Noto Sans Devanagari for Marathi', () => {
      expect(getDocumentFontName('mr')).toBe('Noto Sans Devanagari');
    });

    it('defaults to Times New Roman when language is missing', () => {
      expect(getDocumentFontName()).toBe('Times New Roman');
    });
  });
});
