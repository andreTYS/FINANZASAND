import { useSyncExternalStore } from 'react';

const sub = (cb) => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb); }; };
export const useEnLinea = () => useSyncExternalStore(sub, () => navigator.onLine, () => true);
