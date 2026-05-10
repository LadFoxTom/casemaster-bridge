/**
 * Standalone demo server — pure Node, no `npm install` required.
 *
 *   node server.mjs   →   http://localhost:3000
 *
 * Routes:
 *   /                 the Old vs New comparison landing page
 *   /admin/*          the cms-admin SPA (static files in public/admin)
 *   /api/v1/*         the JSON adapter (in-memory demo DataProvider)
 *   /page/*           classic CaseMaster HTML
 *                       — uses the *real* cms-vercel runtime when found
 *                         (sibling test repo or local node_modules), with
 *                         it parsing app/**​/*.cms files for real
 *                       — falls back to a Bootstrap-4 stub otherwise
 *
 * For a fully real deployment (cms-vercel + Postgres + the api-vercel
 * adapter going through bo.persist) use `npx vercel dev` instead.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { wmsSeed } from './seed/wms-seed.js';
import { createDemoProvider, writeSseStream } from './_runtime/api-vercel.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, 'public');
// If the production Vite build of @casemaster/admin exists, serve THAT
// from /admin/* in preference to the no-build CDN shell. Either build
// targets the same /api/v1 contract and works identically.
const PROD_ADMIN = resolve(HERE, '..', '..', 'packages', 'admin', 'dist');
const PORT = Number(process.env.PORT ?? 3000);

const provider = createDemoProvider(wmsSeed());

// ============================================================================
// Try to locate a real cms-vercel runtime. Order of precedence:
//   1. $CMS_VERCEL_DIR  (an explicit path to dist/index.js)
//   2. ./node_modules/cms-vercel  (if you ran `npm install` here)
//   3. ../../../casemaster-vercel-wms-test1/my-cms-app/packages/runtime/dist
//      (the sibling test repo — usually present in this monorepo)
// If found, /page/* and /maintenance/* go through the real runtime
// parsing the .cms files. Otherwise they fall back to the stub below.
// ============================================================================

const CMS_VERCEL_CANDIDATES = [
  process.env.CMS_VERCEL_DIR,
  resolve(HERE, 'node_modules', 'cms-vercel', 'dist', 'index.js'),
  resolve(HERE, '..', '..', '..', 'casemaster-vercel-wms-test1', 'my-cms-app',
          'packages', 'runtime', 'dist', 'index.js'),
].filter(Boolean);

let cmsVercelHandler = null;
let cmsVercelMode    = 'stub (no cms-vercel found)';

for (const candidate of CMS_VERCEL_CANDIDATES) {
  try {
    await stat(candidate);
    const mod = await import(pathToFileURL(candidate).href);
    if (typeof mod.createHandler === 'function') {
      cmsVercelHandler = mod.createHandler({ appDir: resolve(HERE, 'app') });
      cmsVercelMode = `real cms-vercel (from ${candidate})`;
      break;
    }
  } catch { /* try next */ }
}

// ----- minimal /api/v1 router (mirrors api-vercel core) ---------------------

async function handleApi(req, res, url) {
  const path = url.pathname;
  const method = req.method;
  const sendJson = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };

  let m;
  if (method === 'GET' && path === '/api/v1/schema') {
    const desc = await provider.describe();
    return sendJson(200, { version: 1, ...desc });
  }
  if (method === 'GET' && (m = /^\/api\/v1\/bo\/(.+)\/list$/.exec(path))) {
    const bo = m[1];
    const desc = await provider.describe();
    const meta = desc.bos.find((b) => b.name === bo);
    if (!meta) return sendJson(404, { ok:false, error: `unknown bo: ${bo}` });
    const q = Object.fromEntries(url.searchParams);
    const filters = {};
    for (const [k, v] of url.searchParams.entries()) {
      const fm = /^filter\[([^\]]+)\]$/.exec(k);
      if (fm) {
        if (filters[fm[1]] != null) {
          filters[fm[1]] = Array.isArray(filters[fm[1]]) ? [...filters[fm[1]], v] : [filters[fm[1]], v];
        } else filters[fm[1]] = v;
      }
    }
    const r = await provider.listBo({
      bo, group: q.group ?? 'list',
      page: Math.max(1, Number(q.page ?? 1)),
      pageSize: Math.min(500, Number(q.pageSize ?? 50)),
      sort: q.sort, q: q.q, filters,
    });
    const colNames = meta.groups[q.group ?? 'list'] ?? meta.groups.list ?? meta.attributes.map((a) => a.name);
    const attrMap  = new Map(meta.attributes.map((a) => [a.name, a]));
    const columns  = colNames.map((n) => attrMap.get(n)).filter(Boolean);
    return sendJson(200, { ...r, page: Number(q.page ?? 1), pageSize: Number(q.pageSize ?? 50), group: q.group ?? 'list', columns });
  }
  if (method === 'GET' && (m = /^\/api\/v1\/bo\/(.+)\/get$/.exec(path))) {
    const bo = m[1]; const id = url.searchParams.get('id');
    if (!id) return sendJson(400, { ok:false, error: 'missing id' });
    try {
      const r = await provider.getBo({ bo, id });
      const desc = await provider.describe();
      const meta = desc.bos.find((b) => b.name === bo);
      return sendJson(200, { row: r.row, fkLabels: r.fkLabels, attributes: meta?.attributes ?? [] });
    } catch (e) { return sendJson(404, { ok: false, error: e.message }); }
  }
  if (method === 'POST' && (m = /^\/api\/v1\/bo\/(.+)\/save$/.exec(path))) {
    const bo = m[1];
    const body = await readJson(req);
    const r = await provider.saveBo({ bo, data: body || {} });
    return sendJson(200, r);
  }
  if (method === 'POST' && (m = /^\/api\/v1\/bo\/(.+)\/delete$/.exec(path))) {
    const bo = m[1];
    const body = await readJson(req);
    const r = await provider.deleteBo({ bo, id: body?.id });
    return sendJson(200, r);
  }
  if (method === 'POST' && (m = /^\/api\/v1\/page\/(.+)\/([^/]+)$/.exec(path))) {
    const pagePath = m[1]; const fn = m[2];
    const body = await readJson(req);
    const r = await provider.callPageAction({ pagePath, fn, params: body || {} });
    if (!r.ok) return sendJson(400, { ok: false, error: r.error });
    return sendJson(200, { ok: true, outputs: r.outputs, message: r.message });
  }
  if (method === 'GET' && path === '/api/v1/session/me') {
    const r = await provider.sessionMe({});
    return sendJson(200, r);
  }
  if (method === 'POST' && path === '/api/v1/session/login') {
    const body = await readJson(req);
    const r = await provider.sessionLogin(body || {});
    return sendJson(r.ok ? 200 : 401, r);
  }
  if (method === 'POST' && path === '/api/v1/session/logout') {
    return sendJson(200, { ok: true });
  }
  if (method === 'GET' && (m = /^\/api\/v1\/stream\/(.+)$/.exec(path))) {
    return writeSseStream(res, m[1], provider);
  }
  if ((m = /^\/api\/v1\/preferences\/(.+)$/.exec(path))) {
    if (method === 'GET') {
      const value = await provider.getPreferences({ scope: m[1] });
      return sendJson(200, { scope: m[1], value });
    }
    if (method === 'PUT') {
      const body = await readJson(req);
      const value = await provider.putPreferences({ scope: m[1], value: body?.value });
      return sendJson(200, { scope: m[1], value });
    }
  }

  sendJson(404, { ok:false, error: `no route for ${method} ${path}` });
}

// ----- /page/* dispatch ------------------------------------------------------
//
// When a real cms-vercel runtime is loaded, every /page/* request goes
// through it — meaning your .cms files are actually parsed and rendered
// by the same engine Vercel would use in production.
//
// When it isn't (no install, no sibling test repo), we fall back to the
// hand-written Bootstrap-4 stub below so the comparison iframe still has
// something to show.
async function handlePage(req, res, url) {
  if (cmsVercelHandler) {
    return await invokeCmsVercel(req, res);
  }
  return await handleClassicPageStub(req, res, url);
}

/**
 * Adapter — cms-vercel's createHandler() expects a Vercel-shaped (req, res)
 * pair: req.body is pre-parsed; res has .status()/.send() chaining. Raw
 * Node http has neither, so we adapt before calling.
 */
async function invokeCmsVercel(req, res) {
  // 1. Drain the body so cms-vercel sees req.body as a string (it accepts
  //    either string or object; we hand it a string).
  let body = '';
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((ok, fail) => {
      let buf = '';
      req.on('data', (c) => buf += c);
      req.on('end', () => ok(buf));
      req.on('error', fail);
    });
  }
  req.body = body;

  // 2. Polyfill Vercel's response API onto the raw ServerResponse.
  if (!res.status) res.status = (s) => { res.statusCode = s; return res; };
  if (!res.send)   res.send   = (b) => { res.end(b); return res; };

  return await cmsVercelHandler(req, res);
}

async function handleClassicPageStub(req, res, url) {
  if (!/^\/page\/wms\/inventory\/?$/.test(url.pathname)) {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/plain');
    return res.end(`No classic-HTML stub for ${url.pathname}. Run \`vercel dev\` for the real cms-vercel render.`);
  }
  const r = await provider.listBo({ bo: 'wms/inventory', group: 'list', page: 1, pageSize: 50, sort: 'id' });
  const desc = await provider.describe();
  const meta = desc.bos.find((b) => b.name === 'wms/inventory');
  const cols = (meta?.groups?.list ?? []).map((n) => meta.attributes.find((a) => a.name === n)).filter(Boolean);

  const rowsHtml = r.rows.map((row) => `
    <tr>
      ${cols.map((c) => `<td>${formatHtmlCell(row[c.name])}</td>`).join('')}
    </tr>
  `).join('');

  const headHtml = cols.map((c) => `<th>${c.label || c.name}</th>`).join('');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
  <title>Inventory — classic CaseMaster render</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/css/bootstrap.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body>
  <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
    <a class="navbar-brand" href="#">cms-vercel</a>
  </nav>
  <main class="container-fluid pt-3">
    <p>
      <a href="/" class="btn btn-sm btn-outline-secondary">&larr; Comparison page</a>
      <a href="/admin/#/wms/inventory" class="btn btn-sm btn-primary">View this page in the new SPA &rarr;</a>
    </p>
    <h1 class="h3">Inventory <small class="text-muted">(classic HTML render)</small></h1>
    <p class="text-muted small">${r.total} row(s) · same data, rendered by cms-vercel with Bootstrap 4.</p>
    <table class="table table-sm table-striped table-hover">
      <thead><tr>${headHtml}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </main>
</body>
</html>`);
}

function formatHtmlCell(v) {
  if (v == null) return '<span class="text-muted">—</span>';
  return String(v).replace(/[&<>]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
}

// ----- static-files server --------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

async function serveStatic(req, res, url) {
  let p = url.pathname;

  // Prefer the Vite-built SPA when it exists. The build outputs to
  // packages/admin/dist; we map /admin/* → that directory.
  if (p.startsWith('/admin/') || p === '/admin') {
    const tail = p.replace(/^\/admin\/?/, '') || 'index.html';
    const candidate = resolve(PROD_ADMIN, tail);
    if (candidate.startsWith(PROD_ADMIN)) {
      try {
        const s = await stat(candidate);
        const fp = s.isDirectory() ? join(candidate, 'index.html') : candidate;
        const buf = await readFile(fp);
        res.setHeader('Content-Type', MIME[extname(fp).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        return res.end(buf);
      } catch { /* fall through to public/admin/* */ }
    }
    // SPA route fallback (BrowserRouter): if the path doesn't map to a real
    // file in the prod build, serve the prod index.html so the router resolves.
    if (PROD_ADMIN) {
      try {
        const idx = await readFile(join(PROD_ADMIN, 'index.html'));
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(idx);
      } catch { /* fall through */ }
    }
  }

  if (p.endsWith('/')) p = p + 'index.html';
  const fp = resolve(PUBLIC, '.' + p);
  if (!fp.startsWith(PUBLIC)) { res.statusCode = 403; return res.end('forbidden'); }
  try {
    const s = await stat(fp);
    if (s.isDirectory()) {
      const idx = join(fp, 'index.html');
      const buf = await readFile(idx);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(buf);
    }
    const buf = await readFile(fp);
    res.setHeader('Content-Type', MIME[extname(fp).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    return res.end(buf);
  } catch {
    res.statusCode = 404; res.setHeader('Content-Type', 'text/plain'); return res.end('Not found: ' + url.pathname);
  }
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = ''; req.on('data', (c) => buf += c); req.on('end', () => {
      if (!buf) return resolve(null);
      try { resolve(JSON.parse(buf)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ----------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/v1'))      return await handleApi(req, res, url);
    if (url.pathname.startsWith('/page/'))       return await handlePage(req, res, url);
    if (url.pathname.startsWith('/maintenance/'))return await handlePage(req, res, url);
    return await serveStatic(req, res, url);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain');
    res.end('Server error: ' + (e?.message ?? String(e)));
  }
});

server.listen(PORT, () => {
  console.log(`\n  🟢  cms-admin demo running\n`);
  console.log(`      Open the comparison page:  http://localhost:${PORT}/`);
  console.log(`      Open the SPA directly:     http://localhost:${PORT}/admin/`);
  console.log(`      Classic HTML render:       http://localhost:${PORT}/page/wms/inventory`);
  console.log(`      JSON schema:               http://localhost:${PORT}/api/v1/schema\n`);
  console.log(`      classic /page/* runtime:   ${cmsVercelMode}\n`);
});
