/**
 * Plain-JS port of @casemaster/api-vercel's demo provider, so the example
 * runs with `node server.mjs` (no TS toolchain). The TypeScript source of
 * record lives at packages/api-vercel/src/demo-provider.ts and matches
 * line-for-line — keep them in sync if you change one.
 */

export function createDemoProvider(seed) {
  const data = new Map();
  const bos  = new Map();
  const prefs = new Map();
  const csrf  = Math.random().toString(36).slice(2);

  for (const bo of seed.bos) {
    const { rows, ...meta } = bo;
    bos.set(bo.name, meta);
    data.set(bo.name, [...rows]);
  }

  function nextId(bo) {
    const rows = data.get(bo) ?? [];
    return rows.reduce((m, r) => Number(r.id) > m ? Number(r.id) : m, 0) + 1;
  }

  const store = {
    rows: (bo) => data.get(bo) ?? [],
    insert: (bo, row) => {
      const rows = data.get(bo) ?? [];
      const stamped = {
        ...row,
        id: row.id ?? nextId(bo),
        created_at: row.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      rows.push(stamped); data.set(bo, rows); return stamped;
    },
    update: (bo, row) => {
      const rows = data.get(bo) ?? [];
      const idx = rows.findIndex((r) => String(r.id) === String(row.id));
      if (idx === -1) throw new Error(`row not found: ${bo}#${row.id}`);
      const merged = { ...rows[idx], ...row, updated_at: new Date().toISOString() };
      rows[idx] = merged; return merged;
    },
  };

  function describe() {
    const navigation = seed.navigation ?? [];
    const pages = seed.pages ?? [];
    return Promise.resolve({
      appName: seed.appName,
      bos: [...bos.values()],
      pages,
      navigation,
      capabilities: { write: true, pageActions: !!seed.actions, rawSql: false, sse: true, auth: true },
    });
  }

  // ----- live event broadcaster (parallel to demo-provider.ts) -----
  const subs = new Map();
  function publish(e) {
    const set = subs.get(e.bo); if (!set) return;
    for (const fn of set) try { fn(e); } catch { /* ignore */ }
  }
  const events = {
    subscribe(bo, on) {
      let set = subs.get(bo); if (!set) { set = new Set(); subs.set(bo, set); }
      set.add(on);
      return () => { set.delete(on); if (set.size === 0) subs.delete(bo); };
    },
  };

  function listBo(args) {
    const all = data.get(args.bo) ?? [];
    let filtered = all;

    if (args.q) {
      const q = args.q.toLowerCase();
      const meta = bos.get(args.bo);
      const cols = meta?.groups?.label ?? meta?.groups?.list ?? [];
      filtered = filtered.filter((r) => cols.some((c) => String(r[c] ?? '').toLowerCase().includes(q)));
    }
    if (args.filters) {
      for (const [k, v] of Object.entries(args.filters)) {
        const arr = Array.isArray(v) ? v : [v];
        filtered = filtered.filter((r) => arr.some((x) => String(r[k] ?? '') === String(x)));
      }
    }
    if (args.sort) {
      const sorters = args.sort.split(',').map((s) => s.trim()).filter(Boolean);
      filtered = [...filtered].sort((a, b) => {
        for (const s of sorters) {
          const desc = s.startsWith('-'); const col = desc ? s.slice(1) : s;
          const av = a[col]; const bv = b[col];
          if (av === bv) continue;
          if (av == null) return 1;
          if (bv == null) return -1;
          const cmp = av < bv ? -1 : 1;
          return desc ? -cmp : cmp;
        }
        return 0;
      });
    }
    const total = filtered.length;
    const start = (args.page - 1) * args.pageSize;
    return Promise.resolve({ rows: filtered.slice(start, start + args.pageSize), total });
  }

  function getBo({ bo, id }) {
    const rows = data.get(bo) ?? [];
    const row = rows.find((r) => String(r.id) === String(id));
    if (!row) throw new Error(`Not found: ${bo}#${id}`);
    const meta = bos.get(bo);
    const fkLabels = {};
    if (meta) {
      for (const a of meta.attributes) {
        if (a.fk && row[a.name] != null) {
          const lbl = labelOf(a.fk, row[a.name]); if (lbl) fkLabels[a.name] = lbl;
        }
      }
    }
    return Promise.resolve({ row: { ...row }, fkLabels });
  }

  function labelOf(boName, id) {
    const target = data.get(boName)?.find((r) => String(r.id) === String(id));
    if (!target) return undefined;
    const meta = bos.get(boName);
    const cols = meta?.groups?.label ?? ['name', 'code', 'sku', 'id'];
    for (const c of cols) {
      const v = target[c]; if (v != null && String(v).length) return String(v);
    }
    return `#${id}`;
  }

  function saveBo({ bo, data: row }) {
    const isUpdate = row.id != null && (data.get(bo) ?? []).some((r) => String(r.id) === String(row.id));
    const out = isUpdate ? store.update(bo, row) : store.insert(bo, row);
    publish({ bo, kind: isUpdate ? 'update' : 'insert', id: out.id });
    return Promise.resolve({ row: out, version: 1 });
  }

  function deleteBo({ bo, id }) {
    const rows = data.get(bo) ?? [];
    const idx = rows.findIndex((r) => String(r.id) === String(id));
    if (idx === -1) throw new Error(`Not found: ${bo}#${id}`);
    rows.splice(idx, 1);
    publish({ bo, kind: 'delete', id });
    return Promise.resolve({ ok: true });
  }

  function callPageAction({ pagePath, fn, params }) {
    const key = `${pagePath}:${fn}`;
    const handler = seed.actions?.[key];
    if (!handler) {
      return Promise.resolve({
        ok: false, outputs: {},
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
    return Promise.resolve({ authenticated: true, user, perms: seed.user?.perms ?? ['*'], csrf });
  }
  function sessionLogin() { return sessionMe().then((m) => ({ ok: true, user: m.user, csrf })); }
  function sessionLogout() { return Promise.resolve({ ok: true }); }
  function getPreferences({ scope }) { return Promise.resolve(prefs.get(scope) ?? null); }
  function putPreferences({ scope, value }) { prefs.set(scope, value); return Promise.resolve(value); }

  return {
    describe, listBo, getBo, saveBo, deleteBo,
    callPageAction, sessionMe, sessionLogin, sessionLogout,
    getPreferences, putPreferences,
    events,
  };
}

/** Write an SSE stream to a Node ServerResponse for /api/v1/stream/:bo. */
export function writeSseStream(res, bo, provider) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(`: connected to ${bo}\n\n`);
  const heartbeat = setInterval(() => { try { res.write(`: ping\n\n`); } catch { /* */ } }, 25_000);
  let unsub;
  if (provider.events) {
    unsub = provider.events.subscribe(bo, (e) => {
      try { res.write(`data: ${JSON.stringify(e)}\n\n`); } catch { /* */ }
    });
  } else {
    res.write(`data: ${JSON.stringify({ kind: 'info', message: 'no broadcaster' })}\n\n`);
  }
  res.on('close', () => { clearInterval(heartbeat); unsub?.(); });
}
