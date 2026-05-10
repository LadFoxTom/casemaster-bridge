import { ok, fail, type RouteCtx } from './_ctx.js';

export async function handlePageAction(ctx: RouteCtx) {
  const { path, fn } = ctx.params;
  if (!path || !fn) return fail(400, 'missing path/fn');
  const params = (ctx.body && typeof ctx.body === 'object' ? ctx.body : {}) as Record<string, unknown>;
  const r = await ctx.provider.callPageAction({ pagePath: path, fn, params });
  if (!r.ok) return fail(400, r.error ?? 'action failed');
  return ok({ ok: true, outputs: r.outputs, message: r.message });
}
