import type { DataProvider } from '../provider.js';
import type { ApiRequest, ApiResponse } from '../index.js';

export interface RouteCtx {
  req: ApiRequest;
  url: URL;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  provider: DataProvider;
}

export function ok(body: unknown): ApiResponse {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function fail(status: number, error: string, fields?: Record<string, string[]>): ApiResponse {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error, ...(fields ? { fields } : {}) }),
  };
}

export function withCookie(res: ApiResponse, cookie: string): ApiResponse {
  return { ...res, headers: { ...res.headers, 'Set-Cookie': cookie } };
}

export function readCookie(ctx: RouteCtx): string | undefined {
  const raw = ctx.req.headers['cookie'];
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Pull `filter[...]` query params into a flat object. */
export function parseFilters(query: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    const m = /^filter\[([^\]]+)\]$/.exec(k);
    if (m) out[m[1]!] = v;
  }
  return out;
}
