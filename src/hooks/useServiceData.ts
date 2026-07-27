import { useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export interface UseServiceDataResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  /** Invalidates the query and triggers a background refetch */
  reload: () => void;
  /** Invalidates + immediately refetches and returns a promise that resolves when done */
  forceRefresh: () => Promise<void>;
}

interface UseServiceDataOptions {
  cacheKey?: string;
  cacheTtlMs?: number;
  showInitialLoading?: boolean;
  /** Max number of automatic retries on TIMEOUT / NETWORK_ERROR (default 2) */
  maxRetries?: number;
}

const DEFAULT_STALE_TIME_MS = 5 * 60 * 1000; // 5 min

function hashKey(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function getUserToken(): string {
  try {
    return localStorage.getItem('heliflow_token') || 'no-token';
  } catch {
    return 'no-token';
  }
}

export function useServiceData<T>(
  fetcher: () => Promise<T>,
  initial: T,
  deps: unknown[] = [],
  options: UseServiceDataOptions = {}
): UseServiceDataResult<T> {
  const queryClient = useQueryClient();

  const fetcherKey = useMemo(() => fetcher.toString(), [fetcher]);
  const userKey = useMemo(() => getUserToken(), []);
  const queryKey = useMemo(
    () => (options.cacheKey
      ? ['svc', userKey, options.cacheKey]
      : ['svc', userKey, hashKey(JSON.stringify(deps) + '|' + fetcherKey)]
    ),
    [options.cacheKey, deps, fetcherKey, userKey]
  );

  const cacheDisabled = options.cacheTtlMs === 0;
  const staleTime = cacheDisabled ? 0 : (options.cacheTtlMs ?? DEFAULT_STALE_TIME_MS);
  const gcTime = cacheDisabled ? 0 : (options.cacheTtlMs ?? DEFAULT_STALE_TIME_MS);
  const maxRetries = cacheDisabled ? 0 : (options.maxRetries ?? 2);

  const {
    data: queryData,
    isPending,
    isFetching,
    isPlaceholderData,
    error,
  } = useQuery<T>({
    queryKey,
    queryFn: fetcher,
    staleTime,
    gcTime,
    retry: maxRetries,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    // Keep previous data when refetching — avoids showing empty [] on navigation back
    placeholderData: (prev: T | undefined) => prev ?? initial as NonNullable<T> | undefined,
    // refetchOnWindowFocus is disabled globally in QueryClient.
    // Keeping refetchOnReconnect active so stale data refreshes after
    // network interruptions without user action.
    refetchOnWindowFocus: false,
    refetchOnReconnect: !cacheDisabled,
  });

  const data = queryData ?? initial;

  // Show loading only when we have NO real data yet (isPlaceholderData = true)
  // NOT during background refetches — that would flash "Loading…" on every
  // window focus or stale-time expiry even though cached data is already visible.
  const loading = isPlaceholderData && (isFetching || isPending);

  // Thin wrapper for consuming code that checks `loading` before rendering tables

  const reload = useCallback(() => {
    queryClient.invalidateQueries({ queryKey });
  }, [queryKey, queryClient]);

  const forceRefresh = useCallback(async () => {
    queryClient.invalidateQueries({ queryKey });
    await queryClient.refetchQueries({ queryKey });
  }, [queryKey, queryClient]);

  return {
    data,
    loading,
    error: error ? (error instanceof Error ? error.message : 'Failed to load data') : null,
    reload,
    forceRefresh,
  };
}
