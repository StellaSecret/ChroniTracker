/**
 * backup.spec.ts
 * Exercises the real JSON export/import path (file chooser + File API)
 * and v1/v2 → v3 backup migration.
 */
import { promises as fs } from 'node:fs';
import { test, expect } from './fixtures';
import {
  goToTab, waitForToast, readFromIDB, seedMeasures, seedConditionEntries, seedMedications, fakeMeasure,
} from './helpers';

async function importFile(page: any, name: string, payload: unknown): Promise<void> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('button[data-action="importJSON"]').click(),
  ]);
  await chooser.setFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

test.describe('JSON export', () => {
  test('exports all v3 collections', async ({ page }) => {
    await seedMeasures(page, [fakeMeasure({ id: 11 })]);
    await seedConditionEntries(page, [{
      id: 'bp-export', conditionId: 'hypertension', type: 'reading',
      timestamp: '2025-01-15T08:00:00.000Z', data: { systolic: 130, diastolic: 85 },
    }]);
    await seedMedications(page, [{ id: 'med-export', name: 'Metformine', active: true }]);
    await page.goto('/app/app.html');
    await goToTab(page, 'settings');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('button[data-action="exportJSON"]').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^chronitracker_backup_\d{4}-\d{2}-\d{2}\.json$/);
    const filePath = await download.path();
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    expect(data.version).toBe(3);
    expect(data.measures).toHaveLength(1);
    expect(data.conditionEntries).toHaveLength(1);
    expect(data.conditionEntries[0].conditionId).toBe('hypertension');
    expect(data.medications).toHaveLength(1);
  });
});

test.describe('JSON import', () => {
  test('real file picker imports measures and shows a toast', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'settings');
    const backup = {
      version: 3,
      measures: [fakeMeasure({ id: 99, dep: 350 }), fakeMeasure({ id: 100, dt: '2025-03-01T08:00', dep: 360 })],
      bestDEP: 480,
      reminders: [],
      profile: { sex: 'F', age: 30, height: 165 },
      conditions: { enabled: ['asthma', 'diabetes'] },
      conditionEntries: [],
      medications: [],
    };
    await importFile(page, 'backup.json', backup);
    expect(await waitForToast(page)).toContain('import');
    expect(JSON.parse(await readFromIDB(page, 'at_measures') || '[]')).toHaveLength(2);
    expect(await readFromIDB(page, 'at_bestDEP')).toBe('480');
    expect(JSON.parse(await readFromIDB(page, 'at_conditions') || '{}')).toEqual({ enabled: ['asthma', 'diabetes'] });
  });

  test('migrates a v2 asthma-only backup to v3', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'settings');
    await importFile(page, 'legacy.json', {
      version: 2,
      measures: [
        fakeMeasure({ id: 1, dt: '2025-01-10T08:00' }),
        fakeMeasure({ id: 2, dt: '2025-01-11T08:00' }),
      ],
      conditions: { enabled: ['asthma'] },
    });
    await waitForToast(page);

    const entries = JSON.parse(await readFromIDB(page, 'at_conditionEntries') || '[]');
    expect(entries).toHaveLength(2);
    expect(entries.every((e: any) => e.conditionId === 'asthma')).toBe(true);
    const conditions = JSON.parse(await readFromIDB(page, 'at_conditions') || '{}');
    expect(conditions.enabled).toEqual(['asthma', 'hypertension', 'diabetes']);
    expect(JSON.parse(await readFromIDB(page, 'at_medications') || '[]')).toEqual([]);
  });

  test('imports a v1 backup without a version field', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'settings');
    await importFile(page, 'v1.json', {
      measures: [fakeMeasure({ id: 42 })],
    });
    await waitForToast(page);
    const entries = JSON.parse(await readFromIDB(page, 'at_conditionEntries') || '[]');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(42);
  });

  test('dismissing the overwrite confirmation leaves local data intact', async ({ page }) => {
    await seedMeasures(page, [fakeMeasure({ id: 5, dep: 400 })]);
    await page.goto('/app/app.html');
    await goToTab(page, 'settings');
    page.on('dialog', d => d.dismiss());
    await importFile(page, 'other.json', {
      version: 3,
      measures: [fakeMeasure({ id: 6, dep: 500 })],
    });
    await page.waitForTimeout(300);
    const measures = JSON.parse(await readFromIDB(page, 'at_measures') || '[]');
    expect(measures).toHaveLength(1);
    expect(measures[0].id).toBe(5);
  });

  test('rejects malformed JSON with an error toast', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'settings');
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('button[data-action="importJSON"]').click(),
    ]);
    await chooser.setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
    expect(await waitForToast(page)).toBeTruthy();
    expect(JSON.parse(await readFromIDB(page, 'at_measures') || '[]')).toHaveLength(0);
  });

  test('rejects a JSON file missing the measures array', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'settings');
    await importFile(page, 'no-measures.json', { version: 3, bestDEP: 500 });
    expect(await waitForToast(page)).toBeTruthy();
    expect(JSON.parse(await readFromIDB(page, 'at_measures') || '[]')).toHaveLength(0);
  });
});
