import { ok, fail, parseFilters, type RouteCtx } from './_ctx.js';

export async function handleBoList(ctx: RouteCtx) {
  const bo = ctx.params.bo;
  if (!bo) return fail(400, 'missing bo');
  const group    = ctx.query.group ?? 'list';
  const page     = Math.max(1, Number(ctx.query.page ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(ctx.query.pageSize ?? 50)));
  const sort     = ctx.query.sort;
  const q        = ctx.query.q;
  const filters  = parseFilters(ctx.query);

  const desc = await ctx.provider.describe();
  const meta = desc.bos.find((b) => b.name === bo);
  if (!meta) return fail(404, `unknown bo: ${bo}`);

  const result = await ctx.provider.listBo({ bo, group, page, pageSize, sort, q, filters });

  // The columns the SPA renders for this group.
  const columnNames = meta.groups[group] ?? meta.groups['list'] ?? meta.attributes.map((a) => a.name);
  const attrMap = new Map(meta.attributes.map((a) => [a.name, a]));
  const columns = columnNames.map((n) => attrMap.get(n)).filter(Boolean);

  return ok({
    rows:     result.rows,
    total:    result.total,
    page,
    pageSize,
    group,
    columns,
  });
}
