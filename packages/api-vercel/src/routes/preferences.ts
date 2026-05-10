import { ok, fail, readCookie, type RouteCtx } from './_ctx.js';

export async function handlePreferences(ctx: RouteCtx, op: 'get' | 'put') {
  const scope = ctx.params.scope;
  if (!scope) return fail(400, 'missing scope');
  const cookie = readCookie(ctx);
  if (op === 'get') {
    const value = await ctx.provider.getPreferences({ scope, cookie });
    return ok({ scope, value });
  }
  const body = ctx.body as { value?: unknown } | undefined;
  const value = await ctx.provider.putPreferences({ scope, value: body?.value, cookie });
  return ok({ scope, value });
}
