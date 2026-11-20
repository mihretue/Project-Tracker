import { QueryClient, useQuery } from '@tanstack/react-query';
import { api } from './api';

/** Shared client for the app. Tests build their own with retries off. */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false },
    },
  });

/** Central place for cache keys so reads and invalidations always agree. */
export const queryKeys = {
  projects: (orgId: string | null | undefined) => ['projects', orgId] as const,
  members: (orgId: string | null | undefined) => ['members', orgId] as const,
  tasks: (projectId: string | null | undefined) => ['tasks', projectId] as const,
};

/** Projects of one organization. The sidebar and both dashboards share this cache entry. */
export function useProjects<T>(orgId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.projects(orgId),
    queryFn: async () => (await api.get<T[]>(`/projects?organizationId=${orgId}`)).data,
    enabled: !!orgId,
  });
}

export function useMembers<T>(orgId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.members(orgId),
    queryFn: async () => (await api.get<T[]>(`/organizations/${orgId}/members`)).data,
    enabled: !!orgId,
  });
}

/** ALL tasks of a project; the priority filter is applied client-side so budget totals stay complete. */
export function useTasks<T>(projectId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.tasks(projectId),
    queryFn: async () => (await api.get<T[]>(`/tasks?projectId=${projectId}`)).data,
    enabled: !!projectId,
  });
}
