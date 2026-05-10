/**
 * axe-core accessibility check (§T10). Fails CI on any 'serious' or
 * 'critical' violation. WCAG 2.2 AA is the bar.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const ROUTES = [
  '/',
  '/admin/',
  '/admin/wms/inventory',
  '/admin/wms/inbound',
  '/admin/wms/asn',
];

for (const route of ROUTES) {
  test(`axe: no serious violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    // Allow client-side rendering to complete
    await page.waitForLoadState('networkidle');
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    const serious = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    if (serious.length) {
      console.log(JSON.stringify(serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), null, 2));
    }
    expect(serious).toEqual([]);
  });
}
