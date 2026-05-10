import { ok, fail, type RouteCtx } from './_ctx.js';

export async function handleBoGet(ctx: RouteCtx) {
  const bo = ctx.params.bo;
  const id = ctx.query.id;
  if (!bo || !id) return fail(400, 'missing bo/id');
  try {
    const r = await ctx.provider.getBo({ bo, id });
    const desc = await ctx.provider.describe();
    const meta = desc.bos.find((b) => b.name === bo);
    return ok({
      row: r.row,
      fkLabels: r.fkLabels,
      attributes: meta?.attributes ?? [],
    });
  } catch (e: any) {
    return fail(404, e?.message ?? 'not found');
  }
}
