#!/usr/bin/env node
/**
 * Install the cms-vercel-provider helper .cms file into the user's app.
 *
 *   npx @casemaster/api-vercel install-helper [--app ./app]
 *
 * Creates app/script/_cmsAdmin.cms — a small file that exposes save and
 * delete functions going through bo.persist. Once installed, the JSON
 * adapter routes /api/v1/bo/:bo/save through this helper so writes get
 * the runtime's full BO lifecycle (audit, validators, deleteRule).
 */

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { HELPER_CMS_PATH, HELPER_CMS_SOURCE } from '../src/cms-vercel-helpers.mjs';

const args = process.argv.slice(2);
const appIdx = args.indexOf('--app');
const appDir = resolve(appIdx >= 0 ? args[appIdx + 1] : './app');
const target = resolve(appDir, HELPER_CMS_PATH);

try { await stat(appDir); }
catch { console.error(`error: app dir not found: ${appDir}`); process.exit(1); }

await mkdir(dirname(target), { recursive: true });
await writeFile(target, HELPER_CMS_SOURCE);
console.log(`✅ installed ${target}`);
console.log(`   the JSON adapter will now route writes through bo.persist.`);
