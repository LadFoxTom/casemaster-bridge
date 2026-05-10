import { ok, fail, type RouteCtx } from './_ctx.js';

export async function handleBoDelete(ctx: RouteCtx) {
  const bo = ctx.params.bo;
  if (!bo) return fail(400, 'missing bo');
  const id = (ctx.body as any)?.id;
  if (id == null) return fail(400, 'missing id');
  try {
    await ctx.provider.deleteBo({ bo, id });
    return ok({ ok: true });
  } catch (e: any) {
    return fail(400, e?.message ?? 'delete failed');
  }
}
