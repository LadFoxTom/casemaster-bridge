/**
 * The JSON API entry point for the SPA. Vercel's rewrite (vercel.json)
 * forwards every /api/v1/* request here. The adapter handles routing.
 */
import { createJsonHandler, createDemoProvider } from '../../../../packages/api-vercel/src/index.js';
import { wmsSeed } from '../../seed/wms-seed.js';

export default createJsonHandler({
  appDir: './app',
  // The example ships with a demo-mode default so reviewers can run it
  // without DATABASE_URL. Remove `dataProvider` to use the real cms-vercel
  // backend (which then needs the env var).
  dataProvider: createDemoProvider(wmsSeed()),
});
