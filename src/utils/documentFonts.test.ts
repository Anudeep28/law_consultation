import { getDocumentFontFamily, getDocumentFontName } from './documentFonts';

describe('documentFonts', () => {
  describe('getDocumentFontFamily', () => {
    it('returns Times New Roman for English', () => {
      expect(getDocumentFontFamily('en')).toContain('Times New Roman');
    });

    it('returns Kruti Dev for Marathi', () => {
      const family = getDocumentFontFamily('mr');
      expect(family).toContain('Kruti Dev');
      expect(family).toContain('Mangal');
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

    it('returns Kruti Dev for Marathi', () => {
      expect(getDocumentFontName('mr')).toBe('Kruti Dev');
    });

    it('defaults to Times New Roman when language is missing', () => {
      expect(getDocumentFontName()).toBe('Times New Roman');
    });
  });
});
