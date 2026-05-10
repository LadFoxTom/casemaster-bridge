/**
 * Classic cms-vercel handler — serves the same `.cms` source as the
 * official runtime would. Visiting /page/wms/inventory hits this; the
 * SPA at /admin/wms/inventory hits /api/v1/* instead.
 *
 * Both runtime paths read the same Postgres (when DATABASE_URL is set)
 * or the same in-memory seed (when not).
 */
import { createHandler } from 'cms-vercel';

export default createHandler({ appDir: './app' });
