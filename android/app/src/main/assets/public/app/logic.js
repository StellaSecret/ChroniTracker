// ══════════════════════════════════════════
//  PURE BUSINESS LOGIC
//  DOM-free helpers shared by the app (browser global via <script>)
//  and by unit tests (CommonJS require).
//  Extracted from app.js so it can be unit- and mutation-tested in isolation.
// ══════════════════════════════════════════
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AsthmeTrackLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Consecutive red-zone readings required to trigger a crisis banner.
  const CRISIS_THRESHOLD = 2;
  const DEFAULT_CONDITIONS = ['asthma', 'hypertension', 'diabetes'];

  function depZone(dep, bestDEP) {
    const p = (dep / bestDEP) * 100;
    return p >= 80 ? 'green' : p >= 60 ? 'yellow' : 'red';
  }

  function spo2Zone(s) {
    return s >= 95 ? 'green' : s >= 90 ? 'yellow' : 'red';
  }

  function predictedDEP(sex, age, heightCm) {
    const h = heightCm / 100;
    let pef;
    if (sex === 'M') pef = (((h * 5.48) + 1.58) - (age * 0.041)) * 60;
    else             pef = (((h * 3.72) + 2.24) - (age * 0.030)) * 60;
    return Math.round(pef);
  }

  // Compares last 3 days vs previous 3 days. Returns 'up' | 'down' | 'flat' | null.
  // `now` is injectable for deterministic unit tests.
  function calcTrend(measures, field, now = Date.now()) {
    const day3  = 3 * 24 * 3600 * 1000;
    const day6  = 6 * 24 * 3600 * 1000;
    const last3 = measures.filter(m => (now - new Date(m.dt)) < day3);
    const prev3 = measures.filter(m => { const age = now - new Date(m.dt); return age >= day3 && age < day6; });
    if (!last3.length || !prev3.length) return null;
    const avg = arr => arr.reduce((s, m) => s + m[field], 0) / arr.length;
    const diff = avg(last3) - avg(prev3);
    const pct  = Math.abs(diff) / avg(prev3) * 100;
    if (pct < 3) return 'flat';
    // Stryker disable next-line EqualityOperator: diff === 0 is already 'flat' above
    return diff > 0 ? 'up' : 'down';
  }

  function isCrisis(measures, bestDEP) {
    if (measures.length < CRISIS_THRESHOLD) return false;
    return measures.slice(0, CRISIS_THRESHOLD).every(m => depZone(m.dep, bestDEP) === 'red');
  }

  function htnCategory(s, d) {
    const def = globalThis.HypertensionCondition;
    if (def && typeof def.getCategory === 'function') return def.getCategory(s, d);
    s = Number(s); d = Number(d);
    if (s >= 180 || d >= 120) return 'crisis';
    if (s >= 140 || d >= 90) return 'stage2';
    if (s >= 130 || d >= 80) return 'stage1';
    if (s >= 120) return 'elevated';
    return 'normal';
  }

  function glucoseFlag(g, unit) {
    const mg = unit === 'mmol/L' ? Number(g) * 18 : Number(g);
    if (!isFinite(mg)) return '';
    if (mg < 70) return 'low';
    if (mg > 180) return 'high';
    return 'ok';
  }

  // Averages the valid DEP blows (50–900 L/min), ignoring empty/out-of-range input.
  function calcDepAvg(values) {
    if (!Array.isArray(values)) return null;
    const vals = values.map(Number).filter(v => !isNaN(v) && v >= 50 && v <= 900);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  function driveBackupQuery(fields, primaryName, legacyNames) {
    const names = [primaryName, ...(legacyNames || [])].map(n => `name='${n}'`).join(' or ');
    return `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=(${names})&fields=${fields}`;
  }

  function pickDriveBackup(files, primaryName) {
    if (!Array.isArray(files) || !files.length) return null;
    return files.find(f => f && f.name === primaryName) || files[0];
  }

  function migrateLegacyMeasures(measures, options) {
    const opts = options || {};
    const now = opts.now || Date.now();
    const makeId = opts.makeId || ((x, i) => 'legacy-' + now.toString(36) + '-' + i);
    return (measures || []).map((x, i) => ({
      id: x.id || makeId(x, i),
      conditionId: 'asthma',
      type: 'measure',
      timestamp: x.dt || new Date(now).toISOString(),
      data: {
        dep: x.dep,
        dep1: x.dep1,
        dep2: x.dep2,
        dep3: x.dep3,
        spo2: x.spo2,
        easyhaler: x.easy,
        comment: x.comment
      },
      meta: { migratedFrom: 'asthma' }
    }));
  }

  /** Normalizes any backup schema (v1/v2/v3 or Drive) into the current v3 shape. */
  function migrateBackupData(data, options) {
    if (!data || typeof data !== 'object') return data;
    const out = { ...data };
    if (!Array.isArray(out.measures)) out.measures = [];
    if (!out.version) out.version = 1;
    if (out.version < 3) {
      // Old backups only have `measures`; synthesize v3 collections.
      if ((!Array.isArray(out.conditionEntries) || out.conditionEntries.length === 0) && out.measures.length > 0) {
        out.conditionEntries = migrateLegacyMeasures(out.measures, options);
      }
      // Legacy default was asthma-only; match DB.load's upgrade unless the user customized it.
      if (out.conditions?.enabled?.[0] === 'asthma' && !out.conditions.custom && out.conditions.enabled.length === 1) {
        out.conditions = { enabled: DEFAULT_CONDITIONS.slice() };
      }
      out.version = 3;
    }
    if (!Array.isArray(out.conditionEntries)) out.conditionEntries = [];
    if (!out.conditions) out.conditions = { enabled: DEFAULT_CONDITIONS.slice() };
    if (!Array.isArray(out.medications)) out.medications = [];
    return out;
  }

  return {
    depZone,
    spo2Zone,
    predictedDEP,
    calcTrend,
    isCrisis,
    htnCategory,
    glucoseFlag,
    calcDepAvg,
    driveBackupQuery,
    pickDriveBackup,
    migrateLegacyMeasures,
    migrateBackupData,
    CRISIS_THRESHOLD,
  };
});
