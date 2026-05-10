/**
 * Typed JSON client for /api/v1. Keeps the contract surface tight; every
 * cross-network call in the SPA goes through this module.
 */

import type {
  BoListResponse, BoGetResponse, BoSaveResponse,
  PageActionResponse, SchemaResponse, SessionMeResponse,
} from '@casemaster/api-spec';
import { API_PATHS } from '@casemaster/api-spec';

let CSRF: string | null = null;

async function go<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    credentials: 'include',
    headers: {
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      ...(CSRF ? { 'X-CSRF-Token': CSRF } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* */ }
  if (!r.ok) throw new ApiError(json?.error ?? `HTTP ${r.status}`, r.status, json);
  return json as T;
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly payload?: any) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  schema: () => go<SchemaResponse>('GET', API_PATHS.schema),
  boList: (bo: string, q: Record<string, string | number | string[] | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v == null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, String(x)));
      else qs.append(k, String(v));
    }
    return go<BoListResponse>('GET', `${API_PATHS.boList(bo)}?${qs.toString()}`);
  },
  boGet:    (bo: string, id: string | number) => go<BoGetResponse>('GET', `${API_PATHS.boGet(bo)}?id=${encodeURIComponent(String(id))}`),
  boSave:   (bo: string, data: Record<string, unknown>) => go<BoSaveResponse>('POST', API_PATHS.boSave(bo), data),
  boDelete: (bo: string, id: string | number) => go<{ ok: true }>('POST', API_PATHS.boDelete(bo), { id }),
  pageAction: (path: string, fn: string, params: Record<string, unknown>) =>
                go<PageActionResponse>('POST', API_PATHS.pageAction(path, fn), params),
  sessionMe: async () => {
    const r = await go<SessionMeResponse>('GET', API_PATHS.sessionMe);
    CSRF = r.csrf;
    return r;
  },
  sessionLogin: (email: string, password: string) =>
                  go<{ ok: boolean; csrf: string }>('POST', API_PATHS.sessionLogin, { email, password }),
  sessionLogout: () => go<{ ok: true }>('POST', API_PATHS.sessionLogout),
  getPref: (scope: string) => go<{ value: unknown }>('GET', API_PATHS.preferences(scope)).then((r) => r.value),
  putPref: (scope: string, value: unknown) => fetch(API_PATHS.preferences(scope), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(CSRF ? { 'X-CSRF-Token': CSRF } : {}) },
    body: JSON.stringify({ value }),
  }).then((r) => { if (!r.ok) throw new ApiError('pref save failed', r.status); return value; }),
  /**
   * Subscribe to /api/v1/stream/:bo via SSE. Returns an unsubscribe fn.
   * The handler is called on every event.
   */
  stream: (bo: string, onEvent: (e: { kind: 'insert'|'update'|'delete'; id: string|number }) => void) => {
    const es = new EventSource(API_PATHS.stream(bo), { withCredentials: true });
    const handler = (msg: MessageEvent) => {
      try { onEvent(JSON.parse(msg.data)); } catch { /* */ }
    };
    es.addEventListener('message', handler);
    return () => { es.removeEventListener('message', handler); es.close(); };
  },
};

export type Api = typeof api;
