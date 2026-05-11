/**
 * Diagnostic endpoint — does NOT depend on cms-vercel. Visit /api/diag
 * in production to see exactly what's bundled into the function and
 * where it lives. Used to debug the "ENOENT scandir /var/task/app" class
 * of problem.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = (() => { try { return dirname(fileURLToPath(import.meta.url)); } catch { return null; } })();

function listDir(dir: string) {
  try {
    if (!existsSync(dir)) return { exists: false };
    const entries = readdirSync(dir, { withFileTypes: true });
    return {
      exists: true,
      count: entries.length,
      entries: entries.slice(0, 60).map((e) => ({ name: e.name, type: e.isDirectory() ? 'dir' : 'file' })),
    };
  } catch (e: any) { return { error: e.message }; }
}

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const cwd = process.cwd();
  const probes: Record<string, unknown> = {
    'cwd':                              cwd,
    'here (import.meta.url)':           here,
    'cwd contents':                     listDir(cwd),
    'cwd/app':                          listDir(join(cwd, 'app')),
    'cwd/_runtime':                     listDir(join(cwd, '_runtime')),
    'cwd/seed':                         listDir(join(cwd, 'seed')),
    'cwd/node_modules/cms-vercel':      listDir(join(cwd, 'node_modules', 'cms-vercel')),
    'cwd/node_modules/cms-vercel/dist': listDir(join(cwd, 'node_modules', 'cms-vercel', 'dist')),
    '/var/task':                        listDir('/var/task'),
    '/var/task/app':                    listDir('/var/task/app'),
  };
  if (here) {
    probes['here']            = listDir(here);
    probes['here/..']         = listDir(join(here, '..'));
    probes['here/../app']     = listDir(join(here, '..', 'app'));
  }
  res.status(200)
     .setHeader('Content-Type', 'application/json')
     .send(JSON.stringify({
       env: {
         NODE_ENV:   process.env.NODE_ENV,
         VERCEL_ENV: process.env.VERCEL_ENV,
         VERCEL_REGION: process.env.VERCEL_REGION,
         hasDbUrl:   Boolean(process.env.DATABASE_URL),
       },
       probes,
     }, null, 2));
}
