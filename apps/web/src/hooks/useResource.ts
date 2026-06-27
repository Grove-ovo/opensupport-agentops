import { useCallback, useEffect, useRef, useState } from 'react';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  reload(): void;
  setData(value: T): void;
}

export interface UseResourceOptions {
  /** Auto-refresh interval in milliseconds. Set to 0 or undefined to disable. */
  refreshInterval?: number;
  /** Whether to pause auto-refresh (e.g., when tab is not visible). */
  pause?: boolean;
}

export function useResource<T>(
  key: string,
  loader: () => Promise<T>,
  options: UseResourceOptions = {},
): Resource<T> {
  const { refreshInterval = 0, pause = false } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    void loader()
      .then((value) => {
        if (ignore) return;
        setData(value);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (ignore) return;
        setError(reason instanceof Error ? reason.message : 'request_failed');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [key, version]);

  // Auto-refresh mechanism
  useEffect(() => {
    if (refreshInterval <= 0 || pause) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setVersion((value) => value + 1);
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refreshInterval, pause]);

  return {
    data,
    loading,
    error,
    stale: data !== null && error !== null,
    reload,
    setData,
  };
}
