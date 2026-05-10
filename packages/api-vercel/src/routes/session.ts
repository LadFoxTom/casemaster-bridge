import { ok, fail, withCookie, readCookie, type RouteCtx } from './_ctx.js';

export async function handleSession(ctx: RouteCtx, op: 'me' | 'login' | 'logout') {
  if (op === 'me') {
    const r = await ctx.provider.sessionMe({ cookie: readCookie(ctx) });
    return ok({
      authenticated: r.authenticated,
      user: r.user,
      perms: r.perms,
      csrf: r.csrf,
    });
  }
  if (op === 'login') {
    const body = ctx.body as { email?: string; password?: string } | undefined;
    if (!body?.email || !body?.password) return fail(400, 'missing credentials');
    const r = await ctx.provider.sessionLogin({ email: body.email, password: body.password });
    if (!r.ok) return fail(401, 'invalid credentials');
    const res = ok({ ok: true, user: r.user, csrf: r.csrf });
    return r.cookie ? withCookie(res, r.cookie) : res;
  }
  // logout
  const r = await ctx.provider.sessionLogout({ cookie: readCookie(ctx) });
  const res = ok({ ok: true });
  return r.clearCookie
    ? withCookie(res, 'cmsv_sid=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax')
    : res;
}
