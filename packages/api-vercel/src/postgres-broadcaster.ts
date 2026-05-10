/**
 * Postgres LISTEN/NOTIFY broadcaster — turns database changes into
 * BoEvent broadcasts that the SSE handler streams to connected SPAs.
 *
 * How it works:
 *
 *   1. The user installs a small set of triggers (see CMS_BO_NOTIFY_SQL
 *      below) on every table they want live updates for. Each trigger
 *      fires on INSERT/UPDATE/DELETE and calls pg_notify('cms_bo:<bo>',
 *      json_build_object('kind','...','id', NEW.id)::text).
 *
 *   2. We hold ONE dedicated pg connection that issues
 *      `LISTEN "cms_bo:<bo>"` for every BO that has at least one
 *      subscriber. When the count drops to zero we UNLISTEN.
 *
 *   3. Notifications dispatch to in-process subscribers, which are the
 *      SSE writers attached to /api/v1/stream/:bo.
 *
 * Why not a separate process: §T8 of the roadmap pegs LISTEN/NOTIFY as
 * the right shape for moderate internal-tool scale. One pg client is
 * enough for hundreds of concurrent SSE listeners. Beyond ~1k concurrent
 * channels you'd front this with Redis pub/sub.
 */

import type { BoEvent, BoEventBroadcaster } from './routes/stream.js';

export interface PostgresBroadcasterOpts {
  /** Postgres connection string. Defaults to DATABASE_URL. */
  connectionString?: string;
  /** SSL options for Neon / RDS. Defaults to { rejectUnauthorized: false }. */
  ssl?: any;
  /** Channel-name template. `<bo>` is replaced with the BO name. */
  channel?: (bo: string) => string;
}

/**
 * Create a broadcaster bound to a real Postgres. Returns the
 * BoEventBroadcaster the JSON adapter expects, plus a `close()` for
 * graceful shutdown.
 *
 * Lazy: the pg client only connects on first subscribe(), so importing
 * this module is free if no one ever subscribes.
 */
export function createPostgresBroadcaster(opts: PostgresBroadcasterOpts = {}): BoEventBroadcaster & { close(): Promise<void> } {
  const channelOf = opts.channel ?? ((bo: string) => `cms_bo:${bo}`);

  const subs = new Map<string, Set<(e: BoEvent) => void>>();
  let client: any = null;
  let connecting: Promise<any> | null = null;

  async function getClient() {
    if (client) return client;
    if (connecting) return connecting;
    connecting = (async () => {
      const pg = await import('pg').catch(() => null as any);
      if (!pg) throw new Error('pg is not installed; run `npm i pg` to enable live updates');
      const url = opts.connectionString ?? process.env.DATABASE_URL;
      if (!url) throw new Error('DATABASE_URL not set');
      const c = new pg.Client({ connectionString: url, ssl: opts.ssl ?? { rejectUnauthorized: false } });
      await c.connect();
      c.on('notification', (msg: any) => {
        // channel format: "cms_bo:<bo>"; strip the prefix
        const bo = msg.channel.replace(/^cms_bo:/, '');
        let payload: any = {};
        try { payload = JSON.parse(msg.payload ?? '{}'); } catch {}
        const event: BoEvent = { bo, kind: payload.kind ?? 'update', id: payload.id ?? null };
        subs.get(bo)?.forEach((fn) => { try { fn(event); } catch { /* ignore */ } });
      });
      // If pg drops the connection, log and retry on next subscribe.
      c.on('error', (err: Error) => {
        // eslint-disable-next-line no-console
        console.error('[cms-admin] pg listen client error:', err.message);
        client = null;
      });
      client = c;
      return c;
    })();
    return connecting;
  }

  async function ensureListen(bo: string) {
    const c = await getClient();
    // pg's LISTEN identifier needs double-quoting — channel names contain `:` and `/`.
    await c.query(`LISTEN "${channelOf(bo).replace(/"/g, '""')}"`);
  }
  async function ensureUnlisten(bo: string) {
    if (!client) return;
    try { await client.query(`UNLISTEN "${channelOf(bo).replace(/"/g, '""')}"`); } catch { /* ignore */ }
  }

  return {
    subscribe(bo, on) {
      let set = subs.get(bo);
      if (!set) {
        set = new Set();
        subs.set(bo, set);
        ensureListen(bo).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[cms-admin] LISTEN ${channelOf(bo)} failed:`, err.message);
        });
      }
      set.add(on);
      return () => {
        set!.delete(on);
        if (set!.size === 0) {
          subs.delete(bo);
          ensureUnlisten(bo).catch(() => {});
        }
      };
    },
    async close() {
      if (client) { try { await client.end(); } catch {} client = null; }
    },
  };
}

/**
 * One-shot SQL the user runs in psql / their migration tool. Installs:
 *   - cms_bo_notify()             — generic trigger function
 *   - cms_bo_notify_<table>       — wrapper trigger on the table
 *
 * Call cmsBoNotifySql('inventory') once per BO you want live updates on.
 *
 * NOTIFY payloads are JSON: { kind: 'insert'|'update'|'delete', id: <pk> }
 * with `kind` matching the broadcaster's wire shape.
 */
export function cmsBoNotifySql(opts: { boName: string; table: string; primaryKey?: string }) {
  const { boName, table } = opts;
  const pk = opts.primaryKey ?? 'id';
  const channel = `cms_bo:${boName}`;
  return `-- cms-admin LISTEN/NOTIFY trigger for ${boName}
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'cms_bo_notify') THEN
    CREATE FUNCTION cms_bo_notify() RETURNS trigger AS $fn$
    DECLARE
      kind text;
      payload_id text;
    BEGIN
      kind := lower(TG_OP);  -- 'insert' | 'update' | 'delete'
      IF kind = 'delete' THEN
        EXECUTE format('SELECT ($1).%I::text', TG_ARGV[1]) INTO payload_id USING OLD;
      ELSE
        EXECUTE format('SELECT ($1).%I::text', TG_ARGV[1]) INTO payload_id USING NEW;
      END IF;
      PERFORM pg_notify(TG_ARGV[0],
        json_build_object('kind', kind, 'id', payload_id)::text);
      IF kind = 'delete' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS cms_bo_notify_${table} ON "${table}";
CREATE TRIGGER cms_bo_notify_${table}
  AFTER INSERT OR UPDATE OR DELETE ON "${table}"
  FOR EACH ROW EXECUTE FUNCTION cms_bo_notify('${channel}', '${pk}');
`;
}
