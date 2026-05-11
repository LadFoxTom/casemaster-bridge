/**
 * Classic cms-vercel HTML handler for /page/* and /maintenance/*.
 * Explicit appDir so we don't depend on cms-vercel's candidate-list
 * fallback — eliminates the "ENOENT scandir /var/task/app" class of
 * problem when Vercel bundles to a path the default resolver doesn't try.
 */
import { join } from 'node:path';
import { createHandler } from 'cms-vercel';

export default createHandler({
  appDir: join(process.cwd(), 'app'),
});
