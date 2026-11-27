import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import { invalidarTodo } from './useMovimientos';
import { crearOEncolar } from '../lib/offline';

export const usePrestamos = (filtros) => useQuery({ queryKey: ['prestamos', filtros], queryFn: () => api(`/prestamos${qs(filtros)}`) });
export const usePrestamo = (id) => useQuery({ queryKey: ['prestamos', 'detalle', id], queryFn: () => api(`/prestamos/${id}`), enabled: !!id });

export function useGuardarPrestamo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }) => (id ? api(`/prestamos/${id}`, { method: 'PUT', body: d }) : crearOEncolar('prestamo', '/prestamos', d)),
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
    mutationFn: ({ id, ...d }) => crearOEncolar('abono', `/prestamos/${id}/abonos`, d),
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
