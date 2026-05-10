import { describe, it, expect } from 'vitest';
import { cmsBoNotifySql } from '../src/postgres-broadcaster.js';

describe('cmsBoNotifySql', () => {
  it('emits a trigger that calls pg_notify on the right channel', () => {
    const sql = cmsBoNotifySql({ boName: 'wms/inventory', table: 'inventory' });
    expect(sql).toMatch(/CREATE FUNCTION cms_bo_notify/);
    expect(sql).toMatch(/cms_bo_notify_inventory/);
    expect(sql).toMatch(/'cms_bo:wms\/inventory'/);
    expect(sql).toMatch(/'id'/);
  });
  it('respects a custom primary key', () => {
    const sql = cmsBoNotifySql({ boName: 'wms/event', table: 'event', primaryKey: 'event_id' });
    expect(sql).toMatch(/'event_id'/);
  });
  it('is idempotent — re-running drops/recreates the trigger', () => {
    const sql = cmsBoNotifySql({ boName: 'foo', table: 'foo' });
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS cms_bo_notify_foo/);
    expect(sql).toMatch(/CREATE TRIGGER cms_bo_notify_foo/);
  });
});
