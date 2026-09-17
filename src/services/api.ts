const TOKEN_KEY = 'law-writer-token';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export const setAuthToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export const getAuthToken = () => localStorage.getItem(TOKEN_KEY);

export const apiRequest = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = getAuthToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return undefined as T;
  const data = await response.json();
  if (!response.ok) throw new ApiError(data.error || 'Request failed', response.status);
  return data;
};
