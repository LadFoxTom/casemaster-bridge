/**
 * TanStack Query bindings for the cms-admin contract.
 *
 * Optimistic mutations follow the canonical pattern from §T3 of the
 * roadmap: onMutate cancels + snapshots + applies; onError rolls back
 * with a sonner toast; onSettled invalidates.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import type { BoListResponse, BoRow } from '@casemaster/api-spec';

// ---------- schema ----------

export const useSchema = () => useQuery({
  queryKey: ['schema'],
  queryFn:  api.schema,
  staleTime: 1000 * 60 * 30,
});

// ---------- bo list ----------

export interface UseBoListArgs {
  bo: string;
  group?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
  q?: string;
  filters?: Record<string, string | string[] | undefined>;
}

export function boListKey(args: UseBoListArgs) {
  return ['bo', args.bo, 'list', {
    group:    args.group ?? 'list',
    page:     args.page ?? 1,
    pageSize: args.pageSize ?? 50,
    sort:     args.sort,
    q:        args.q,
    filters:  args.filters,
  }];
}

export const useBoList = (args: UseBoListArgs) => useQuery<BoListResponse>({
  queryKey: boListKey(args),
  queryFn: () => api.boList(args.bo, {
    group:    args.group,
    page:     args.page,
    pageSize: args.pageSize,
    sort:     args.sort,
    q:        args.q,
    ...flatFilters(args.filters),
  }),
  placeholderData: (prev) => prev,
});

function flatFilters(f: UseBoListArgs['filters']): Record<string, string | string[]> {
  if (!f) return {};
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v == null || v === '') continue;
    out[`filter[${k}]`] = v as string | string[];
  }
  return out;
}

// ---------- bo get ----------

export const useBoGet = (bo: string, id: string | number | null | undefined) => useQuery({
  queryKey: ['bo', bo, 'get', id],
  enabled:  id != null,
  queryFn:  () => api.boGet(bo, id as string | number),
});

// ---------- bo save (optimistic) ----------

interface SaveCtx { previous?: BoListResponse[]; queries: ReturnType<ReturnType<typeof useQueryClient>['getQueryCache']>['getAll'] extends () => infer R ? R : never; }

export function useBoSave(bo: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BoRow) => api.boSave(bo, data),

    /**
     * Apply the change to every cached list query for this BO so the
     * UI feels instant. We snapshot first so onError can roll back.
     */
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ['bo', bo] });
      const lists = qc.getQueriesData<BoListResponse>({ queryKey: ['bo', bo, 'list'] });
      const detailKey = ['bo', bo, 'get', data.id];
      const detailPrev = qc.getQueryData(detailKey);

      // Optimistically merge the row into every list cache.
      lists.forEach(([key, value]) => {
        if (!value) return;
        qc.setQueryData<BoListResponse>(key, {
          ...value,
          rows: value.rows.map((r) => String(r.id) === String(data.id) ? { ...r, ...data } : r),
        });
      });
      if (data.id != null && detailPrev) {
        qc.setQueryData(detailKey, (prev: any) => prev ? { ...prev, row: { ...prev.row, ...data } } : prev);
      }
      return { lists, detailPrev };
    },

    onError: (err, _data, ctx) => {
      ctx?.lists?.forEach(([key, value]) => qc.setQueryData(key, value));
      if (ctx?.detailPrev) qc.setQueryData(['bo', bo, 'get', (_data as BoRow).id], ctx.detailPrev);
      toast.error(`Save failed`, { description: err instanceof ApiError ? err.message : String(err) });
    },

    onSuccess: (res) => {
      toast.success(`Saved`, { description: `#${res.row.id}` });
    },

    /** Refetch invariants from server, in either error or success case. */
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['bo', bo] });
    },
  });
}

// ---------- bo delete ----------

export function useBoDelete(bo: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | number) => api.boDelete(bo, id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['bo', bo] });
      const lists = qc.getQueriesData<BoListResponse>({ queryKey: ['bo', bo, 'list'] });
      lists.forEach(([key, value]) => {
        if (!value) return;
        qc.setQueryData<BoListResponse>(key, {
          ...value,
          rows: value.rows.filter((r) => String(r.id) !== String(id)),
          total: Math.max(0, value.total - 1),
        });
      });
      return { lists };
    },
    onError: (err, _id, ctx) => {
      ctx?.lists?.forEach(([key, value]) => qc.setQueryData(key, value));
      toast.error(`Delete failed`, { description: err instanceof ApiError ? err.message : String(err) });
    },
    onSuccess: () => toast.success('Deleted'),
    onSettled: () => { qc.invalidateQueries({ queryKey: ['bo', bo] }); },
  });
}

// ---------- page action ----------

export function usePageAction(path: string, fn: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: Record<string, unknown>) => api.pageAction(path, fn, params),
    onSuccess: (r) => {
      if (r.message) toast.success(r.message);
      // Invalidate everything bo-related — page actions can touch many BOs.
      qc.invalidateQueries({ queryKey: ['bo'] });
    },
    onError: (err) => toast.error('Action failed', { description: err instanceof ApiError ? err.message : String(err) }),
  });
}

// ---------- live (SSE) ----------

import { useEffect } from 'react';
export function useLive(bo: string, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const off = api.stream(bo, () => { qc.invalidateQueries({ queryKey: ['bo', bo] }); });
    return off;
  }, [bo, enabled, qc]);
}

// ---------- preferences ----------

export function usePref<T = unknown>(scope: string) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pref', scope], queryFn: () => api.getPref(scope) as Promise<T | null> });
  const m = useMutation({
    mutationFn: (value: T) => api.putPref(scope, value),
    onSuccess: (value) => qc.setQueryData(['pref', scope], value),
  });
  return { value: q.data, set: m.mutate, status: q.status } as const;
}
