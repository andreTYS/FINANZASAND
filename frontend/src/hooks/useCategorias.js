import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export const useCategorias = () => useQuery({ queryKey: ['categorias'], queryFn: () => api('/categorias'), staleTime: 5 * 60_000 });

export function useGuardarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }) => (id ? api(`/categorias/${id}`, { method: 'PUT', body: d }) : api('/categorias', { method: 'POST', body: d })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categorias'] }),
  });
}
export function useBorrarCategoria() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api(`/categorias/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categorias'] }); qc.invalidateQueries({ queryKey: ['movimientos'] }); },
  });
}
