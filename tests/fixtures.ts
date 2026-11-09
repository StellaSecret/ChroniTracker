import { test as base, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearIDB } from './helpers';

/**
 * Worker-scoped database fixture: every Playwright worker gets its own
 * IndexedDB name so parallel shards/workers never contend on seeded data.
 * Also clears the store before each test so specs start from a clean slate.
 *
 * When PW_COVERAGE=1, records Chromium JS coverage for every test into
 * coverage-e2e/ so scripts/coverage-report.mjs can merge shards.
 */
export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const dbName = `ChroniTrackDB_worker_${testInfo.workerIndex}`;
    await page.addInitScript((name) => localStorage.setItem('__TEST_DB_NAME__', name), dbName);

    // Stub third-party assets so navigation never waits on external networks.
    // Tests that need the Drive API register their own, more specific route later.
    await page.route(
      /^https:\/\/(accounts\.google\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
      (route) => route.fulfill({
        status: 200,
        contentType: route.request().url().includes('accounts.google.com')
          ? 'application/javascript'
          : 'text/css',
        body: '',
      })
    );

    const coverage = !!process.env.PW_COVERAGE;
    if (coverage) await page.coverage.startJSCoverage({ resetOnNavigation: false });

    await clearIDB(page, dbName);
    try {
      await use(page);
    } finally {
      if (coverage) {
        const entries = await page.coverage.stopJSCoverage();
        const files: Record<string, unknown> = {};
        for (const entry of entries) files[entry.url] = { functions: entry.functions };
        const dir = 'coverage-e2e';
        mkdirSync(dir, { recursive: true });
        const shard = process.env.PW_COVERAGE_SHARD || '0';
        const name = `${shard}-${testInfo.workerIndex}-${testInfo.testId}.json`;
        writeFileSync(join(dir, name), JSON.stringify({ files }));
      }
    }
  },
});

export { expect };
