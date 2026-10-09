// Noto Sans covers all Indian scripts and is available as a system font on most
// modern operating systems or via Google Fonts. The stacks below list the best
// script-specific font first, then fall back to Noto Sans and generic families.

const devanagariStack = "'Noto Sans Devanagari', 'Mangal', 'Kokila', 'Noto Sans', sans-serif";
const bengaliStack = "'Noto Sans Bengali', 'Vrinda', 'Noto Sans', sans-serif";
const tamilStack = "'Noto Sans Tamil', 'Latha', 'Noto Sans', sans-serif";
const teluguStack = "'Noto Sans Telugu', 'Gautami', 'Noto Sans', sans-serif";
const kannadaStack = "'Noto Sans Kannada', 'Tunga', 'Noto Sans', sans-serif";
const malayalamStack = "'Noto Sans Malayalam', 'Kartika', 'Noto Sans', sans-serif";
const gujaratiStack = "'Noto Sans Gujarati', 'Shruti', 'Noto Sans', sans-serif";
const gurmukhiStack = "'Noto Sans Gurmukhi', 'Raavi', 'Noto Sans', sans-serif";
const odiaStack = "'Noto Sans Oriya', 'Kalinga', 'Noto Sans', sans-serif";
const urduStack = "'Noto Nastaliq Urdu', 'Noto Sans Arabic', 'Jameel Noori Nastaleeq', sans-serif";

const fontFamilyMap: Record<string, string> = {
  hi: devanagariStack, mr: devanagariStack, ne: devanagariStack,
  sa: devanagariStack, bho: devanagariStack, raj: devanagariStack,
  kok: devanagariStack, doi: devanagariStack,
  bn: bengaliStack, as: bengaliStack, mni: bengaliStack,
  ta: tamilStack,
  te: teluguStack,
  kn: kannadaStack,
  ml: malayalamStack,
  gu: gujaratiStack,
  pa: gurmukhiStack,
  or: odiaStack,
  ur: urduStack, sd: urduStack, ks: urduStack,
};

export const getDocumentFontFamily = (language: string = 'en'): string => {
  return fontFamilyMap[language] || "'Times New Roman', Times, serif";
};

export const getDocumentFontName = (language: string = 'en'): string => {
  if (fontFamilyMap[language]) {
    // Return the first font name from the stack for DOCX embedding
    return fontFamilyMap[language].split(',')[0].replace(/'/g, '').trim();
  }
  return 'Times New Roman';
};
