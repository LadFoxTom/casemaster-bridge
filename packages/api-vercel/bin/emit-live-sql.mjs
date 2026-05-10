#!/usr/bin/env node
/**
 * Emit Postgres LISTEN/NOTIFY trigger SQL for every BO declared in the
 * user's .cms app. Pipe straight into psql:
 *
 *   npx @casemaster/api-vercel emit-live-sql --app ./app | psql $DATABASE_URL
 *
 * Re-running is safe — the trigger function uses CREATE-IF-NOT-EXISTS,
 * and the per-table trigger uses DROP IF EXISTS first.
 */

import { resolve } from 'node:path';
import { cmsBoNotifySql } from '../src/postgres-broadcaster.js';

const args = process.argv.slice(2);
const appIdx = args.indexOf('--app');
const appDir = resolve(appIdx >= 0 ? args[appIdx + 1] : './app');

const lib = await import('cms-vercel').catch((e) => {
  console.error('cms-vercel not installed:', e?.message ?? e);
  process.exit(1);
});

const reg = lib.loadApp(appDir);

console.log(`-- LISTEN/NOTIFY triggers for ${reg.bos.size} BO(s) under ${appDir}`);
for (const [name, info] of reg.bos.entries()) {
  console.log(cmsBoNotifySql({ boName: name, table: info.table, primaryKey: info.primaryKey }));
}
