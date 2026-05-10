import { ok, type RouteCtx } from './_ctx.js';

export async function handleSchema(ctx: RouteCtx) {
  const desc = await ctx.provider.describe();
  return ok({
    version: 1,
    appName: desc.appName,
    bos: desc.bos,
    pages: desc.pages,
    navigation: desc.navigation,
    capabilities: desc.capabilities,
  });
}
