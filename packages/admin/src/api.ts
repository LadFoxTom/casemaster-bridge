/**
 * Tiny typed client for the /api/v1 contract. The SPA never reaches outside
 * this module for HTTP — keeps the contract surface narrow.
 */

import type {
  BoListResponse, BoGetResponse, BoSaveResponse,
  PageActionResponse, SchemaResponse, SessionMeResponse,
} from '../../api-spec/src/schemas.js';
import { API_PATHS } from '../../api-spec/src/paths.js';

let CSRF: string | null = null;

export interface ApiClientOpts {
  /** Base URL — defaults to '' (same origin). */
  baseUrl?: string;
}

export function makeApi(opts: ApiClientOpts = {}) {
  const base = opts.baseUrl ?? '';

  async function get<T>(path: string): Promise<T> {
    const r = await fetch(base + path, { credentials: 'include' });
    if (!r.ok) throw await asError(r);
    return r.json();
  }
  async function post<T>(path: string, body?: unknown): Promise<T> {
    const r = await fetch(base + path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(CSRF ? { 'X-CSRF-Token': CSRF } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw await asError(r);
    return r.json();
  }

  return {
    schema:     () => get<SchemaResponse>(API_PATHS.schema),
    boList:     (bo: string, q: Record<string, string|number|undefined> = {}) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(q)) if (v != null && v !== '') qs.set(k, String(v));
      return get<BoListResponse>(`${API_PATHS.boList(bo)}?${qs.toString()}`);
    },
    boGet:      (bo: string, id: string|number) => get<BoGetResponse>(`${API_PATHS.boGet(bo)}?id=${encodeURIComponent(String(id))}`),
    boSave:     (bo: string, data: Record<string, unknown>) => post<BoSaveResponse>(API_PATHS.boSave(bo), data),
    boDelete:   (bo: string, id: string|number) => post<{ ok: true }>(API_PATHS.boDelete(bo), { id }),
    pageAction: (path: string, fn: string, params: Record<string, unknown>) =>
                  post<PageActionResponse>(API_PATHS.pageAction(path, fn), params),
    sessionMe:  async () => {
      const r = await get<SessionMeResponse>(API_PATHS.sessionMe);
      CSRF = r.csrf;
      return r;
    },
    sessionLogin:  (email: string, password: string) =>
                     post<{ ok: boolean; csrf: string }>(API_PATHS.sessionLogin, { email, password }),
    sessionLogout: () => post<{ ok: true }>(API_PATHS.sessionLogout),
    getPref:    (scope: string) => get<{ value: unknown }>(API_PATHS.preferences(scope)).then(r => r.value),
    putPref:    (scope: string, value: unknown) =>
                  fetch(base + API_PATHS.preferences(scope), {
                    method: 'PUT',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json', ...(CSRF ? { 'X-CSRF-Token': CSRF } : {}) },
                    body: JSON.stringify({ value }),
                  }).then(r => { if (!r.ok) throw new Error('pref save failed'); return value; }),
  };
}

async function asError(r: Response): Promise<Error> {
  try {
    const j = await r.json();
    return new Error(j?.error ?? `HTTP ${r.status}`);
  } catch {
    return new Error(`HTTP ${r.status}`);
  }
}

export type Api = ReturnType<typeof makeApi>;
