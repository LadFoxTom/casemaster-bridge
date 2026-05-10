/**
 * Contract-conformance test suite.
 *
 * Runs against ANY DataProvider implementation. Today we run it against
 * the demo provider; the moment a real cms-vercel-backed provider boots
 * with a known seed, the same suite runs against it. The future C#
 * adapter MUST pass every test in this file.
 *
 * Invoke:  npm --workspace @casemaster/api-vercel test
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createJsonCore } from '../src/index.js';
import { createDemoProvider } from '../src/demo-provider.js';

function fixtureSeed() {
  return {
    appName: 'TestApp',
    bos: [
      {
        name: 'test/widget',
        label: 'Widget',
        table: 'widget',
        primaryKey: 'id',
        attributes: [
          { name: 'id',   label: 'Id',   type: 'long' as const,    required: true,  readOnly: true },
          { name: 'name', label: 'Name', type: 'string' as const,  required: true },
          { name: 'qty',  label: 'Qty',  type: 'decimal' as const, required: false },
          { name: 'status', label: 'Status', type: 'string' as const, enumValues: ['ACTIVE','RETIRED'] },
        ],
        groups: { label: ['name'], list: ['id', 'name', 'qty', 'status'], description: ['name', 'qty', 'status'] },
        rows: [
          { id: 1, name: 'Alpha', qty: 5,  status: 'ACTIVE',  created_at: '2026-01-01', updated_at: '2026-01-01' },
          { id: 2, name: 'Beta',  qty: 11, status: 'ACTIVE',  created_at: '2026-01-02', updated_at: '2026-01-02' },
          { id: 3, name: 'Gamma', qty: 2,  status: 'RETIRED', created_at: '2026-01-03', updated_at: '2026-01-03' },
        ],
      },
    ],
    pages: [{ path: 'test/widget', title: 'Widgets', functions: ['main'], shape: 'list' as const }],
    navigation: [{ label: 'Widgets', path: '/admin/test/widget' }],
    actions: {
      'test/widget:bump': (params: any, store: any) => {
        const id = Number(params.id);
        const row = store.rows('test/widget').find((r: any) => r.id === id);
        if (!row) return { error: 'not found' };
        store.update('test/widget', { id, qty: Number(row.qty) + 1 });
        return { ok: true, message: `Bumped #${id}`, outputs: { act_msg: `Bumped #${id}`, act_qty: Number(row.qty) + 1 } };
      },
    },
  };
}

function call(method: string, path: string, body?: unknown) {
  const core = call._core ?? (call._core = createJsonCore({ dataProvider: createDemoProvider(fixtureSeed() as any) }));
  return core({
    method,
    url: path,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body == null ? undefined : JSON.stringify(body),
  });
}
(call as any)._core = null;

beforeAll(() => { (call as any)._core = null; });

describe('GET /api/v1/schema', () => {
  it('returns version 1 and the BOs from the seed', async () => {
    const r = await call('GET', '/api/v1/schema');
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.version).toBe(1);
    expect(body.appName).toBe('TestApp');
    expect(body.bos).toHaveLength(1);
    expect(body.bos[0].name).toBe('test/widget');
    expect(body.capabilities.write).toBe(true);
    expect(body.capabilities.pageActions).toBe(true);
  });
});

describe('GET /api/v1/bo/:bo/list', () => {
  it('paginates and respects pageSize', async () => {
    const r = await call('GET', '/api/v1/bo/test/widget/list?pageSize=2');
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.total).toBe(3);
    expect(body.rows).toHaveLength(2);
    expect(body.pageSize).toBe(2);
  });
  it('sorts ascending and descending', async () => {
    const asc  = JSON.parse((await call('GET', '/api/v1/bo/test/widget/list?sort=qty')).body);
    const desc = JSON.parse((await call('GET', '/api/v1/bo/test/widget/list?sort=-qty')).body);
    expect(asc.rows.map((r: any) => r.qty)).toEqual([2, 5, 11]);
    expect(desc.rows.map((r: any) => r.qty)).toEqual([11, 5, 2]);
  });
  it('filters by repeated filter[col] params', async () => {
    const r = await call('GET', '/api/v1/bo/test/widget/list?filter%5Bstatus%5D=ACTIVE');
    const body = JSON.parse(r.body);
    expect(body.total).toBe(2);
    expect(body.rows.every((r: any) => r.status === 'ACTIVE')).toBe(true);
  });
  it('free-text q searches across the label group', async () => {
    const r = await call('GET', '/api/v1/bo/test/widget/list?q=alph');
    const body = JSON.parse(r.body);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].name).toBe('Alpha');
  });
  it('returns ordered columns matching the requested group', async () => {
    const r = await call('GET', '/api/v1/bo/test/widget/list?group=description');
    const body = JSON.parse(r.body);
    expect(body.columns.map((c: any) => c.name)).toEqual(['name', 'qty', 'status']);
  });
});

describe('GET /api/v1/bo/:bo/get', () => {
  it('returns the row + attributes', async () => {
    const r = await call('GET', '/api/v1/bo/test/widget/get?id=1');
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.row.name).toBe('Alpha');
    expect(body.attributes.length).toBeGreaterThan(0);
  });
  it('404s on unknown id', async () => {
    const r = await call('GET', '/api/v1/bo/test/widget/get?id=999');
    expect(r.status).toBe(404);
  });
});

describe('POST /api/v1/bo/:bo/save', () => {
  it('inserts when id absent', async () => {
    const r = await call('POST', '/api/v1/bo/test/widget/save', { name: 'New', qty: 7, status: 'ACTIVE' });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.row.id).toBeDefined();
    expect(body.row.name).toBe('New');
  });
  it('updates when id present', async () => {
    const r = await call('POST', '/api/v1/bo/test/widget/save', { id: 2, qty: 99 });
    const body = JSON.parse(r.body);
    expect(body.row.qty).toBe(99);
  });
});

describe('POST /api/v1/page/:path/:fn', () => {
  it('runs a registered action and returns outputs', async () => {
    const r = await call('POST', '/api/v1/page/test/widget/bump', { id: 1 });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.ok).toBe(true);
    expect(body.outputs.act_msg).toMatch(/Bumped #1/);
  });
  it('400s on unknown action', async () => {
    const r = await call('POST', '/api/v1/page/test/widget/nope', {});
    expect(r.status).toBe(400);
  });
});

describe('GET /api/v1/session/me', () => {
  it('returns CSRF and demo user', async () => {
    const r = await call('GET', '/api/v1/session/me');
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(typeof body.csrf).toBe('string');
    expect(body.authenticated).toBe(true);
  });
});

describe('preferences round-trip', () => {
  it('PUT then GET returns the same value', async () => {
    await call('PUT', '/api/v1/preferences/ui', { value: { density: 'compact' } });
    const r = await call('GET', '/api/v1/preferences/ui');
    const body = JSON.parse(r.body);
    expect(body.value).toEqual({ density: 'compact' });
  });
});
