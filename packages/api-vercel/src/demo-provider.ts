/**
 * In-memory data provider — for the demo and for tests. Loads a JSON seed
 * file produced by the example app, exposes it through the same DataProvider
 * contract the cms-vercel provider implements.
 *
 * No DB, no parser, no eval. Great for demos. Useless for real apps.
 */

import type { DataProvider, ListArgs } from './provider.js';
import type { Bo, BoAttr, NavItem, PageDescriptor, SchemaResponse } from '../../api-spec/src/schemas.js';
import type { BoEvent, BoEventBroadcaster } from './routes/stream.js';

export interface DemoSeed {
  appName: string;
  bos: Array<Bo & { rows: Array<Record<string, unknown>> }>;
  pages?: PageDescriptor[];
  navigation?: NavItem[];
  /** Page-action handlers: { 'wms/inbound:receive': fn(params, store) -> outputs } */
  actions?: Record<string, (params: Record<string, unknown>, store: DemoStore) => DemoActionResult>;
  /** Optional fixed user for sessionMe. */
  user?: { id: string | number; email?: string; name?: string; perms?: string[] };
}

export interface DemoActionResult {
  ok?: boolean;
  outputs?: Record<string, unknown>;
  message?: string;
  error?: string;
}

export interface DemoStore {
  /** Read all rows for a BO; mutate freely. */
  rows: (bo: string) => Array<Record<string, unknown>>;
  /** Insert a row and assign an auto-incremented `id`; returns it. */
  insert: (bo: string, row: Record<string, unknown>) => Record<string, unknown>;
  /** Update by id; returns the updated row. */
  update: (bo: string, row: Record<string, unknown>) => Record<string, unknown>;
}

export function createDemoProvider(seed: DemoSeed): DataProvider & { events: BoEventBroadcaster } {
  const data = new Map<string, Array<Record<string, unknown>>>();
  const bos  = new Map<string, Bo>();
  const prefs = new Map<string, unknown>();
  const csrf  = randomToken();

  // ----- live event broadcaster -----
  const subs = new Map<string, Set<(e: BoEvent) => void>>();
  function publish(e: BoEvent) {
    const set = subs.get(e.bo); if (!set) return;
    for (const fn of set) try { fn(e); } catch { /* ignore */ }
  }
  const events: BoEventBroadcaster = {
    subscribe(bo, on) {
      let set = subs.get(bo); if (!set) { set = new Set(); subs.set(bo, set); }
      set.add(on);
      return () => { set!.delete(on); if (set!.size === 0) subs.delete(bo); };
    },
  };

  for (const bo of seed.bos) {
    const { rows, ...meta } = bo;
    bos.set(bo.name, meta);
    data.set(bo.name, [...rows]);
  }

  function nextId(bo: string): number {
    const rows = data.get(bo) ?? [];
    const max  = rows.reduce((m, r) => {
      const id = Number(r['id']);
      return Number.isFinite(id) && id > m ? id : m;
    }, 0);
    return max + 1;
  }

  const store: DemoStore = {
    rows: (bo) => data.get(bo) ?? [],
    insert: (bo, row) => {
      const rows = data.get(bo) ?? [];
      const id = row['id'] ?? nextId(bo);
      const stamped = {
        ...row,
        id,
        created_at: row['created_at'] ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      rows.push(stamped);
      data.set(bo, rows);
      return stamped;
    },
    update: (bo, row) => {
      const rows = data.get(bo) ?? [];
      const idx  = rows.findIndex((r) => String(r['id']) === String(row['id']));
      if (idx === -1) throw new Error(`row not found: ${bo}#${row['id']}`);
      const merged = {
        ...rows[idx],
        ...row,
        updated_at: new Date().toISOString(),
      };
      rows[idx] = merged;
      return merged;
    },
  };

  function describe() {
    const navigation: NavItem[] = seed.navigation ?? defaultNav(seed.bos);
    const pages: PageDescriptor[] = seed.pages ?? defaultPages(seed.bos);
    const capabilities: SchemaResponse['capabilities'] = {
      write:       true,
      pageActions: !!seed.actions && Object.keys(seed.actions).length > 0,
      rawSql:      false,
      sse:         false,
      auth:        true,
    };
    return Promise.resolve({
      appName: seed.appName,
      bos: [...bos.values()],
      pages,
      navigation,
      capabilities,
    });
  }

  function listBo(args: ListArgs) {
    const all = data.get(args.bo) ?? [];
    let filtered = all;

    // free-text search across the label group's columns
    if (args.q) {
      const q = args.q.toLowerCase();
      const cols = (bos.get(args.bo)?.groups['label'] ?? bos.get(args.bo)?.groups['list'] ?? []);
      filtered = filtered.filter((r) =>
        cols.some((c) => String(r[c] ?? '').toLowerCase().includes(q))
      );
    }
    // structured filters
    if (args.filters) {
      for (const [k, v] of Object.entries(args.filters)) {
        const arr = Array.isArray(v) ? v : [v];
        filtered = filtered.filter((r) => arr.some((x) => String(r[k] ?? '') === String(x)));
      }
    }

    // sort
    if (args.sort) {
      const sorters = args.sort.split(',').map((s) => s.trim()).filter(Boolean);
      filtered = [...filtered].sort((a, b) => {
        for (const s of sorters) {
          const desc = s.startsWith('-');
          const col  = desc ? s.slice(1) : s;
          const av   = a[col]; const bv = b[col];
          if (av === bv) continue;
          if (av === undefined || av === null) return 1;
          if (bv === undefined || bv === null) return -1;
          const cmp = (av as any) < (bv as any) ? -1 : 1;
          return desc ? -cmp : cmp;
        }
        return 0;
      });
    }

    const total = filtered.length;
    const start = (args.page - 1) * args.pageSize;
    const rows  = filtered.slice(start, start + args.pageSize);
    return Promise.resolve({ rows, total });
  }

  function getBo({ bo, id }: { bo: string; id: string | number }) {
    const rows = data.get(bo) ?? [];
    const row  = rows.find((r) => String(r['id']) === String(id));
    if (!row) throw new Error(`Not found: ${bo}#${id}`);
    const meta = bos.get(bo);
    const fkLabels: Record<string, string> = {};
    if (meta) {
      for (const a of meta.attributes) {
        if (a.fk && row[a.name] != null) {
          const lbl = labelOf(a.fk, row[a.name] as string | number);
          if (lbl) fkLabels[a.name] = lbl;
        }
      }
    }
    return Promise.resolve({ row: { ...row }, fkLabels });
  }

  function labelOf(boName: string, id: string | number): string | undefined {
    const target = data.get(boName)?.find((r) => String(r['id']) === String(id));
    if (!target) return undefined;
    const meta = bos.get(boName);
    const cols = meta?.groups['label'] ?? ['name', 'code', 'sku', 'id'];
    for (const c of cols) {
      const v = target[c];
      if (v != null && String(v).length) return String(v);
    }
    return `#${id}`;
  }

  function saveBo({ bo, data: row }: { bo: string; data: Record<string, unknown> }) {
    const isUpdate = row['id'] != null && (data.get(bo) ?? []).some((r) => String(r['id']) === String(row['id']));
    const out = isUpdate ? store.update(bo, row) : store.insert(bo, row);
    publish({ bo, kind: isUpdate ? 'update' : 'insert', id: out['id'] as string | number });
    return Promise.resolve({ row: out, version: 1 });
  }

  function deleteBo({ bo, id }: { bo: string; id: string | number }) {
    const rows = data.get(bo) ?? [];
    const idx  = rows.findIndex((r) => String(r['id']) === String(id));
    if (idx === -1) throw new Error(`Not found: ${bo}#${id}`);
    rows.splice(idx, 1);
    publish({ bo, kind: 'delete', id });
    return Promise.resolve({ ok: true as const });
  }

  function callPageAction({ pagePath, fn, params }: {
    pagePath: string; fn: string; params: Record<string, unknown>;
  }) {
    const key = `${pagePath}:${fn}`;
    const handler = seed.actions?.[key];
    if (!handler) {
      return Promise.resolve({
        ok: false,
        outputs: {},
        error: `No demo action registered for ${key}. Real backends would run the .cms function.`,
      });
    }
    const r = handler(params, store);
    return Promise.resolve({
      ok: r.ok ?? !r.error,
      outputs: r.outputs ?? {},
      message: r.message,
      error:   r.error,
    });
  }

  function sessionMe() {
    const user = seed.user ?? { id: 1, email: 'demo@casemaster.dev', name: 'Demo User' };
    return Promise.resolve({
      authenticated: true,
      user,
      perms: seed.user?.perms ?? ['*'],
      csrf,
    });
  }
  function sessionLogin(_a: any) { return sessionMe().then((m) => ({ ok: true, user: m.user, csrf })); }
  function sessionLogout()       { return Promise.resolve({ ok: true as const }); }
  function getPreferences({ scope }: { scope: string }) { return Promise.resolve(prefs.get(scope) ?? null); }
  function putPreferences({ scope, value }: { scope: string; value: unknown }) {
    prefs.set(scope, value); return Promise.resolve(value);
  }

  return {
    describe, listBo, getBo, saveBo, deleteBo,
    callPageAction, sessionMe, sessionLogin, sessionLogout,
    getPreferences, putPreferences,
    events,
  };
}

function randomToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultNav(bos: Bo[]): NavItem[] {
  return bos.map((b, i) => ({
    label: b.label ?? b.name,
    path:  `/admin/bo/${b.name}`,
    order: i,
  }));
}
function defaultPages(bos: Bo[]): PageDescriptor[] {
  return bos.map((b) => ({
    path: `bo/${b.name}`,
    title: b.label ?? b.name,
    functions: ['main'],
    shape: 'list' as const,
    primaryBo: b.name,
  }));
}

/** Convenience: derive a default `groups.list` if the seed didn't specify one. */
export function attrColumns(attrs: BoAttr[], names: string[]): BoAttr[] {
  const map = new Map(attrs.map((a) => [a.name, a]));
  return names.map((n) => map.get(n)).filter(Boolean) as BoAttr[];
}
