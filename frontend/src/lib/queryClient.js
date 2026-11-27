import { QueryClient, onlineManager } from '@tanstack/react-query';

// TanStack asume "en línea" al arrancar; si la app abre sin red, las consultas deben quedar en pausa (y mostrar la caché)
onlineManager.setOnline(navigator.onLine);
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 7 * 24 * 3600 * 1000, // necesario para que la caché persistida sobreviva offline
      retry: (n, e) => e?.status !== 401 && e?.status !== 404 && e?.status !== 0 && n < 2,
      refetchOnWindowFocus: true,
    },
    // Las mutaciones manejan la falta de red ellas mismas (cola local)
    mutations: { networkMode: 'always' },
  },
});

export const CACHE_KEY = 'finanzas-cache';
export const persister = createSyncStoragePersister({ storage: window.localStorage, key: CACHE_KEY, throttleTime: 500 });
export const opcionesPersistencia = {
  persister,
  maxAge: 7 * 24 * 3600 * 1000,
  buster: 'v2',
  dehydrateOptions: {
    // Toda consulta con datos (aunque su último refresco haya fallado por falta de red); nunca blobs de adjuntos
    shouldDehydrateQuery: (q) => q.state.data !== undefined && !['adjunto', 'sugerencia'].includes(q.queryKey[0]),
  },
};

export function limpiarCacheLocal() {
  queryClient.clear();
  try { localStorage.removeItem(CACHE_KEY); } catch { /* sin storage */ }
}
