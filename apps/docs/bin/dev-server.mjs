#!/usr/bin/env node
/**
 * Dev server for the docs site. Serves three URL bands from one Node
 * process so the iframe demo works without a second server:
 *
 *   /                     → cms-vercel renders /page/index
 *   /page/*               → cms-vercel renders the .cms file
 *   /admin/*              → static SPA bundle (public/admin/)
 *   /api/v1/*             → JSON adapter against the in-memory WMS seed
 *
 *   node bin/dev-server.mjs   →  http://localhost:4040
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createDemoProvider, writeSseStream } from '../_runtime/api-vercel.mjs';
import { wmsSeed } from '../_runtime/wms-seed.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PUBLIC = resolve(ROOT, 'public');
const PORT = Number(process.env.PORT ?? 4040);
const provider = createDemoProvider(wmsSeed());

// ----- locate the cms-vercel runtime --------------------------------------

// Three levels up from apps/docs/ lands at the workspace parent where the
// sibling test repo lives during local development. Keeps `node bin/dev-
// server.mjs` working without `npm install` if you already have the test
// repo checked out next to this one.
const CANDIDATES = [
  process.env.CMS_VERCEL_DIR,
  resolve(ROOT, 'node_modules', 'cms-vercel', 'dist', 'index.js'),
  resolve(ROOT, '..', '..', 'node_modules', 'cms-vercel', 'dist', 'index.js'),
  resolve(ROOT, '..', '..', '..', 'casemaster-vercel-wms-test1', 'my-cms-app',
                'packages', 'runtime', 'dist', 'index.js'),
].filter(Boolean);

let cmsHandler = null, mode = 'stub';
for (const c of CANDIDATES) {
  try {
    await stat(c);
    const m = await import(pathToFileURL(c).href);
    if (typeof m.createHandler === 'function') {
      cmsHandler = m.createHandler({ appDir: resolve(ROOT, 'app') });
      mode = `cms-vercel (from ${c})`;
      break;
    }
  } catch { /* try next */ }
}

// ----- mime + helpers -----------------------------------------------------

const MIME = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.json':'application/json','.svg':'image/svg+xml','.png':'image/png',
  '.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2',
};

async function serveStatic(req, res, url) {
  let p = url.pathname;
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
    res.statusCode = 404; return res.end('not found: ' + url.pathname);
  }
}

async function callCms(req, res) {
  if (!cmsHandler) { res.statusCode = 503; return res.end(`cms-vercel not vendored — run: npm install`); }
  let body = '';
  if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((ok) => { let buf=''; req.on('data', c=>buf+=c); req.on('end', ()=>ok(buf)); });
  }
  req.body = body;
  if (!res.status) res.status = (s) => { res.statusCode = s; return res; };
  if (!res.send)   res.send   = (b) => { res.end(b); return res; };
  return await cmsHandler(req, res);
}

async function readJson(req) {
  return new Promise((ok, fail) => {
    let buf = ''; req.on('data', c => buf += c);
    req.on('end', () => { if (!buf) return ok(null); try { ok(JSON.parse(buf)); } catch (e) { fail(e); } });
    req.on('error', fail);
  });
}

// ----- /api/v1/* JSON adapter (mirrors examples/wms-vercel/server.mjs) -----

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
        if (filters[fm[1]] != null) filters[fm[1]] = Array.isArray(filters[fm[1]]) ? [...filters[fm[1]], v] : [filters[fm[1]], v];
        else filters[fm[1]] = v;
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
    const bo = m[1]; const body = await readJson(req);
    return sendJson(200, await provider.saveBo({ bo, data: body || {} }));
  }
  if (method === 'POST' && (m = /^\/api\/v1\/bo\/(.+)\/delete$/.exec(path))) {
    const bo = m[1]; const body = await readJson(req);
    return sendJson(200, await provider.deleteBo({ bo, id: body?.id }));
  }
  if (method === 'POST' && (m = /^\/api\/v1\/page\/(.+)\/([^/]+)$/.exec(path))) {
    const r = await provider.callPageAction({ pagePath: m[1], fn: m[2], params: (await readJson(req)) || {} });
    if (!r.ok) return sendJson(400, { ok:false, error: r.error });
    return sendJson(200, { ok: true, outputs: r.outputs, message: r.message });
  }
  if (method === 'GET' && path === '/api/v1/session/me') return sendJson(200, await provider.sessionMe({}));
  if (method === 'POST' && path === '/api/v1/session/login') {
    const r = await provider.sessionLogin((await readJson(req)) || {});
    return sendJson(r.ok ? 200 : 401, r);
  }
  if (method === 'POST' && path === '/api/v1/session/logout') return sendJson(200, { ok: true });
  if ((m = /^\/api\/v1\/preferences\/(.+)$/.exec(path))) {
    if (method === 'GET') return sendJson(200, { scope: m[1], value: await provider.getPreferences({ scope: m[1] }) });
    if (method === 'PUT') {
      const body = await readJson(req);
      return sendJson(200, { scope: m[1], value: await provider.putPreferences({ scope: m[1], value: body?.value }) });
    }
  }
  if (method === 'GET' && (m = /^\/api\/v1\/stream\/(.+)$/.exec(path))) {
    return writeSseStream(res, m[1], provider);
  }
  sendJson(404, { ok:false, error: `no route for ${method} ${path}` });
}

// --------------------------------------------------------------------------

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      req.url = '/page/index';
      return await callCms(req, res);
    }
    if (url.pathname.startsWith('/api/v1/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/admin'))    return await serveStatic(req, res, url);
    if (url.pathname.startsWith('/static/'))  return await serveStatic(req, res, url);
    if (url.pathname.startsWith('/page/'))    return await callCms(req, res);
    if (url.pathname.startsWith('/maintenance/')) return await callCms(req, res);
    res.statusCode = 404; res.end('not found');
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('server error: ' + (e?.message ?? e));
  }
});

server.listen(PORT, () => {
  console.log(`\n  📘  cms-admin docs running\n`);
  console.log(`      http://localhost:${PORT}/`);
  console.log(`      runtime:    ${mode}`);
  console.log(`      live demo:  http://localhost:${PORT}/admin/\n`);
});
