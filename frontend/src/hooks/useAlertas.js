import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const useAlertas = () => useQuery({ queryKey: ['alertas'], queryFn: () => api('/alertas'), refetchInterval: 60_000 });

export function useMarcarAlertas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(id ? `/alertas/${id}/leida` : '/alertas/leer-todas', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alertas'] }),
  });
}
