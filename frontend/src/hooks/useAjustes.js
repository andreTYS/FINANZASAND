import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useUi } from '../store/ui';

/** Ajustes guardados en el servidor (integraciones + moneda). Sincroniza la moneda con el store de UI. */
export function useAjustes() {
  const setMoneda = useUi((s) => s.setMoneda);
  const q = useQuery({ queryKey: ['ajustes'], queryFn: () => api('/ajustes'), staleTime: 5 * 60_000 });
  useEffect(() => { if (q.data?.moneda) setMoneda(q.data.moneda); }, [q.data?.moneda, setMoneda]);
  return q;
}

export function useGuardarAjustes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d) => api('/ajustes', { method: 'PUT', body: d }),
    onSuccess: (data) => qc.setQueryData(['ajustes'], data),
  });
}

export const useProbarGemini = () => useMutation({ mutationFn: (d) => api('/ajustes/probar-gemini', { method: 'POST', body: d }) });
export const useProbarN8n = () => useMutation({ mutationFn: (d) => api('/ajustes/probar-n8n', { method: 'POST', body: d }) });
