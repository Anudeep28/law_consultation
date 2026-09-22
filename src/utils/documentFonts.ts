export const getDocumentFontFamily = (language: string = 'en'): string => {
  if (language === 'mr') {
    return "'Kruti Dev', 'Kruti Dev 010', 'Mangal', serif";
  }
  return "'Times New Roman', Times, serif";
};

export const getDocumentFontName = (language: string = 'en'): string => {
  if (language === 'mr') {
    return 'Kruti Dev';
  }
  return 'Times New Roman';
};
