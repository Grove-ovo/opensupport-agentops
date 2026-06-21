import { useCallback, useEffect, useState } from 'react';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  reload(): void;
  setData(value: T): void;
}

export function useResource<T>(
  key: string,
  loader: () => Promise<T>,
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

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

  return {
    data,
    loading,
    error,
    stale: data !== null && error !== null,
    reload,
    setData,
  };
}
