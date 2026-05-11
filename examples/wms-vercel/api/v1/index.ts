/**
 * /api/v1/* JSON handler for the REAL WMS deployment.
 *
 * Two modes, picked automatically:
 *
 *   1. DATABASE_URL is set → real mode.
 *        Schema is parsed from the .cms BO declarations via cms-vercel
 *        (164 BOs in the sidebar). Data comes from Postgres via pg.
 *        Writes route through bo.persist when script/_cmsAdmin.cms is
 *        installed (it is); otherwise direct SQL.
 *
 *   2. DATABASE_URL missing → schema-only fallback.
 *        cms-vercel still loads the .cms files so /api/v1/schema works
 *        and the SPA's sidebar populates with the full 164-BO tree.
 *        Any data-fetch route returns a clear "database not configured"
 *        error, which the SPA renders as an empty-state in the data
 *        grid. Acceptable for a quick peek; useless for actually using
 *        the SPA. Set DATABASE_URL in the Vercel project to fix.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { join } from 'node:path';
// @ts-ignore — vendored SSE writer
import { writeSseStream } from '../../_runtime/api-vercel.mjs';

// ---------- bootstrap, runs once per warm Vercel instance ----------

let bootP: Promise<{ lib: any; registry: any; pool: any | null }> | null = null;

async function boot() {
  if (bootP) return bootP;
  bootP = (async () => {
    const lib = await import('cms-vercel');
    const appDir = process.env.CMS_APP_DIR ?? join(process.cwd(), 'app');
    const registry = lib.loadApp(appDir);
    let pool: any = null;
    if (process.env.DATABASE_URL) {
      const pg = await import('pg').catch(() => null as any);
      if (pg) {
        pool = new pg.Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false },
          max: 5,
          idleTimeoutMillis: 60_000,
          connectionTimeoutMillis: 30_000,
        });
      }
    }
    return { lib, registry, pool };
  })();
  return bootP;
}

// ---------- the handler ----------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sendJson = (status: number, body: unknown) =>
    res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));

  try {
    const { lib, registry, pool } = await boot();

    const rawUrl = req.url ?? '/';
    const tmp = new URL(rawUrl, 'http://x');
    const proxied = tmp.searchParams.get('_p') ?? rawUrl;
    tmp.searchParams.delete('_p');
    const remainingQs = tmp.searchParams.toString();
    const url = new URL(proxied + (remainingQs ? `?${remainingQs}` : ''), 'http://x');
    const path = url.pathname;
    const method = (req.method ?? 'GET').toUpperCase();

    let m: RegExpExecArray | null;

    if (method === 'GET' && path === '/api/v1/schema') {
      return sendJson(200, buildSchema(registry, !!pool));
    }

    // Everything below this point needs Postgres.
    if (!pool && method !== 'GET') return sendJson(503, dbErr());
    if (method === 'GET' && path === '/api/v1/session/me') {
      return sendJson(200, { authenticated: true, user: { id: 1, name: 'demo', email: 'demo@casemaster.io' }, perms: ['*'], csrf: 'csrf-stub' });
    }

    if (method === 'GET' && (m = /^\/api\/v1\/bo\/(.+)\/list$/.exec(path))) {
      if (!pool) return sendJson(503, dbErr());
      const bo = m[1];
      const info = registry.bos.get(bo);
      if (!info) return sendJson(404, { ok: false, error: `unknown bo: ${bo}` });
      return sendJson(200, await boList(pool, registry, bo, info, url.searchParams));
    }

    if (method === 'GET' && (m = /^\/api\/v1\/bo\/(.+)\/get$/.exec(path))) {
      if (!pool) return sendJson(503, dbErr());
      const bo = m[1]; const id = url.searchParams.get('id');
      const info = registry.bos.get(bo);
      if (!info) return sendJson(404, { ok: false, error: `unknown bo: ${bo}` });
      if (!id) return sendJson(400, { ok: false, error: 'missing id' });
      return sendJson(200, await boGet(pool, registry, bo, info, id));
    }

    if (method === 'POST' && (m = /^\/api\/v1\/bo\/(.+)\/save$/.exec(path))) {
      if (!pool) return sendJson(503, dbErr());
      const bo = m[1];
      const info = registry.bos.get(bo);
      if (!info) return sendJson(404, { ok: false, error: `unknown bo: ${bo}` });
      const body = await readBody(req);
      return sendJson(200, await boSave(pool, lib, registry, bo, info, body || {}));
    }

    if (method === 'POST' && (m = /^\/api\/v1\/bo\/(.+)\/delete$/.exec(path))) {
      if (!pool) return sendJson(503, dbErr());
      const bo = m[1];
      const info = registry.bos.get(bo);
      if (!info) return sendJson(404, { ok: false, error: `unknown bo: ${bo}` });
      const body: any = await readBody(req);
      if (body?.id == null) return sendJson(400, { ok: false, error: 'missing id' });
      await pool.query(`DELETE FROM "${info.table}" WHERE "${info.primaryKey}" = $1`, [body.id]);
      return sendJson(200, { ok: true });
    }

    if (method === 'POST' && (m = /^\/api\/v1\/page\/(.+)\/([^/]+)$/.exec(path))) {
      if (!pool) return sendJson(503, dbErr());
      return sendJson(200, await callPageAction(lib, registry, m[1], m[2], (await readBody(req)) || {}));
    }

    if (method === 'GET' && (m = /^\/api\/v1\/stream\/(.+)$/.exec(path))) {
      // Stub provider with no-op broadcaster — keeps the SSE socket alive,
      // doesn't push events. Postgres LISTEN/NOTIFY wiring is a follow-up
      // (see docs/architecture.md).
      return writeSseStream(res, m[1], { events: undefined });
    }

    return sendJson(404, { ok: false, error: `no route for ${method} ${path}` });
  } catch (e: any) {
    return sendJson(500, { ok: false, error: e?.message ?? String(e), stack: process.env.NODE_ENV !== 'production' ? e?.stack : undefined });
  }
}

function dbErr() {
  return { ok: false, error: 'DATABASE_URL not configured on this Vercel project. Set it in Settings → Environment Variables, redeploy, and this endpoint will work. See README for the Neon setup steps.' };
}

// ---------- schema builder ----------

function buildSchema(registry: any, hasDb: boolean) {
  const bos: any[] = [];
  for (const [name, info] of registry.bos.entries()) {
    const attributes: any[] = [];
    for (const [attrName, a] of info.attributes.entries()) {
      attributes.push({
        name: attrName,
        label: a.label,
        type: mapType(a.dataType),
        required: false,
        readOnly: attrName === info.primaryKey,
        fk: a.foreignKey,
      });
    }
    const groups: Record<string, string[]> = {};
    for (const [g, cols] of info.groups.entries()) groups[g] = cols;
    bos.push({ name, table: info.table, primaryKey: info.primaryKey, attributes, groups, label: prettyTitle(name.split('/').pop() || name) });
  }
  const pages: any[] = [];
  const seen = new Set<string>();
  for (const [file] of registry.fileFns.entries()) {
    if (!file.startsWith('page/')) continue;
    const path = file.replace(/^page\//, '').replace(/\.cms$/, '');
    if (seen.has(path)) continue; seen.add(path);
    pages.push({ path, title: prettyTitle(path.split('/').pop()!), functions: registry.fileFns.get(file) ?? [], shape: 'custom' });
  }
  pages.sort((a, b) => a.path.localeCompare(b.path));
  return {
    version: 1,
    appName: 'Casemaster-WMS',
    bos,
    pages,
    navigation: deriveNavigation(pages, bos),
    capabilities: { write: hasDb, pageActions: hasDb, rawSql: false, sse: false, auth: true },
  };
}

function mapType(dt: string | undefined): string {
  if (!dt) return 'string';
  const lc = dt.toLowerCase();
  if (lc.includes('long') || lc.includes('int')) return 'long';
  if (lc.includes('decimal') || lc.includes('numeric') || lc.includes('double')) return 'decimal';
  if (lc.includes('bool')) return 'boolean';
  if (lc.includes('timestamp')) return 'timestamp';
  if (lc.includes('date')) return 'date';
  if (lc.includes('json')) return 'json';
  return 'string';
}
function prettyTitle(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveNavigation(pages: any[], bos: any[]) {
  // Group pages by first segment under their root path.
  const groups = new Map<string, any>();
  for (const p of pages) {
    const segs = p.path.split('/');
    const head = segs.length > 1 ? segs[0] : '_';
    if (!groups.has(head)) groups.set(head, { label: prettyTitle(head === '_' ? 'pages' : head), children: [] });
    groups.get(head).children.push({ label: p.title, path: `/admin/${p.path}` });
  }
  // Also surface BOs in a top-level Data group.
  groups.set('_data', {
    label: 'Data',
    children: bos.slice(0, 30).map((b: any) => ({ label: b.label, path: `/admin/${b.name}` })),
  });
  return [...groups.values()];
}

// ---------- BO list ----------

async function boList(pool: any, registry: any, bo: string, info: any, q: URLSearchParams) {
  const group = q.get('group') ?? 'list';
  const page = Math.max(1, Number(q.get('page') ?? 1));
  const pageSize = Math.min(500, Number(q.get('pageSize') ?? 50));
  const sort = q.get('sort') ?? `-${info.primaryKey}`;

  const where: string[] = [];
  const params: unknown[] = [];
  let i = 0;
  for (const [k, v] of q.entries()) {
    const fm = /^filter\[([^\]]+)\]$/.exec(k);
    if (fm) {
      const ph = `$${++i}`;
      where.push(`"${fm[1].replace(/"/g, '')}" = ${ph}`);
      params.push(v);
    }
  }
  const wsql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const sortSql = parseSort(sort, info);

  const cli = await pool.connect();
  try {
    const totalR = await cli.query(`SELECT COUNT(*) AS c FROM "${info.table}"${wsql}`, params);
    const rowsR = await cli.query(`SELECT * FROM "${info.table}"${wsql} ORDER BY ${sortSql} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params);
    const colNames = info.groups.get(group) ?? info.groups.get('list') ?? [...info.attributes.keys()];
    const columns = colNames.map((n: string) => {
      const a = info.attributes.get(n); if (!a) return null;
      return { name: n, label: a.label, type: mapType(a.dataType), fk: a.foreignKey };
    }).filter(Boolean);
    return { rows: rowsR.rows, total: Number(totalR.rows[0]?.c ?? 0), page, pageSize, group, columns };
  } finally {
    cli.release();
  }
}

function parseSort(s: string, info: any): string {
  return s.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const desc = p.startsWith('-');
    const col = (desc ? p.slice(1) : p).replace(/"/g, '');
    return `"${col}"${desc ? ' DESC' : ' ASC'}`;
  }).join(', ') || `"${info.primaryKey}" DESC`;
}

// ---------- BO get ----------

async function boGet(pool: any, registry: any, bo: string, info: any, id: string) {
  const cli = await pool.connect();
  try {
    const r = await cli.query(`SELECT * FROM "${info.table}" WHERE "${info.primaryKey}" = $1`, [id]);
    const row = r.rows[0];
    if (!row) throw new Error(`Not found: ${bo}#${id}`);

    // Best-effort FK label resolution
    const fkLabels: Record<string, string> = {};
    for (const [name, attr] of info.attributes.entries()) {
      if (!attr.foreignKey || row[attr.column] == null) continue;
      const target = registry.bos.get(attr.foreignKey);
      if (!target) continue;
      const labelCol = target.groups.get('label')?.[0] ?? 'name';
      try {
        const tr = await cli.query(`SELECT "${labelCol}" AS lbl FROM "${target.table}" WHERE "${target.primaryKey}" = $1`, [row[attr.column]]);
        if (tr.rows[0]?.lbl != null) fkLabels[name] = String(tr.rows[0].lbl);
      } catch { /* skip */ }
    }
    const attributes = [...info.attributes.entries()].map(([name, a]) => ({
      name, label: a.label, type: mapType(a.dataType), fk: a.foreignKey, readOnly: name === info.primaryKey,
    }));
    return { row, fkLabels, attributes };
  } finally {
    cli.release();
  }
}

// ---------- BO save (prefer script/_cmsAdmin:save, fall back to direct SQL) ----------

async function boSave(pool: any, lib: any, registry: any, bo: string, info: any, data: Record<string, unknown>) {
  if (registry.funcs.has('script/_cmsAdmin:save')) {
    const ctx = makeCtx(registry, `script/_cmsAdmin`);
    await lib.callFunction(ctx, 'script/_cmsAdmin:save', [bo, data]);
    const err = readGlobal(ctx, 'act_err');
    if (err && String(err).length) throw new Error(String(err));
    const row = readGlobal(ctx, 'act_row');
    if (row) return { row, version: 1 };
    // helper didn't populate; fall through to direct SQL
  }
  const cli = await pool.connect();
  try {
    const id = data[info.primaryKey];
    const cols: string[] = []; const vals: unknown[] = []; const ph: string[] = [];
    let i = 0;
    for (const [name, attr] of info.attributes.entries()) {
      if (!(name in data)) continue;
      if (name === info.primaryKey && id == null) continue;
      cols.push(`"${attr.column}"`); vals.push(data[name]); ph.push(`$${++i}`);
    }
    let row: any;
    if (id != null) {
      const setSql = cols.map((c, idx) => `${c} = $${idx + 1}`).join(', ');
      const r = await cli.query(`UPDATE "${info.table}" SET ${setSql} WHERE "${info.primaryKey}" = $${cols.length + 1} RETURNING *`, [...vals, id]);
      row = r.rows[0];
    } else {
      const r = await cli.query(`INSERT INTO "${info.table}" (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`, vals);
      row = r.rows[0];
    }
    return { row, version: 1 };
  } finally {
    cli.release();
  }
}

// ---------- page actions ----------

async function callPageAction(lib: any, registry: any, pagePath: string, fn: string, params: Record<string, unknown>) {
  const scoped = `page/${pagePath}:${fn}`;
  const lookup = registry.funcs.has(scoped) ? scoped : fn;
  if (!registry.funcs.has(lookup)) return { ok: false, outputs: {}, error: `function not found: ${pagePath}/${fn}` };
  const ctx = makeCtx(registry, `page/${pagePath}`);
  ctx.req.query = params as any;
  await lib.callFunction(ctx, lookup, []);
  const outputs: Record<string, unknown> = {};
  const globals = (ctx as any).globals;
  if (globals && typeof globals.entries === 'function') {
    for (const [k, v] of globals.entries()) {
      if (typeof k === 'string' && k.startsWith('act_')) outputs[k] = v;
    }
  }
  const message = outputs['act_msg'] != null ? String(outputs['act_msg']) : undefined;
  const error = outputs['act_err'] && String(outputs['act_err']).length ? String(outputs['act_err']) : undefined;
  return { ok: !error, outputs, message, error };
}

function makeCtx(registry: any, currentPage: string) {
  return {
    funcs: registry.funcs,
    resources: registry.resources,
    bos: registry.bos,
    currentPage,
    req: { method: 'POST', url: `http://x/${currentPage}`, query: {} as Record<string, string>, body: '', headers: {} as Record<string, string | undefined> },
    res: { contentType: 'application/json', body: '', status: 200, headers: {} as Record<string, string> },
  };
}
function readGlobal(ctx: any, key: string) {
  const g = ctx.globals;
  if (!g) return undefined;
  if (g instanceof Map) return g.get(key);
  if (typeof g === 'object') return (g as any)[key];
  return undefined;
}

async function readBody(req: VercelRequest): Promise<any> {
  if (req.body != null) return req.body;
  return new Promise((ok, fail) => {
    let buf = '';
    req.on('data', (c: Buffer) => buf += c);
    req.on('end', () => { if (!buf) return ok(null); try { ok(JSON.parse(buf)); } catch { ok(buf); } });
    req.on('error', fail);
  });
}
