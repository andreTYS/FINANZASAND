import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { invalidarTodo } from './useMovimientos';

const form = (archivo) => { const f = new FormData(); f.append('archivo', archivo); return f; };

export const usePreviewImport = () => useMutation({ mutationFn: (archivo) => api('/import?modo=preview', { method: 'POST', body: form(archivo) }) });
export function useImportar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ archivo, incluirDuplicados }) => api(`/import?modo=importar${incluirDuplicados ? '&incluir_duplicados=1' : ''}`, { method: 'POST', body: form(archivo) }),
    onSuccess: () => { invalidarTodo(qc); qc.invalidateQueries({ queryKey: ['importaciones'] }); },
  });
}
export const useImportaciones = () => useQuery({ queryKey: ['importaciones'], queryFn: () => api('/importaciones') });
export const useAutomatizaciones = () => useQuery({ queryKey: ['automatizaciones'], queryFn: () => api('/automatizaciones') });
