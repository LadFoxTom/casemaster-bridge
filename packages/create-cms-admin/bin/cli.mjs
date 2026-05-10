#!/usr/bin/env node
/**
 * `npm create cms-admin@latest my-admin` →
 * scaffolds a fresh project with the SPA, JSON adapter wiring, an empty
 * `app/` for .cms files, and a server.mjs that runs in demo mode.
 *
 * Mirrors the shadcn philosophy: copy components into the user's repo so
 * they own the source. We don't pull a black-box framework; we pull
 * working code the user can read and modify.
 */

import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, '..', 'template');

async function main() {
  const targetArg = process.argv[2];
  if (!targetArg) { fail('Usage: npm create cms-admin@latest <project-name>'); }

  const target = resolve(process.cwd(), targetArg);
  if (await exists(target)) fail(`Refusing to overwrite ${target} — pick a fresh path.`);

  console.log(`\n  📦  scaffolding cms-admin into ${target}\n`);
  await cp(TEMPLATE, target, { recursive: true });

  // Personalize package.json with the chosen name.
  const pkgPath = join(target, 'package.json');
  if (await exists(pkgPath)) {
    const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
    pkg.name = targetArg.split('/').pop();
    await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  }

  console.log(`  ✅  done\n`);
  console.log(`  next steps:`);
  console.log(`    cd ${targetArg}`);
  console.log(`    node server.mjs                    # fast review (no install)`);
  console.log(`    npm install && npx vercel dev      # real cms-vercel + Postgres path\n`);
}

async function exists(p) { try { await stat(p); return true; } catch { return false; } }
function fail(msg) { console.error('error: ' + msg); process.exit(1); }

main().catch((e) => fail(e?.stack ?? e?.message ?? String(e)));
