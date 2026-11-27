import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { api, qs } from '../lib/api';

export const useDashboard = (params) => useQuery({ queryKey: ['dashboard', params], queryFn: () => api(`/dashboard${qs(params)}`), placeholderData: keepPreviousData });
export const useMetricas = (params) => useQuery({ queryKey: ['metricas', params], queryFn: () => api(`/dashboard/metricas${qs(params)}`), placeholderData: keepPreviousData });
