/**
 * Classic cms-vercel HTML handler for /page/* and /maintenance/*.
 * Wrapped so any startup-time error becomes a visible JSON response
 * (so we can debug production 500s from the browser).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let inner: any = null;
let startupError: { message: string; stack?: string; phase: string; appDir?: string } | null = null;

(async function bootstrap() {
  try {
    const here = (() => { try { return dirname(fileURLToPath(import.meta.url)); } catch { return process.cwd(); } })();
    // On Vercel with a Root Directory set, cwd is the REPO root (/var/task)
    // and the function source lives at /var/task/<root-dir>/api/. So app/
    // is at ../app relative to the function, NOT at cwd/app. Try the
    // import.meta.url-relative path first.
    const candidates = [
      process.env.CMS_APP_DIR,
      resolve(here, '..', 'app'),         // /var/task/<root-dir>/app on Vercel
      resolve(here, '..', '..', 'app'),
      join(process.cwd(), 'app'),         // local dev fallback
      '/var/task/app',
    ].filter(Boolean) as string[];
    const appDir = candidates.find((c) => existsSync(c)) ?? candidates[0];
    let createHandler: any;
    try {
      ({ createHandler } = await import('cms-vercel'));
    } catch (e: any) {
      startupError = { message: e?.message ?? String(e), stack: e?.stack, phase: 'import cms-vercel', appDir };
      return;
    }
    if (!existsSync(appDir)) {
      startupError = { message: `appDir does not exist at any candidate: ${candidates.join(', ')}`, phase: 'verify appDir', appDir };
      return;
    }
    inner = createHandler({ appDir });
  } catch (e: any) {
    startupError = { message: e?.message ?? String(e), stack: e?.stack, phase: 'bootstrap' };
  }
})();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Wait for bootstrap.
  for (let i = 0; i < 50 && !inner && !startupError; i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (startupError) {
    return res.status(500).setHeader('Content-Type', 'application/json')
      .send(JSON.stringify({ ok: false, error: 'cms-vercel handler failed to start', detail: startupError }, null, 2));
  }
  if (!inner) {
    return res.status(503).setHeader('Content-Type', 'application/json')
      .send(JSON.stringify({ ok: false, error: 'cms-vercel handler not ready' }));
  }
  return inner(req, res);
}
