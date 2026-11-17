import { apiRequest } from './api';

export async function translateText(
  text: string,
  fromLanguage: string,
  toLanguage: string
): Promise<string> {
  if (!text.trim()) return text;
  if (fromLanguage === toLanguage) return text;

  const result = await apiRequest<{ text: string }>('/api/translate', {
    method: 'POST',
    body: JSON.stringify({ text, fromLanguage, toLanguage }),
  });
  return result.text || text;
}
