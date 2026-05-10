/**
 * SSE stream of insert/update/delete events for a BO.
 *
 * Vercel: served by the standard Edge runtime; we expose a Node-stream
 * fallback so the standalone server.mjs in the example can use it too.
 *
 * The DataProvider opt-in: a provider sets `events?: BoEventBroadcaster`
 * on itself and we wire that up. Demo provider is broadcasted; the
 * cms-vercel provider will gain a Postgres `LISTEN` shim later (Roadmap
 * §5).
 */

import type { ApiResponse } from '../index.js';
import type { RouteCtx } from './_ctx.js';

export interface BoEvent { kind: 'insert' | 'update' | 'delete'; bo: string; id: string | number; }

export interface BoEventBroadcaster {
  subscribe(bo: string, on: (e: BoEvent) => void): () => void;
}

/**
 * The router can't write SSE through our normalized ApiResponse shape;
 * SSE needs a long-lived response stream. So `handleStream` returns a
 * sentinel and the framework adapter (`createJsonHandler`) checks for
 * it and writes the stream directly.
 */
export interface StreamSentinel { __sse: true; bo: string; provider: any; }

export function handleStream(ctx: RouteCtx): ApiResponse | StreamSentinel {
  const bo = ctx.params.bo;
  if (!bo) return { status: 400, headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ok:false, error:'missing bo' }) };
  return { __sse: true, bo, provider: ctx.provider } as StreamSentinel;
}

/**
 * Write SSE bytes to a Node ServerResponse. Used by both the Vercel
 * adapter and the demo server.
 */
export function writeSseStream(res: any, bo: string, provider: any) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Initial comment to flush headers and prove the stream is live.
  res.write(`: connected to ${bo}\n\n`);

  // 25-second heartbeat keeps load balancers from killing the stream.
  const heartbeat = setInterval(() => { try { res.write(`: ping\n\n`); } catch { /* socket closed */ } }, 25_000);

  const broadcaster: BoEventBroadcaster | undefined = provider.events;
  let unsub: (() => void) | undefined;
  if (broadcaster) {
    unsub = broadcaster.subscribe(bo, (e) => {
      try { res.write(`data: ${JSON.stringify(e)}\n\n`); } catch { /* socket closed */ }
    });
  } else {
    // No broadcaster — send a one-shot informational message and keep alive.
    res.write(`data: ${JSON.stringify({ kind: 'info', message: 'live updates not configured on this backend' })}\n\n`);
  }

  res.on('close', () => { clearInterval(heartbeat); unsub?.(); });
}

export function isStreamSentinel(x: unknown): x is StreamSentinel {
  return !!x && typeof x === 'object' && (x as any).__sse === true;
}
