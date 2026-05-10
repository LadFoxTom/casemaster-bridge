/**
 * @casemaster/api-vercel — JSON adapter for cms-admin.
 *
 * Public surface is one factory:
 *
 *   import { createJsonHandler } from '@casemaster/api-vercel';
 *   export default createJsonHandler({ appDir: './app' });
 *
 * Internally it uses cms-vercel's `loadApp` to parse the .cms tree, then
 * routes /api/v1/* to handlers that reuse the BO registry, the predicate
 * translator, and the eval engine. HTML rendering is bypassed entirely.
 *
 * The adapter is designed so a future @casemaster/api-dotnet plugin
 * implements the same JSON contract — the SPA can't tell the two apart.
 */

import { API_ROUTE_PATTERNS } from '../../api-spec/src/paths.js';
import type { DataProvider } from './provider.js';
import { createCmsVercelProvider } from './cms-vercel-provider.js';
import { createDemoProvider } from './demo-provider.js';
import { handleSchema } from './routes/schema.js';
import { handleBoList } from './routes/bo-list.js';
import { handleBoGet } from './routes/bo-get.js';
import { handleBoSave } from './routes/bo-save.js';
import { handleBoDelete } from './routes/bo-delete.js';
import { handlePageAction } from './routes/page-action.js';
import { handleSession } from './routes/session.js';
import { handlePreferences } from './routes/preferences.js';
import { handleStream, isStreamSentinel, writeSseStream } from './routes/stream.js';

export type { DataProvider } from './provider.js';
export { createDemoProvider } from './demo-provider.js';
export { createCmsVercelProvider } from './cms-vercel-provider.js';

export interface CreateJsonHandlerOptions {
  /**
   * Path to the .cms application root. Defaults to ./app (cwd-relative).
   * Required when using the cms-vercel data provider.
   */
  appDir?: string;
  /**
   * Pluggable data provider. Defaults to the cms-vercel-backed provider
   * when DATABASE_URL is set, otherwise falls back to the demo provider
   * if `demo` is supplied. Provide your own to back the SPA with
   * something else entirely (e.g. a C# JSON shim).
   */
  dataProvider?: DataProvider;
  /**
   * Inline seed for the demo provider — JSON shaped per docs/demo-seed.md.
   * Setting this implicitly chooses the demo provider.
   */
  demo?: unknown;
  /**
   * Override the canonical API base. Almost always /api/v1.
   */
  apiBase?: string;
}

export type ApiRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
};

export type ApiResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
};

/**
 * Framework-agnostic core. Returns a function that takes a normalized
 * request and yields a normalized response. Vercel/Express/Node-http
 * adapters wrap this.
 */
export function createJsonCore(opts: CreateJsonHandlerOptions = {}) {
  const provider = resolveProvider(opts);
  const apiBase  = opts.apiBase ?? '/api/v1';

  return async function core(req: ApiRequest): Promise<ApiResponse> {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname;
    if (!path.startsWith(apiBase)) {
      return notFound(`Not an API route: ${path}`);
    }
    const method = (req.method ?? 'GET').toUpperCase();

    for (const route of API_ROUTE_PATTERNS) {
      if (route.method !== method) continue;
      const m = route.pattern.exec(path);
      if (!m) continue;
      const params = (m.groups ?? {}) as Record<string, string>;
      const ctx = {
        req, url, params,
        provider,
        query: Object.fromEntries(url.searchParams),
        body: parseBody(req),
      };
      try {
        switch (route.name) {
          case 'schema':         return await handleSchema(ctx);
          case 'boList':         return await handleBoList(ctx);
          case 'boGet':          return await handleBoGet(ctx);
          case 'boSave':         return await handleBoSave(ctx);
          case 'boDelete':       return await handleBoDelete(ctx);
          case 'pageAction':     return await handlePageAction(ctx);
          case 'sessionMe':      return await handleSession(ctx, 'me');
          case 'sessionLogin':   return await handleSession(ctx, 'login');
          case 'sessionLogout':  return await handleSession(ctx, 'logout');
          case 'getPrefs':       return await handlePreferences(ctx, 'get');
          case 'putPrefs':       return await handlePreferences(ctx, 'put');
          case 'stream':         return handleStream(ctx) as ApiResponse;
          default:               return notFound(`Route not handled: ${route.name}`);
        }
      } catch (e: any) {
        return apiError(500, e?.message ?? String(e));
      }
    }
    return notFound(`No route for ${method} ${path}`);
  };
}

/**
 * Vercel adapter — accepts (VercelRequest, VercelResponse). Handles two
 * shapes: regular JSON responses, and the SSE streaming sentinel from
 * the /stream/:bo route.
 */
export function createJsonHandler(opts: CreateJsonHandlerOptions = {}) {
  const provider = resolveProvider(opts);
  const apiBase  = opts.apiBase ?? '/api/v1';
  const core     = createJsonCore({ ...opts, dataProvider: provider, apiBase });

  return async function handler(req: any, res: any) {
    const url = new URL(req.url ?? '/', 'http://x');
    // Intercept /stream/:bo so we can write the stream directly.
    const sm = /^\/api\/v1\/stream\/(.+?)\/?$/.exec(url.pathname);
    if (sm && (req.method ?? 'GET') === 'GET') {
      writeSseStream(res, sm[1]!, provider);
      return;
    }
    const bodyStr = await readBody(req);
    const r = await core({
      method:  req.method,
      url:     req.url ?? '/',
      headers: req.headers ?? {},
      body:    bodyStr,
    });
    if (isStreamSentinel(r as any)) {
      writeSseStream(res, (r as any).bo, (r as any).provider);
      return;
    }
    res.statusCode = (r as ApiResponse).status;
    for (const [k, v] of Object.entries((r as ApiResponse).headers)) res.setHeader(k, v);
    res.end((r as ApiResponse).body);
  };
}

// ----------------------------------------------------------------------------

function resolveProvider(opts: CreateJsonHandlerOptions): DataProvider {
  if (opts.dataProvider) return opts.dataProvider;
  if (opts.demo) return createDemoProvider(opts.demo as any);
  // Auto-detect: cms-vercel if appDir is reachable, else fail late.
  return createCmsVercelProvider({ appDir: opts.appDir ?? './app' });
}

function parseBody(req: ApiRequest): unknown {
  if (!req.body) return undefined;
  const ct = String(req.headers['content-type'] ?? '');
  if (ct.includes('application/json')) {
    try { return JSON.parse(req.body); } catch { return undefined; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    const out: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(req.body)) out[k] = v;
    return out;
  }
  return req.body;
}

async function readBody(req: any): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  if (req.readable) {
    return await new Promise<string>((resolve, reject) => {
      let buf = '';
      req.on('data', (c: Buffer) => buf += c.toString('utf8'));
      req.on('end', () => resolve(buf));
      req.on('error', reject);
    });
  }
  return '';
}

function notFound(msg: string): ApiResponse {
  return apiError(404, msg);
}
function apiError(status: number, error: string): ApiResponse {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: false, error }),
  };
}
