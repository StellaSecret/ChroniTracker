import { afterEach, describe, it, expect } from 'vitest';
import logic from '../../www/app/logic.js';

const {
  htnCategory,
  glucoseFlag,
  calcDepAvg,
  driveBackupQuery,
  pickDriveBackup,
  migrateLegacyMeasures,
  migrateBackupData,
} = logic;

const NOW = 1_750_000_000_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * 86400000).toISOString();

afterEach(() => {
  delete (globalThis as any).HypertensionCondition;
});

describe('htnCategory', () => {
  it('classifies ESC/ACC/AHA blood-pressure stages at every boundary', () => {
    expect(htnCategory(110, 70)).toBe('normal');
    expect(htnCategory(120, 79)).toBe('elevated');
    expect(htnCategory(120, 80)).toBe('stage1');
    expect(htnCategory(130, 70)).toBe('stage1');
    expect(htnCategory(139, 89)).toBe('stage1');
    expect(htnCategory(140, 70)).toBe('stage2');
    expect(htnCategory(110, 90)).toBe('stage2');
    expect(htnCategory(179, 119)).toBe('stage2');
    expect(htnCategory(180, 70)).toBe('crisis');
    expect(htnCategory(110, 120)).toBe('crisis');
    expect(htnCategory(180, 120)).toBe('crisis');
  });

  it('uses the highest of systolic/diastolic', () => {
    expect(htnCategory(118, 92)).toBe('stage2');
    expect(htnCategory(135, 78)).toBe('stage1');
    expect(htnCategory(120, 85)).toBe('stage1');
  });

  it('delegates to window.HypertensionCondition when present', () => {
    (globalThis as any).HypertensionCondition = { getCategory: () => 'delegated' };
    expect(htnCategory(110, 70)).toBe('delegated');
  });

  it('falls back to local thresholds when the condition module lacks getCategory', () => {
    (globalThis as any).HypertensionCondition = {};
    expect(htnCategory(180, 70)).toBe('crisis');
  });
});

describe('glucoseFlag', () => {
  it('flags mg/dL below 70 and above 180', () => {
    expect(glucoseFlag(69, 'mg/dL')).toBe('low');
    expect(glucoseFlag(70, 'mg/dL')).toBe('ok');
    expect(glucoseFlag(180, 'mg/dL')).toBe('ok');
    expect(glucoseFlag(181, 'mg/dL')).toBe('high');
  });

  it('converts mmol/L to mg/dL before flagging', () => {
    expect(glucoseFlag(3.5, 'mmol/L')).toBe('low');
    expect(glucoseFlag(6, 'mmol/L')).toBe('ok');
    expect(glucoseFlag(11, 'mmol/L')).toBe('high');
  });

  it('returns empty string for invalid values', () => {
    expect(glucoseFlag(NaN, 'mg/dL')).toBe('');
    expect(glucoseFlag('abc' as any, 'mg/dL')).toBe('');
  });
});

describe('calcDepAvg', () => {
  it('averages valid measurments rounded to nearest integer', () => {
    expect(calcDepAvg([400, 500, 600])).toBe(500);
    expect(calcDepAvg([400, 401])).toBe(401);
  });

  it('ignores out-of-range and non-numeric input', () => {
    expect(calcDepAvg([49, 50, 400, 900, 901, NaN])).toBe(450);
    expect(calcDepAvg([undefined as any, null as any, ''])).toBeNull();
  });

  it('returns null when nothing valid remains', () => {
    expect(calcDepAvg([])).toBeNull();
    expect(calcDepAvg([10, 20, 1000])).toBeNull();
    expect(calcDepAvg(undefined as any)).toBeNull();
    expect(calcDepAvg('400' as any)).toBeNull();
  });
});

describe('driveBackupQuery', () => {
  it('includes primary and legacy filenames', () => {
    const q = driveBackupQuery('files(id,name)', 'chronitracker_data.json', ['asthmetrack_data.json', 'chronictrack_data.json']);
    expect(q).toContain("name='chronitracker_data.json'");
    expect(q).toContain("name='asthmetrack_data.json'");
    expect(q).toContain("name='chronictrack_data.json'");
    expect(q).toContain("name='chronitracker_data.json' or name='asthmetrack_data.json' or name='chronictrack_data.json'");
    expect(q).toContain('spaces=appDataFolder');
    expect(q).toContain('fields=files(id,name)');
  });

  it('works with no legacy names', () => {
    expect(driveBackupQuery('files(id)', 'a.json')).toContain("q=(name='a.json')");
  });
});

describe('pickDriveBackup', () => {
  it('prefers the current filename over legacy / other files', () => {
    const files = [{ id: '1', name: 'other.json' }, { id: '2', name: 'chronitracker_data.json' }];
    expect(pickDriveBackup(files, 'chronitracker_data.json')).toEqual(files[1]);
  });

  it('falls back to the first file', () => {
    const files = [{ id: '1', name: 'asthmetrack_data.json' }];
    expect(pickDriveBackup(files, 'chronitracker_data.json')).toEqual(files[0]);
  });

  it('returns null for empty/invalid input', () => {
    expect(pickDriveBackup([], 'a.json')).toBeNull();
    expect(pickDriveBackup(null as any, 'a.json')).toBeNull();
  });
});

describe('migrateLegacyMeasures', () => {
  const legacy = [{
    id: 7,
    dt: iso(-1),
    dep: 400, dep1: 390, dep2: 410, dep3: 400,
    spo2: 97, easy: 2, comment: 'ok',
  }];

  it('maps asthma measures to v3 condition entries', () => {
    const out = migrateLegacyMeasures(legacy, { now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: 7,
      conditionId: 'asthma',
      type: 'measure',
      timestamp: legacy[0].dt,
      meta: { migratedFrom: 'asthma' },
      data: { dep: 400, dep1: 390, dep2: 410, dep3: 400, spo2: 97, easyhaler: 2, comment: 'ok' },
    });
  });

  it('generates deterministic ids when missing', () => {
    const [a, b] = migrateLegacyMeasures([{ dt: iso(-1), dep: 400, spo2: 97 }, { dt: iso(-2), dep: 500, spo2: 97 }], { now: NOW });
    expect(a.id).toBe('legacy-' + NOW.toString(36) + '-0');
    expect(b.id).toBe('legacy-' + NOW.toString(36) + '-1');
  });

  it('supports a custom id factory and default clock', () => {
    const out = migrateLegacyMeasures([{ dt: iso(-1), dep: 400, spo2: 97 }], { makeId: (_m, i) => 'id-' + i });
    expect(out[0].id).toBe('id-0');
    expect(out[0].timestamp).toBeTruthy();
  });

  it('handles empty input', () => {
    expect(migrateLegacyMeasures(null as any)).toEqual([]);
  });
});

describe('migrateBackupData', () => {
  it('returns non-object payloads untouched', () => {
    expect(migrateBackupData(null as any)).toBeNull();
    expect(migrateBackupData('nope' as any)).toBe('nope');
  });

  it('normalizes an empty v1 backup to the v3 shape', () => {
    const out = migrateBackupData({}, { now: NOW });
    expect(out.version).toBe(3);
    expect(out.measures).toEqual([]);
    expect(out.conditionEntries).toEqual([]);
    expect(out.medications).toEqual([]);
    expect(out.conditions).toEqual({ enabled: ['asthma', 'hypertension', 'diabetes'] });
  });

  it('synthesizes conditionEntries from legacy measures', () => {
    const out = migrateBackupData({
      version: 1,
      measures: [{ id: 1, dt: iso(-1), dep: 400, spo2: 97 }],
    }, { now: NOW });
    expect(out.conditionEntries).toHaveLength(1);
    expect(out.conditionEntries![0].conditionId).toBe('asthma');
    expect(out.conditionEntries![0].id).toBe(1);
  });

  it('synthesizes entries when conditionEntries is an empty array', () => {
    const out = migrateBackupData({
      version: 2,
      measures: [{ id: 1, dt: iso(-1), dep: 400, spo2: 97 }],
      conditionEntries: [],
    }, { now: NOW });
    expect(out.conditionEntries).toHaveLength(1);
  });

  it('leaves an empty conditionEntries array untouched when there are no legacy measures', () => {
    const conditionEntries: any[] = [];
    const out = migrateBackupData({ version: 2, measures: [], conditionEntries }, { now: NOW });
    expect(out.conditionEntries).toBe(conditionEntries);
  });

  it('keeps pre-existing conditionEntries', () => {
    const existing = [{ id: 'x', conditionId: 'hypertension', type: 'reading', timestamp: iso(-1), data: {} }];
    const out = migrateBackupData({ version: 2, measures: [{ dt: iso(-1), dep: 400, spo2: 97 }], conditionEntries: existing }, { now: NOW });
    expect(out.conditionEntries).toBe(existing);
  });

  it('upgrades the legacy asthma-only default', () => {
    const out = migrateBackupData({ version: 1, conditions: { enabled: ['asthma'] } }, { now: NOW });
    expect(out.conditions).toEqual({ enabled: ['asthma', 'hypertension', 'diabetes'] });
  });

  it('preserves a user-customized condition selection', () => {
    const custom = { enabled: ['asthma'], custom: true };
    const out = migrateBackupData({ version: 2, conditions: custom }, { now: NOW });
    expect(out.conditions).toBe(custom);
  });

  it('preserves multi-condition selections', () => {
    const enabled = ['asthma', 'diabetes'];
    const out = migrateBackupData({ version: 2, conditions: { enabled } }, { now: NOW });
    expect(out.conditions!.enabled).toEqual(enabled);
  });

  it('leaves v3 data intact and fills missing collections', () => {
    const out = migrateBackupData({ version: 3, measures: [], conditions: { enabled: ['asthma'] } }, { now: NOW });
    expect(out.conditions).toEqual({ enabled: ['asthma'] });
    expect(out.conditionEntries).toEqual([]);
    expect(out.medications).toEqual([]);
  });

  it('fills conditions and medications for v3 input that omits them', () => {
    const out = migrateBackupData({ version: 3, measures: [] }, { now: NOW });
    expect(out.conditions).toEqual({ enabled: ['asthma', 'hypertension', 'diabetes'] });
    expect(out.medications).toEqual([]);
  });

  it('handles legacy conditions without an enabled list', () => {
    const conditions = {};
    const out = migrateBackupData({ version: 2, conditions }, { now: NOW });
    expect(out.conditions).toBe(conditions);
  });

  it('does not upgrade a single non-asthma condition selection', () => {
    const out = migrateBackupData({ version: 1, conditions: { enabled: ['diabetes'] } }, { now: NOW });
    expect(out.conditions).toEqual({ enabled: ['diabetes'] });
  });

  it('returns a fresh fallback conditions array for legacy v3 payloads', () => {
    const first = migrateBackupData({ version: 3, measures: [] }, { now: NOW });
    first.conditions!.enabled!.push('diabetes');
    const second = migrateBackupData({ version: 3, measures: [] }, { now: NOW });
    expect(second.conditions!.enabled).toEqual(['asthma', 'hypertension', 'diabetes']);
  });

  it('preserves existing v3 medications', () => {
    const medications = [{ id: 'm1', name: 'Ventoline' }];
    const out = migrateBackupData({ version: 3, measures: [], medications }, { now: NOW });
    expect(out.medications).toBe(medications);
  });

  it('returns a fresh default conditions array on each migration', () => {
    const first = migrateBackupData({ version: 1, conditions: { enabled: ['asthma'] } }, { now: NOW });
    first.conditions!.enabled!.push('diabetes');
    const second = migrateBackupData({ version: 1, conditions: { enabled: ['asthma'] } }, { now: NOW });
    expect(second.conditions!.enabled).toEqual(['asthma', 'hypertension', 'diabetes']);
  });

  it('does not mutate the caller top-level object', () => {
    const input: any = { measures: [] };
    migrateBackupData(input, { now: NOW });
    expect(input.version).toBeUndefined();
  });
});
