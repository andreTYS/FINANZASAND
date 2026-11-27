import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (n, e) => e?.status !== 401 && e?.status !== 404 && n < 2, refetchOnWindowFocus: true },
  },
});
