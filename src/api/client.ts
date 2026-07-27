import { USE_MOCK } from '../config/mock';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const TOKEN_KEY = 'heliflow_token';
const CLIENT_INSTANCE_KEY = 'heliflow_client_instance_id';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  code?: string;
}

export class ApiError extends Error {
  code?: string;
  status?: number;

  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
  cacheTtlMs?: number;
  // Optional: skip surgical cache bust for fire-and-forget mutations
  skipCacheBust?: boolean;
};

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

// FIX 1: Raised from 30s → 2 min so components don't re-fetch on every mount
const DEFAULT_GET_CACHE_TTL_MS = Number(import.meta.env.VITE_API_CACHE_TTL_MS || 120_000);
const apiCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getClientInstanceId(): string {
  const existing = localStorage.getItem(CLIENT_INSTANCE_KEY);
  if (existing) return existing;

  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(CLIENT_INSTANCE_KEY, id);
  return id;
}

export function authHeaders(extra?: Record<string, string>): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    'X-Client-Instance-Id': getClientInstanceId(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function methodOf(options: RequestInit): string {
  return String(options.method || 'GET').toUpperCase();
}

function buildCacheKey(path: string, options: RequestInit): string {
  // FIX 2: Full token (not just 24 chars) to prevent cross-user cache collisions
  const token = localStorage.getItem(TOKEN_KEY) || '';
  return [methodOf(options), path, token, getClientInstanceId()].join('|');
}

// FIX 3: Surgical bust — only invalidate GET entries for the mutated path.
// Old clearApiCache() wiped everything including unrelated endpoints and
// in-flight promises, causing every hook to re-fetch after any POST/PUT/DELETE.
function bustRelatedCache(mutatedPath: string): void {
  const basePath = mutatedPath.split('?')[0];
  const ancestors = [basePath];
  let current = basePath;
  while (current.includes('/')) {
    current = current.replace(/\/[^/]+$/, '');
    if (current) ancestors.push(current);
    else break;
  }

  for (const key of apiCache.keys()) {
    const parts = key.split('|');
    if (parts[0] !== 'GET') continue;

    const requestPath = parts[1];
    const requestBase = requestPath.split('?')[0];

    if (ancestors.some((ancestor) =>
      requestBase === ancestor || requestBase.startsWith(`${ancestor}/`)
    )) {
      apiCache.delete(key);
    }
  }
  // Do NOT touch inFlightRequests — in-flight GETs should still resolve normally
}

export function invalidateApiCache(path: string): void {
  bustRelatedCache(path);
}

/** Clear ALL cached API responses — call on logout to prevent stale data across sessions */
export function clearAllApiCache(): void {
  apiCache.clear();
  inFlightRequests.clear();
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const { timeoutMs: requestTimeoutMs, cacheTtlMs, skipCacheBust, ...fetchOptions } = options;
  const method = methodOf(fetchOptions);
  const useCache = method === 'GET' && cacheTtlMs !== 0;
  const ttlMs = cacheTtlMs ?? DEFAULT_GET_CACHE_TTL_MS;
  const key = useCache ? buildCacheKey(path, fetchOptions) : '';

  if (useCache) {
    const cached = apiCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const pending = inFlightRequests.get(key);
    if (pending) {
      return pending as Promise<T>;
    }
  } else if (method !== 'GET' && !skipCacheBust) {
    // FIX 3 applied: only bust cache entries related to this path
    bustRelatedCache(path);
  }

  const request = fetchApi<T>(path, fetchOptions, requestTimeoutMs)
    .then((result) => {
      if (useCache) {
        apiCache.set(key, { expiresAt: Date.now() + ttlMs, value: result });
      }
      return result;
    })
    .finally(() => {
      if (useCache) inFlightRequests.delete(key);
    });

  if (useCache) inFlightRequests.set(key, request);
  return request;
}

async function fetchApi<T>(
  path: string,
  fetchOptions: RequestInit,
  requestTimeoutMs?: number
): Promise<T> {
  let res: Response;
  const timeoutMs = requestTimeoutMs ?? Number(import.meta.env.VITE_API_TIMEOUT_MS || 30000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        ...authHeaders(),
        ...(fetchOptions.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    clearTimeout(t);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(
        `Request timed out after ${timeoutMs}ms. Backend may be slow/unreachable.`,
        'TIMEOUT'
      );
    }
    throw new ApiError(
      `Cannot reach backend at ${API_BASE}. Start the server: cd Heliflow_Client_Backend && npm run dev`,
      'NETWORK_ERROR'
    );
  } finally {
    clearTimeout(t);
  }

  let json: ApiResponse<T> & Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    json = {} as ApiResponse<T> & Record<string, unknown>;
  }

  // Auth endpoints return flat body (no wrapper)
  if (res.ok && json.user && json.token) {
    return json as T;
  }

  if (!res.ok) {
    const message =
      (json as ApiResponse).error ||
      (json as { message?: string }).message ||
      `Request failed (${res.status})`;
    throw new ApiError(message, (json as ApiResponse).code, res.status);
  }

  if (typeof json.success === 'boolean') {
    if (!json.success) {
      throw new ApiError(json.error || 'Request failed', json.code, res.status);
    }
    return json.data as T;
  }

  return json as T;
}

/** Log when a module has no backend API and mock is forced */
export function warnNoBackend(module: string): void {
  if (!USE_MOCK) {
    console.warn(`[Heliflow] ${module}: no backend API — using local mock data`);
  }
}