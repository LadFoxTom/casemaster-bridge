/**
 * Self-contained Vercel function for /api/v1/*.
 *
 * Why self-contained: this file is the deploy root's only API entry. It
 * can't import from `packages/api-vercel/*` because that's above the
 * Root Directory when Vercel builds from `examples/wms-vercel/`. The
 * demo provider is already vendored at `_runtime/api-vercel.mjs`; we
 * just inline the route matching here.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
// @ts-ignore — .mjs without types, intentional
import { createDemoProvider, writeSseStream } from '../../_runtime/api-vercel.mjs';
// @ts-ignore — .js without types
import { wmsSeed } from '../../_runtime/wms-seed.js';

// Constructed once per warm Vercel instance.
const provider = createDemoProvider(wmsSeed());

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;
  const method = (req.method ?? 'GET').toUpperCase();
  const sendJson = (status: number, body: unknown) => res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));

  try {
    let m: RegExpExecArray | null;

    if (method === 'GET' && path === '/api/v1/schema') {
      const desc = await provider.describe();
      return sendJson(200, { version: 1, ...desc });
    }

    if (method === 'GET' && (m = /^\/api\/v1\/bo\/(.+)\/list$/.exec(path))) {
      const bo = m[1];
      const desc = await provider.describe();
      const meta = desc.bos.find((b: any) => b.name === bo);
      if (!meta) return sendJson(404, { ok: false, error: `unknown bo: ${bo}` });
      const q = Object.fromEntries(url.searchParams);
      const filters: Record<string, string | string[]> = {};
      for (const [k, v] of url.searchParams.entries()) {
        const fm = /^filter\[([^\]]+)\]$/.exec(k);
        if (fm) {
          if (filters[fm[1]] != null) filters[fm[1]] = Array.isArray(filters[fm[1]]) ? [...(filters[fm[1]] as string[]), v] : [filters[fm[1]] as string, v];
          else filters[fm[1]] = v;
        }
      }
      const r = await provider.listBo({
        bo, group: q.group ?? 'list',
        page: Math.max(1, Number(q.page ?? 1)),
        pageSize: Math.min(500, Number(q.pageSize ?? 50)),
        sort: q.sort, q: q.q, filters,
      });
      const colNames = meta.groups[(q.group as string) ?? 'list'] ?? meta.groups.list ?? meta.attributes.map((a: any) => a.name);
      const attrMap = new Map(meta.attributes.map((a: any) => [a.name, a]));
      const columns = colNames.map((n: string) => attrMap.get(n)).filter(Boolean);
      return sendJson(200, { ...r, page: Number(q.page ?? 1), pageSize: Number(q.pageSize ?? 50), group: q.group ?? 'list', columns });
    }

    if (method === 'GET' && (m = /^\/api\/v1\/bo\/(.+)\/get$/.exec(path))) {
      const bo = m[1]; const id = url.searchParams.get('id');
      if (!id) return sendJson(400, { ok: false, error: 'missing id' });
      try {
        const r = await provider.getBo({ bo, id });
        const desc = await provider.describe();
        const meta = desc.bos.find((b: any) => b.name === bo);
        return sendJson(200, { row: r.row, fkLabels: r.fkLabels, attributes: meta?.attributes ?? [] });
      } catch (e: any) { return sendJson(404, { ok: false, error: e.message }); }
    }

    if (method === 'POST' && (m = /^\/api\/v1\/bo\/(.+)\/save$/.exec(path))) {
      const bo = m[1]; const body = await readBody(req);
      return sendJson(200, await provider.saveBo({ bo, data: body || {} }));
    }

    if (method === 'POST' && (m = /^\/api\/v1\/bo\/(.+)\/delete$/.exec(path))) {
      const bo = m[1]; const body: any = await readBody(req);
      return sendJson(200, await provider.deleteBo({ bo, id: body?.id }));
    }

    if (method === 'POST' && (m = /^\/api\/v1\/page\/(.+)\/([^/]+)$/.exec(path))) {
      const r = await provider.callPageAction({ pagePath: m[1], fn: m[2], params: (await readBody(req)) || {} });
      if (!r.ok) return sendJson(400, { ok: false, error: r.error });
      return sendJson(200, { ok: true, outputs: r.outputs, message: r.message });
    }

    if (method === 'GET' && path === '/api/v1/session/me') return sendJson(200, await provider.sessionMe({}));
    if (method === 'POST' && path === '/api/v1/session/login') {
      const r = await provider.sessionLogin((await readBody(req)) || {});
      return sendJson(r.ok ? 200 : 401, r);
    }
    if (method === 'POST' && path === '/api/v1/session/logout') return sendJson(200, { ok: true });

    if ((m = /^\/api\/v1\/preferences\/(.+)$/.exec(path))) {
      if (method === 'GET') return sendJson(200, { scope: m[1], value: await provider.getPreferences({ scope: m[1] }) });
      if (method === 'PUT') {
        const body: any = await readBody(req);
        return sendJson(200, { scope: m[1], value: await provider.putPreferences({ scope: m[1], value: body?.value }) });
      }
    }

    if (method === 'GET' && (m = /^\/api\/v1\/stream\/(.+)$/.exec(path))) {
      return writeSseStream(res, m[1], provider);
    }

    return sendJson(404, { ok: false, error: `no route for ${method} ${path}` });
  } catch (e: any) {
    return sendJson(500, { ok: false, error: e?.message ?? String(e) });
  }
}

async function readBody(req: VercelRequest): Promise<any> {
  // Vercel parses JSON bodies for us when Content-Type is application/json.
  if (req.body != null) return req.body;
  return new Promise((ok, fail) => {
    let buf = '';
    req.on('data', (c: Buffer) => buf += c);
    req.on('end', () => { if (!buf) return ok(null); try { ok(JSON.parse(buf)); } catch { ok(buf); } });
    req.on('error', fail);
  });
}
