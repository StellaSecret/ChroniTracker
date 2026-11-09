/**
 * conditions.spec.ts
 * E2E coverage for multi-condition data entry: blood pressure (HTN),
 * glucose (diabetes), medication CRUD, detail rendering, edit/delete.
 */
import { test, expect } from './fixtures';
import {
  goToTab, waitForToast, readFromIDB, seedConditionEntries, seedMedications,
} from './helpers';

const iso = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toISOString();

async function entries(page: any): Promise<any[]> {
  return JSON.parse(await readFromIDB(page, 'at_conditionEntries') || '[]');
}

test.describe('Hypertension entry', () => {
  test('saving a valid BP reading persists a v3 condition entry', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'saisie-htn');
    await page.locator('#htnSys').fill('135');
    await page.locator('#htnDia').fill('85');
    await page.locator('#htnPulse').fill('72');
    await page.locator('#htnPos').selectOption('debout');
    await page.locator('#htnComment').fill('Après effort');
    await page.locator('button[data-action="saveHTN"]').click();
    expect(await waitForToast(page)).toContain('Tension');

    const list = await entries(page);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      conditionId: 'hypertension',
      type: 'reading',
      data: { systolic: 135, diastolic: 85, pulse: 72, position: 'debout', comment: 'Après effort' },
    });
    expect(list[0].id).toBeTruthy();
    expect(new Date(list[0].timestamp).toString()).not.toBe('Invalid Date');
    expect(await page.locator('#htnSys').inputValue()).toBe('');
    expect(await page.locator('#htnDia').inputValue()).toBe('');
  });

  test('rejects a reading without systolic/diastolic values', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'saisie-htn');
    await page.locator('#htnSys').fill('120');
    await page.locator('button[data-action="saveHTN"]').click();
    expect(await waitForToast(page)).toContain('invalide');
    expect(await entries(page)).toHaveLength(0);
  });

  test('pulse is optional and stored as null when empty', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'saisie-htn');
    await page.locator('#htnSys').fill('118');
    await page.locator('#htnDia').fill('76');
    await page.locator('button[data-action="saveHTN"]').click();
    await waitForToast(page);
    const list = await entries(page);
    expect(list[0].data.pulse).toBeNull();
  });

  test('dashboard and detail view render the latest BP reading', async ({ page }) => {
    await seedConditionEntries(page, [{
      id: 'bp-1', conditionId: 'hypertension', type: 'reading', timestamp: iso(0),
      data: { systolic: 182, diastolic: 121, pulse: 88, position: 'assis', comment: 'Urgence' },
    }]);
    await page.goto('/app/app.html');
    const panel = page.locator('[data-action="showCondition"][data-val="hypertension"]');
    await expect(panel).toContainText('182/121');
    await expect(panel).toContainText('88 bpm');
    await panel.click();
    await expect(page.locator('#conditionDetail')).toContainText('182/121');
    await expect(page.locator('#conditionDetail')).toContainText('88 bpm');
  });

  test('editing an existing HTN reading updates it in place', async ({ page }) => {
    await seedConditionEntries(page, [{
      id: 'bp-edit', conditionId: 'hypertension', type: 'reading', timestamp: iso(1),
      data: { systolic: 130, diastolic: 80, pulse: 70, position: 'assis', comment: 'old' },
    }]);
    await page.goto('/app/app.html');
    await goToTab(page, 'historique');
    await page.evaluate(() => (window as any).openEntryEdit('bp-edit'));
    await page.locator('#htnSys').fill('150');
    await page.locator('#htnDia').fill('95');
    await page.locator('#htnComment').fill('updated');
    await page.locator('button[data-action="saveHTN"]').click();
    await waitForToast(page);

    const list = await entries(page);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('bp-edit');
    expect(list[0].data).toMatchObject({ systolic: 150, diastolic: 95, comment: 'updated' });
  });

  test('deleting a condition entry removes only that entry', async ({ page }) => {
    await seedConditionEntries(page, [
      { id: 'keep', conditionId: 'hypertension', type: 'reading', timestamp: iso(1), data: { systolic: 120, diastolic: 80 } },
      { id: 'drop', conditionId: 'diabetes', type: 'reading', timestamp: iso(2), data: { glucose: 90, unit: 'mg/dL' } },
    ]);
    await page.goto('/app/app.html');
    page.on('dialog', d => d.accept());
    await page.evaluate(() => (window as any).deleteConditionEntry('drop'));
    const list = await entries(page);
    expect(list.map((e) => e.id)).toEqual(['keep']);
  });
});

test.describe('Diabetes entry', () => {
  test('saving a valid glucose reading persists it', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'saisie-diabete');
    await page.locator('#dmGlucose').fill('7.2');
    await page.locator('#dmUnit').selectOption('mmol/L');
    await page.locator('#dmContext').selectOption('postprandial');
    await page.locator('#dmInsulin').fill('4.5');
    await page.locator('#dmComment').fill('Déjeuner');
    await page.locator('button[data-action="saveDM"]').click();
    expect(await waitForToast(page)).toContain('Glycémie');

    const list = await entries(page);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      conditionId: 'diabetes',
      type: 'reading',
      data: { glucose: 7.2, unit: 'mmol/L', context: 'postprandial', insulin: 4.5, comment: 'Déjeuner' },
    });
  });

  test('rejects an empty glucose value', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'saisie-diabete');
    await page.locator('button[data-action="saveDM"]').click();
    expect(await waitForToast(page)).toContain('invalide');
    expect(await entries(page)).toHaveLength(0);
  });

  test('detail view renders glucose, context and insulin', async ({ page }) => {
    await seedConditionEntries(page, [{
      id: 'dm-1', conditionId: 'diabetes', type: 'reading', timestamp: iso(0),
      data: { glucose: 240, unit: 'mg/dL', context: 'à jeun', insulin: 8, comment: 'Hypo ressentie' },
    }]);
    await page.goto('/app/app.html');
    const panel = page.locator('[data-action="showCondition"][data-val="diabetes"]');
    await expect(panel).toContainText('240 mg/dL');
    await panel.click();
    await expect(page.locator('#conditionDetail')).toContainText('240');
    await expect(page.locator('#conditionDetail')).toContainText('à jeun');
    await expect(page.locator('#conditionDetail')).toContainText('ins 8');
  });

  test('editing a diabetes reading updates it in place', async ({ page }) => {
    await seedConditionEntries(page, [{
      id: 'dm-edit', conditionId: 'diabetes', type: 'reading', timestamp: iso(1),
      data: { glucose: 100, unit: 'mg/dL', context: 'à jeun', comment: 'old' },
    }]);
    await page.goto('/app/app.html');
    await goToTab(page, 'historique');
    await page.evaluate(() => (window as any).openEntryEdit('dm-edit'));
    await page.locator('#dmGlucose').fill('55');
    await page.locator('#dmComment').fill('updated');
    await page.locator('button[data-action="saveDM"]').click();
    await waitForToast(page);
    const list = await entries(page);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('dm-edit');
    expect(list[0].data).toMatchObject({ glucose: 55, comment: 'updated' });
  });
});

test.describe('Medications', () => {
  test('adding a medication persists and renders in the list', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'medications');
    await page.locator('#medName').fill('Metformine');
    await page.locator('#medDose').fill('500 mg');
    await page.locator('#medFreq').fill('2×/jour');
    await page.locator('#medCond').selectOption('diabetes');
    await page.locator('button[data-action="addMedication"]').click();
    expect(await waitForToast(page)).toContain('Médicament');

    const meds = JSON.parse(await readFromIDB(page, 'at_medications') || '[]');
    expect(meds).toHaveLength(1);
    expect(meds[0]).toMatchObject({ name: 'Metformine', dose: '500 mg', freq: '2×/jour', conditionId: 'diabetes', active: true });
    await expect(page.locator('#medList')).toContainText('Metformine');
    await expect(page.locator('#medList')).toContainText('500 mg');
    expect(await page.locator('#medName').inputValue()).toBe('');
  });

  test('adding a medication without a name is rejected', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'medications');
    await page.locator('#medDose').fill('10 mg');
    await page.locator('button[data-action="addMedication"]').click();
    expect(await waitForToast(page)).toContain('requis');
    expect(JSON.parse(await readFromIDB(page, 'at_medications') || '[]')).toHaveLength(0);
  });

  test('removing a medication updates storage and the list', async ({ page }) => {
    await seedMedications(page, [
      { id: 'm1', name: 'Ventoline', dose: '100 µg', freq: 'Si besoin', conditionId: 'asthma', active: true },
      { id: 'm2', name: 'Metformine', dose: '500 mg', freq: '2×/jour', conditionId: 'diabetes', active: true },
    ]);
    await page.goto('/app/app.html');
    await goToTab(page, 'medications');
    await expect(page.locator('#medList')).toContainText('Ventoline');
    await page.locator('#medList button[data-action="removeMed"]').first().click();
    const meds = JSON.parse(await readFromIDB(page, 'at_medications') || '[]');
    expect(meds).toHaveLength(1);
    expect(meds[0].name).toBe('Metformine');
    await expect(page.locator('#medList')).not.toContainText('Ventoline');
  });

  test('renders an empty state when no medication exists', async ({ page }) => {
    await page.goto('/app/app.html');
    await goToTab(page, 'medications');
    await expect(page.locator('#medList')).toContainText('Aucun médicament');
  });
});

test.describe('Demo mode', () => {
  test('?demo=true seeds simulated asthma, BP, diabetes and medication data', async ({ page }) => {
    await page.goto('/app/app.html?demo=true');
    await expect(page.locator('#appTitle')).toContainText('ChroniTracker');
    await expect(page.locator('#appTitle')).toContainText('DÉMO');
    await expect(page.locator('[data-action="showCondition"][data-val="asthma"]')).toHaveCount(1);
    await expect(page.locator('[data-action="showCondition"][data-val="hypertension"]')).toContainText('mmHg');
    await expect(page.locator('[data-action="showCondition"][data-val="diabetes"]')).toContainText('Diabète');
    await goToTab(page, 'medications');
    await expect(page.locator('#medList')).toContainText('Ventoline');
    await expect(page.locator('#medList')).toContainText('Metformine');
  });

  test('demo data is in-memory only (not persisted to IndexedDB)', async ({ page }) => {
    await page.goto('/app/app.html?demo=true');
    await expect(page.locator('[data-action="showCondition"]')).toHaveCount(3);
    expect(await entries(page)).toHaveLength(0);
  });
});
