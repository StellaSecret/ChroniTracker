/**
 * drive.spec.ts
 * Google Drive sync against a mocked Drive REST API. Exercises upload
 * create/update/recreate and download + backup migration.
 */
import { test, expect } from './fixtures';
import { seedDriveToken, readFromIDB, seedMeasures, fakeMeasure } from './helpers';

type Req = { url: string; method: string; body: string };

async function mockDrive(page: any, handler: (req: Req) => { status: number; body?: any } | Promise<{ status: number; body?: any }>) {
  const requests: Req[] = [];
  await page.route('**/www.googleapis.com/**', async (route: any) => {
    const req = route.request();
    const entry = { url: req.url(), method: req.method(), body: req.postData() ?? '' };
    requests.push(entry);
    const res = await handler(entry);
    await route.fulfill({
      status: res.status,
      contentType: 'application/json',
      body: typeof res.body === 'string' ? res.body : JSON.stringify(res.body ?? {}),
    });
  });
  return requests;
}

const connected = async (page: any) => {
  await seedDriveToken(page);
  await page.goto('/app/app.html');
  // DB.load() runs asynchronously after DOMContentLoaded; wait for the seeded
  // token so later DB.driveFileId assignments cannot be overwritten by load().
  await page.waitForFunction(async () => !!(window as any).DB && !!(await (window as any).DB.getDriveToken()));
};

test.describe('Drive upload', () => {
  test('creates a new appDataFolder file with the current schema', async ({ page }) => {
    await seedMeasures(page, [fakeMeasure({ id: 1 })]);
    await connected(page);
    const requests = await mockDrive(page, () => ({ status: 200, body: { id: 'new-file-id' } }));
    await page.evaluate(() => (window as any).driveSyncUp());
    await expect.poll(() => page.evaluate(() => (window as any).DB.driveFileId)).toBe('new-file-id');

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(requests[0].body).toContain('chronitracker_data.json');
    expect(requests[0].body).toContain('appDataFolder');
    expect(requests[0].body).toContain('"version":3');
  });

  test('updates the existing Drive file via PATCH', async ({ page }) => {
    await connected(page);
    await page.evaluate(() => { (window as any).DB.driveFileId = 'existing-id'; });
    const requests = await mockDrive(page, () => ({ status: 200, body: { id: 'existing-id' } }));
    await page.evaluate(() => (window as any).driveSyncUp());
    await page.waitForTimeout(100);

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('PATCH');
    expect(requests[0].url).toContain('/upload/drive/v3/files/existing-id?uploadType=multipart');
    expect(requests[0].body).not.toContain('appDataFolder');
  });

  test('recreates the file when a PATCH returns 404', async ({ page }) => {
    await connected(page);
    await page.evaluate(() => { (window as any).DB.driveFileId = 'stale-id'; });
    const requests = await mockDrive(page, (req) => {
      if (req.method === 'PATCH') return { status: 404, body: { error: 'notFound' } };
      return { status: 200, body: { id: 'recreated-id' } };
    });
    await page.evaluate(() => (window as any).driveSyncUp());
    await expect.poll(() => page.evaluate(() => (window as any).DB.driveFileId)).toBe('recreated-id');

    expect(requests.map((r) => r.method)).toEqual(['PATCH', 'POST']);
    expect(requests[1].url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(requests[1].body).toContain('appDataFolder');
  });

  test('surfaces an API error without clobbering the stored file id', async ({ page }) => {
    await connected(page);
    await page.evaluate(() => { (window as any).DB.driveFileId = 'existing-id'; });
    await mockDrive(page, () => ({ status: 500, body: 'boom' }));
    await page.evaluate(() => (window as any).driveSyncUp());
    await expect(page.locator('#toast.show')).toContainText('Drive');
    expect(await page.evaluate(() => (window as any).DB.driveFileId)).toBe('existing-id');
  });

  test('refuses to sync when no token is stored', async ({ page }) => {
    await page.goto('/app/app.html');
    const requests = await mockDrive(page, () => ({ status: 200, body: {} }));
    await page.evaluate(() => (window as any).driveSyncUp());
    await expect(page.locator('#toast.show')).toContainText('Drive');
    expect(requests).toHaveLength(0);
  });
});

test.describe('Drive restore', () => {
  test('downloads and migrates a legacy v1 backup', async ({ page }) => {
    await connected(page);
    const requests = await mockDrive(page, (req) => {
      if (req.url.includes('alt=media')) {
        return {
          status: 200,
          body: {
            version: 1,
            measures: [fakeMeasure({ id: 77, dep: 420 })],
            bestDEP: 500,
          },
        };
      }
      return { status: 200, body: { files: [{ id: 'remote-id', name: 'chronitracker_data.json' }, { id: 'legacy', name: 'asthmetrack_data.json' }] } };
    });
    await page.evaluate(() => (window as any).driveSyncDown());
    await expect(page.locator('#toast.show')).toContainText('Drive');

    const measures = JSON.parse(await readFromIDB(page, 'at_measures') || '[]');
    expect(measures).toHaveLength(1);
    expect(measures[0].id).toBe(77);
    expect(await readFromIDB(page, 'at_bestDEP')).toBe('500');
    const entries = JSON.parse(await readFromIDB(page, 'at_conditionEntries') || '[]');
    expect(entries).toHaveLength(1);
    expect(entries[0].conditionId).toBe('asthma');
    const query = decodeURIComponent(requests[0].url);
    expect(query).toContain("name='chronitracker_data.json'");
    expect(query).toContain("name='asthmetrack_data.json'");
    expect(requests.some((r) => r.url.includes('/files/remote-id?alt=media'))).toBe(true);
  });

  test('prefers the current filename over a legacy file', async ({ page }) => {
    await connected(page);
    await mockDrive(page, (req) => {
      if (req.url.includes('alt=media')) return { status: 200, body: { version: 3, measures: [] } };
      return {
        status: 200,
        body: { files: [{ id: 'legacy-id', name: 'asthmetrack_data.json' }, { id: 'current-id', name: 'chronitracker_data.json' }] },
      };
    });
    await page.evaluate(() => (window as any).driveSyncDown());
    await expect.poll(() => page.evaluate(() => (window as any).DB.driveFileId)).toBe('current-id');
  });

  test('shows a message when no remote backup exists', async ({ page }) => {
    await seedMeasures(page, [fakeMeasure({ id: 9 })]);
    await connected(page);
    await mockDrive(page, () => ({ status: 200, body: { files: [] } }));
    await page.evaluate(() => (window as any).driveSyncDown());
    await expect(page.locator('#toast.show')).toBeVisible();
    expect(JSON.parse(await readFromIDB(page, 'at_measures') || '[]')).toHaveLength(1);
  });

  test('handles a search API failure gracefully', async ({ page }) => {
    await connected(page);
    await mockDrive(page, () => ({ status: 403, body: 'forbidden' }));
    await page.evaluate(() => (window as any).driveSyncDown());
    await expect(page.locator('#toast.show')).toBeVisible();
    expect(JSON.parse(await readFromIDB(page, 'at_measures') || '[]')).toHaveLength(0);
  });
});
