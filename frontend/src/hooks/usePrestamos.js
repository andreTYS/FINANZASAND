import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import { invalidarTodo } from './useMovimientos';

export const usePrestamos = (filtros) => useQuery({ queryKey: ['prestamos', filtros], queryFn: () => api(`/prestamos${qs(filtros)}`) });
export const usePrestamo = (id) => useQuery({ queryKey: ['prestamos', 'detalle', id], queryFn: () => api(`/prestamos/${id}`), enabled: !!id });

export function useGuardarPrestamo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }) => (id ? api(`/prestamos/${id}`, { method: 'PUT', body: d }) : api('/prestamos', { method: 'POST', body: d })),
    onSuccess: () => invalidarTodo(qc),
  });
}
export function useBorrarPrestamo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id) => api(`/prestamos/${id}`, { method: 'DELETE' }), onSuccess: () => invalidarTodo(qc) });
}
export function useAbonar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }) => api(`/prestamos/${id}/abonos`, { method: 'POST', body: d }),
    onSuccess: () => invalidarTodo(qc),
  });
}
export function useBorrarAbono() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, abonoId }) => api(`/prestamos/${id}/abonos/${abonoId}`, { method: 'DELETE' }),
    onSuccess: () => invalidarTodo(qc),
  });
}
