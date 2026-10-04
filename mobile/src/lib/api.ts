import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { useAuth } from './auth';
import type { Tokens } from './types';

/**
 * Where the FastAPI backend lives. Set EXPO_PUBLIC_API_URL to override (e.g. a deployed URL).
 * Otherwise: web uses localhost; a phone or simulator reaches the same machine running Metro.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web') return 'http://localhost:8000';
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  if (host) return `http://${host}:8000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';
}

export const API_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    return String(detail[0].msg).replace(/^Value error, /, '');
  }
  if (status === 0) return "Can't reach PolitiKNOW. Is the backend running?";
  return 'Something went wrong. Please try again.';
}

let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const { refreshToken, setTokens, signOut } = useAuth.getState();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await signOut(false);
      return false;
    }
    await setTokens((await res.json()) as Tokens);
    return true;
  } catch {
    return false;
  }
}

type Options = { method?: string; body?: unknown; auth?: boolean };

export async function api<T = unknown>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = useAuth.getState().accessToken;
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, errorMessage(null, 0));
  }

  // Access tokens last 15 minutes; transparently refresh once and retry.
  if (res.status === 401 && auth && !retried) {
    refreshing ??= refreshTokens().finally(() => (refreshing = null));
    if (await refreshing) return api<T>(path, opts, true);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}
