import { ok, fail, type RouteCtx } from './_ctx.js';

export async function handleBoSave(ctx: RouteCtx) {
  const bo = ctx.params.bo;
  if (!bo) return fail(400, 'missing bo');
  if (!ctx.body || typeof ctx.body !== 'object') return fail(400, 'expected JSON object body');
  try {
    const r = await ctx.provider.saveBo({ bo, data: ctx.body as any });
    return ok({ row: r.row, version: r.version });
  } catch (e: any) {
    return fail(400, e?.message ?? 'save failed');
  }
}
