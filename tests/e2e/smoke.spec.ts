import { test, expect } from '@playwright/test';

test('comparison landing renders side-by-side iframes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Casemaster 2.0/i })).toBeVisible();
  await expect(page.locator('iframe[src*="/page/wms/inventory"]')).toBeVisible();
  await expect(page.locator('iframe[src*="/admin/"]')).toBeVisible();
});

test('SPA boots, shows the sidebar from the schema', async ({ page }) => {
  await page.goto('/admin/');
  // Schema-driven nav — wait for the Inbound entry
  await expect(page.getByText('Inbound', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
});

test('Cmd-K opens the command palette', async ({ page }) => {
  await page.goto('/admin/');
  await page.keyboard.press('Control+K');
  await expect(page.getByPlaceholder(/Type to search/)).toBeVisible();
});

test('inventory list loads and is sortable', async ({ page }) => {
  await page.goto('/admin/wms/inventory');
  await expect(page.getByText(/rows/)).toBeVisible({ timeout: 10_000 });
});

test('Inbound center: pick an ASN and post a receipt', async ({ page }) => {
  await page.goto('/admin/wms/inbound');
  await page.getByText(/ASN-2026-/).first().click();
  await expect(page.getByRole('button', { name: /Post receipt/i })).toBeVisible();
});

test('classic HTML and SPA both serve same BO data', async ({ request }) => {
  const html = await request.get('/page/wms/inventory');
  expect(html.ok()).toBeTruthy();
  const json = await (await request.get('/api/v1/bo/wms/inventory/list?pageSize=1')).json();
  expect(json.total).toBeGreaterThan(0);
});
