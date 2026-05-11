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
    // Try every plausible location for the bundled .cms app/. Pick the
    // first that actually exists; let cms-vercel use it via explicit
    // appDir so its own candidate-list fallback can't pick a wrong path.
    const candidates = [
      process.env.CMS_APP_DIR,
      join(process.cwd(), 'app'),
      '/var/task/app',
      resolve(here, '..', 'app'),
      resolve(here, '..', '..', 'app'),
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
