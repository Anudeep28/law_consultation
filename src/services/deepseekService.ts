const DEEPSEEK_API_KEY = process.env.REACT_APP_DEEPSEEK_API_KEY || '';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

export async function translateText(
  text: string,
  fromLanguage: string,
  toLanguage: string
): Promise<string> {
  if (!text.trim()) return text;
  if (fromLanguage === toLanguage) return text;

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a translator. Translate the user's text from ${fromLanguage} to ${toLanguage}. Output only the translated text with no explanations, no quotes, no extra formatting.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || text;
}
