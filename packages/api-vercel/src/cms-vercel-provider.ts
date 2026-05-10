/**
 * cms-vercel-backed DataProvider — the production path. Reuses cms-vercel's
 * loader, eval, and pg pool to translate JSON requests into BO operations
 * against Postgres.
 *
 * This is intentionally thin: it should look like a translation layer, not
 * a parallel runtime. Anything that requires interpreter logic (predicate
 * translation, BO persist, page-function execution) calls into cms-vercel.
 */

import type { DataProvider, ListArgs } from './provider.js';
import type { Bo, BoAttr, NavItem, PageDescriptor, SchemaResponse } from '../../api-spec/src/schemas.js';
import { createPostgresBroadcaster } from './postgres-broadcaster.js';
import type { BoEventBroadcaster } from './routes/stream.js';

interface CreateProviderOpts {
  appDir: string;
  /** Disable Postgres LISTEN/NOTIFY (e.g. to fall back to polling). */
  disableLive?: boolean;
}

export function createCmsVercelProvider(opts: CreateProviderOpts): DataProvider & { events: BoEventBroadcaster } {
  let lib: any = null;
  let registry: any = null;
  let pool: any = null;
  const prefs = new Map<string, unknown>();
  // Lazy: only constructs the listener when someone subscribes.
  const events: BoEventBroadcaster = opts.disableLive
    ? { subscribe: () => () => {} }
    : createPostgresBroadcaster();

  async function ensure() {
    if (registry) return;
    // Lazy-load — keeps the module loadable even when cms-vercel isn't installed
    // (e.g. during the demo path where the demo provider is used instead).
    lib = await import('cms-vercel').catch((e) => {
      throw new Error(
        `cms-vercel module not found. Install it (or switch to demo provider). ${e?.message ?? ''}`
      );
    });
    registry = lib.loadApp(opts.appDir);
    // Lazy DB only if needed
  }

  async function ensurePool() {
    if (pool) return pool;
    await ensure();
    // cms-vercel's db.ts isn't directly exported; pull a fresh pg pool
    // bound to the same DATABASE_URL.
    const pg = await import('pg').catch(() => null as any);
    if (!pg) throw new Error('pg not installed');
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    pool = new pg.Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: 30_000,
    });
    return pool;
  }

  async function describe() {
    await ensure();
    const bos: Bo[] = [];
    for (const [name, info] of registry.bos.entries()) {
      const attributes: BoAttr[] = [];
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
      bos.push({
        name,
        table: info.table,
        primaryKey: info.primaryKey,
        attributes,
        groups,
      });
    }

    // Pages: derive from registry.fileFns, filter to page/* keys.
    const pages: PageDescriptor[] = [];
    const seen = new Set<string>();
    for (const [file, fns] of registry.fileFns.entries()) {
      if (!file.startsWith('page/')) continue;
      const path = file.replace(/^page\//, '').replace(/\.cms$/, '');
      if (seen.has(path)) continue;
      seen.add(path);
      pages.push({
        path,
        title: prettyTitle(path),
        functions: fns,
        shape: 'custom',
      });
    }
    pages.sort((a, b) => a.path.localeCompare(b.path));

    const navigation = deriveNavigation(pages);
    const capabilities: SchemaResponse['capabilities'] = {
      write:       true,
      pageActions: true,
      rawSql:      false,
      sse:         false,
      auth:        true,
    };
    return { appName: deriveAppName(opts.appDir), bos, pages, navigation, capabilities };
  }

  async function listBo(args: ListArgs) {
    await ensure();
    const info = registry.bos.get(args.bo);
    if (!info) throw new Error(`Unknown BO: ${args.bo}`);
    const p = await ensurePool();
    const cli = await p.connect();
    try {
      const where: string[] = [];
      const params: unknown[] = [];
      let i = 0;
      if (args.filters) {
        for (const [k, v] of Object.entries(args.filters)) {
          const arr = Array.isArray(v) ? v : [v];
          const placeholders = arr.map(() => `$${++i}`).join(',');
          where.push(`"${k}" IN (${placeholders})`);
          params.push(...arr);
        }
      }
      const orderBy = parseSort(args.sort, info);
      const limit  = args.pageSize;
      const offset = (args.page - 1) * args.pageSize;
      const wsql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const totalQ = `SELECT COUNT(*) AS c FROM "${info.table}"${wsql}`;
      const totalR = await cli.query(totalQ, params);
      const rowsQ  = `SELECT * FROM "${info.table}"${wsql} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
      const rowsR  = await cli.query(rowsQ, params);
      return { rows: rowsR.rows as any[], total: Number(totalR.rows[0]?.c ?? 0) };
    } finally {
      cli.release();
    }
  }

  async function getBo({ bo, id }: { bo: string; id: string | number }) {
    await ensure();
    const info = registry.bos.get(bo);
    if (!info) throw new Error(`Unknown BO: ${bo}`);
    const p = await ensurePool();
    const cli = await p.connect();
    try {
      const r = await cli.query(`SELECT * FROM "${info.table}" WHERE "${info.primaryKey}" = $1`, [id]);
      const row = r.rows[0];
      if (!row) throw new Error(`Not found: ${bo}#${id}`);

      // FK label resolution
      const fkLabels: Record<string, string> = {};
      for (const [name, attr] of info.attributes.entries()) {
        if (!attr.foreignKey) continue;
        const v = row[attr.column];
        if (v == null) continue;
        const target = registry.bos.get(attr.foreignKey);
        if (!target) continue;
        const labelCol = target.groups.get('label')?.[0] ?? 'name';
        try {
          const tr = await cli.query(`SELECT "${labelCol}" AS lbl FROM "${target.table}" WHERE "${target.primaryKey}" = $1`, [v]);
          if (tr.rows[0]?.lbl != null) fkLabels[name] = String(tr.rows[0].lbl);
        } catch { /* ignore */ }
      }
      return { row, fkLabels };
    } finally {
      cli.release();
    }
  }

  /**
   * If `script/_cmsAdmin:save` is registered (the user installed our
   * helper .cms file), route writes through it so they participate in
   * the runtime's full BO lifecycle. Otherwise fall back to direct
   * SQL — still correct, but bypasses any audit / validator logic
   * encoded in the BO declaration.
   */
  async function saveBo({ bo, data }: { bo: string; data: Record<string, unknown> }) {
    await ensure();
    const info = registry.bos.get(bo);
    if (!info) throw new Error(`Unknown BO: ${bo}`);
    if (registry.funcs.has('script/_cmsAdmin:save')) {
      return await saveViaHelper(bo, data, info);
    }
    return await saveViaDirectSql(bo, data, info);
  }

  async function saveViaHelper(bo: string, data: Record<string, unknown>, info: any) {
    const ctx = makeCtx(`script/_cmsAdmin`);
    await lib.callFunction(ctx, 'script/_cmsAdmin:save', [bo, data]);
    const err = readGlobal(ctx, 'act_err');
    if (err && String(err).length) throw new Error(String(err));
    const row = readGlobal(ctx, 'act_row');
    if (!row) {
      // helper didn't populate — fall back so the caller still gets a row.
      return await saveViaDirectSql(bo, data, info);
    }
    return { row: row as Record<string, unknown>, version: 1 };
  }

  async function saveViaDirectSql(bo: string, data: Record<string, unknown>, info: any) {
    const p = await ensurePool();
    const cli = await p.connect();
    try {
      const id = data[info.primaryKey];
      const cols: string[] = [];
      const vals: unknown[] = [];
      const ph:   string[] = [];
      let i = 0;
      for (const [name, attr] of info.attributes.entries()) {
        if (!(name in data)) continue;
        if (name === info.primaryKey && id == null) continue;
        cols.push(`"${attr.column}"`);
        vals.push(data[name]);
        ph.push(`$${++i}`);
      }
      let row: Record<string, unknown>;
      if (id != null) {
        const setSql = cols.map((c, idx) => `${c} = $${idx + 1}`).join(', ');
        const r = await cli.query(
          `UPDATE "${info.table}" SET ${setSql} WHERE "${info.primaryKey}" = $${cols.length + 1} RETURNING *`,
          [...vals, id],
        );
        row = r.rows[0];
      } else {
        const r = await cli.query(
          `INSERT INTO "${info.table}" (${cols.join(', ')}) VALUES (${ph.join(', ')}) RETURNING *`,
          vals,
        );
        row = r.rows[0];
      }
      return { row, version: 1 };
    } finally {
      cli.release();
    }
  }

  async function deleteBo({ bo, id }: { bo: string; id: string | number }) {
    await ensure();
    const info = registry.bos.get(bo);
    if (!info) throw new Error(`Unknown BO: ${bo}`);
    if (registry.funcs.has('script/_cmsAdmin:delete')) {
      const ctx = makeCtx(`script/_cmsAdmin`);
      await lib.callFunction(ctx, 'script/_cmsAdmin:delete', [bo, id]);
      const err = readGlobal(ctx, 'act_err');
      if (err && String(err).length) throw new Error(String(err));
      return { ok: true as const };
    }
    const p = await ensurePool();
    const cli = await p.connect();
    try {
      await cli.query(`DELETE FROM "${info.table}" WHERE "${info.primaryKey}" = $1`, [id]);
      return { ok: true as const };
    } finally {
      cli.release();
    }
  }

  // ----- helpers --------------------------------------------------

  function makeCtx(currentPage: string) {
    return {
      funcs:     registry.funcs,
      resources: registry.resources,
      bos:       registry.bos,
      currentPage,
      req: { method: 'POST', url: 'http://x/internal', query: {}, body: '', headers: {} },
      res: { contentType: 'application/json', body: '', status: 200, headers: {} },
    };
  }
  function readGlobal(ctx: any, key: string) {
    const g = ctx.globals;
    if (!g) return undefined;
    if (g instanceof Map)        return g.get(key);
    if (typeof g === 'object')   return (g as any)[key];
    return undefined;
  }

  async function callPageAction({ pagePath, fn, params }: {
    pagePath: string; fn: string; params: Record<string, unknown>;
  }) {
    await ensure();
    const scoped = `page/${pagePath}:${fn}`;
    const lookup = registry.funcs.has(scoped) ? scoped : fn;
    if (!registry.funcs.has(lookup)) {
      return { ok: false, outputs: {}, error: `function not found: ${pagePath}/${fn}` };
    }
    const ctx = {
      funcs:     registry.funcs,
      resources: registry.resources,
      bos:       registry.bos,
      currentPage: `page/${pagePath}`,
      req: {
        method: 'POST',
        url: `http://x/page/${pagePath}/f/${fn}`,
        query: params as Record<string, string>,
        body: '',
        headers: {},
      },
      res: { contentType: 'application/json', body: '', status: 200, headers: {} },
    };
    await lib.callFunction(ctx, lookup, []);

    // Collect outputs: every variable starting with `act_` that the
    // function `set('//act_*', …)`. cms-vercel stores `//`-globals on
    // ctx.globals (when present) — fall back to scanning the request scope.
    const outputs: Record<string, unknown> = {};
    const globals = (ctx as any).globals ?? new Map();
    for (const [k, v] of globals.entries?.() ?? []) {
      if (typeof k === 'string' && k.startsWith('act_')) outputs[k] = v;
    }
    const message = outputs['act_msg'] != null ? String(outputs['act_msg']) : undefined;
    const error   = outputs['act_err'] && String(outputs['act_err']).length ? String(outputs['act_err']) : undefined;
    return { ok: !error, outputs, message, error };
  }

  // ----- session ----- (delegated to cms-vercel; thin pass-through)

  async function sessionMe(_args: { cookie?: string }) {
    // cms-vercel doesn't expose a public sessionMe; for now report
    // anonymous + a stable CSRF. Real apps wire qualifier.call('session/cookie:authenticate').
    return {
      authenticated: false,
      perms: [] as string[],
      csrf: 'cmsv-csrf-' + Math.random().toString(36).slice(2),
    };
  }
  async function sessionLogin(_a: any) { return { ok: false, csrf: 'csrf' }; }
  async function sessionLogout()       { return { ok: true as const }; }

  async function getPreferences({ scope }: { scope: string }) { return prefs.get(scope) ?? null; }
  async function putPreferences({ scope, value }: { scope: string; value: unknown }) {
    prefs.set(scope, value); return value;
  }

  return {
    describe, listBo, getBo, saveBo, deleteBo,
    callPageAction, sessionMe, sessionLogin, sessionLogout,
    getPreferences, putPreferences,
    events,
  };
}

function mapType(dt: string | undefined): BoAttr['type'] {
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

function parseSort(sort: string | undefined, info: any): string {
  if (!sort) return `"${info.primaryKey}" DESC`;
  const parts = sort.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => {
    const desc = p.startsWith('-');
    const col  = desc ? p.slice(1) : p;
    return `"${col.replace(/"/g, '')}"${desc ? ' DESC' : ' ASC'}`;
  }).join(', ');
}

function prettyTitle(path: string) {
  return path.split('/').pop()!.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveAppName(appDir: string) {
  return appDir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? 'cms-app';
}

function deriveNavigation(pages: PageDescriptor[]): NavItem[] {
  // Group by first path segment; surface every page as a leaf.
  const groups = new Map<string, NavItem>();
  for (const p of pages) {
    const [head, ...rest] = p.path.split('/');
    if (!groups.has(head)) groups.set(head, { label: prettyTitle(head), children: [] });
    groups.get(head)!.children!.push({
      label: rest.length ? prettyTitle(rest.join('/')) : prettyTitle(head),
      path:  `/admin/${p.path}`,
    });
  }
  return [...groups.values()];
}
