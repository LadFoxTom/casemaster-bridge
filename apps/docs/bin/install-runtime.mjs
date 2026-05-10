#!/usr/bin/env node
/**
 * Vendor cms-vercel into ./node_modules/cms-vercel.
 *
 * cms-vercel isn't published to npm yet (per its README — "Path A:
 * internal / pre-publish"). This script clones the upstream repo, builds
 * the runtime package, and copies just the dist + manifest into our
 * node_modules so `import { createHandler } from 'cms-vercel'` resolves.
 *
 * Idempotent — re-running upgrades cms-vercel to the latest main.
 *
 * If you'd rather pin a specific commit:
 *
 *   CMS_VERCEL_REF=<sha> node bin/install-runtime.mjs
 *
 * If your CI doesn't allow git clones, drop a built dist into
 * ./vendor/cms-vercel/ and set CMS_VERCEL_VENDOR=1 — we'll skip git.
 */

import { execSync } from 'node:child_process';
import { mkdir, cp, rm, stat, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE       = dirname(fileURLToPath(import.meta.url));
const ROOT       = resolve(HERE, '..');
const NODE_MODS  = join(ROOT, 'node_modules');
const TARGET     = join(NODE_MODS, 'cms-vercel');
const TMP        = join(ROOT, '.cms-vercel-build');
const REPO       = process.env.CMS_VERCEL_REPO ?? 'https://github.com/LadFoxTom/Casemaster-Vercel.git';
const REF        = process.env.CMS_VERCEL_REF  ?? 'main';

async function exists(p) { try { await stat(p); return true; } catch { return false; } }
function sh(cmd, opts = {}) { execSync(cmd, { stdio: 'inherit', ...opts }); }

async function main() {
  if (process.env.CMS_VERCEL_VENDOR === '1') {
    const vendor = resolve(ROOT, 'vendor', 'cms-vercel');
    if (!(await exists(vendor))) bail(`CMS_VERCEL_VENDOR=1 but ${vendor} doesn't exist`);
    console.log(`📦  vendoring cms-vercel from ${vendor}`);
    await rm(TARGET, { recursive: true, force: true });
    await mkdir(NODE_MODS, { recursive: true });
    await cp(vendor, TARGET, { recursive: true });
    return;
  }

  // Skip if already vendored AND the user hasn't asked for an upgrade.
  if (await exists(TARGET) && !process.env.CMS_VERCEL_UPGRADE) {
    console.log(`✅  cms-vercel already at ${TARGET} (set CMS_VERCEL_UPGRADE=1 to refresh)`);
    return;
  }

  // Clone fresh.
  await rm(TMP, { recursive: true, force: true });
  console.log(`🌐  cloning ${REPO}#${REF} → ${TMP}`);
  sh(`git clone --depth 1 --branch ${REF} ${REPO} "${TMP}"`);

  const runtimeDir = join(TMP, 'packages', 'runtime');
  if (!existsSync(runtimeDir)) bail(`no packages/runtime in ${REPO}`);

  // Install + build.
  console.log(`🔧  installing build deps`);
  sh(`npm install --no-audit --no-fund`, { cwd: TMP });
  console.log(`🔨  building cms-vercel`);
  sh(`npm run build`, { cwd: runtimeDir });

  // Vendor: copy dist + manifest + bin into our node_modules/cms-vercel.
  await rm(TARGET, { recursive: true, force: true });
  await mkdir(TARGET, { recursive: true });
  for (const item of ['dist', 'bin', 'package.json', 'README.md', 'API.md', 'MIGRATION.md']) {
    const src = join(runtimeDir, item);
    if (await exists(src)) await cp(src, join(TARGET, item), { recursive: true });
  }

  // pg is a peer dependency. Make sure it's installed at the project root.
  const pkgRoot = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  if (!(pkgRoot.dependencies?.pg ?? pkgRoot.devDependencies?.pg)) {
    console.log('⚠️   reminder: cms-vercel needs `pg` as a peer dep. Adding it to package.json is wise.');
  }

  await rm(TMP, { recursive: true, force: true });
  console.log(`✅  cms-vercel vendored at ${TARGET}`);
}

function bail(msg) { console.error(`error: ${msg}`); process.exit(1); }

main().catch((e) => { console.error(e?.stack ?? e?.message ?? String(e)); process.exit(1); });
