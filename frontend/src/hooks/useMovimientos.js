import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, qs } from '../lib/api';
import { crearOEncolar } from '../lib/offline';

// Cualquier cambio en movimientos invalida dashboard y métricas
const invalidarTodo = (qc) => {
  ['movimientos', 'dashboard', 'metricas', 'prestamos', 'alertas'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
};

export const useMovimientos = (filtros) => useQuery({
  queryKey: ['movimientos', filtros],
  queryFn: () => api(`/movimientos${qs(filtros)}`),
  placeholderData: keepPreviousData,
});

export function useGuardarMovimiento() {
  const qc = useQueryClient();
  return useMutation({
    // Las altas por teclado funcionan sin conexión (cola local); editar y las altas por scan necesitan red
    mutationFn: ({ id, ...datos }) => (id
      ? api(`/movimientos/${id}`, { method: 'PUT', body: datos })
      : crearOEncolar('movimiento', '/movimientos', datos, { permitirCola: !datos.scan_token })),
    onSuccess: () => invalidarTodo(qc),
  });
}

export function useBorrarMovimiento() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id) => api(`/movimientos/${id}`, { method: 'DELETE' }), onSuccess: () => invalidarTodo(qc) });
}

export { invalidarTodo };
