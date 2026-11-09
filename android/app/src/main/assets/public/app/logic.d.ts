export interface Measure {
  id?: number;
  dt: string;
  dep: number;
  dep1?: number;
  dep2?: number;
  dep3?: number;
  spo2: number;
  easy?: number;
  comment?: string;
  [key: string]: unknown;
}

export interface ConditionEntry {
  id?: string;
  conditionId: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface BackupData {
  version?: number;
  measures?: Measure[];
  conditionEntries?: ConditionEntry[];
  conditions?: { enabled?: string[]; custom?: boolean };
  medications?: unknown[];
  [key: string]: unknown;
}

interface Logic {
  depZone(dep: number, bestDEP: number): 'green' | 'yellow' | 'red';
  spo2Zone(s: number): 'green' | 'yellow' | 'red';
  predictedDEP(sex: string, age: number, heightCm: number): number;
  calcTrend(measures: Measure[], field: string, now?: number): 'up' | 'down' | 'flat' | null;
  isCrisis(measures: Measure[], bestDEP: number): boolean;
  htnCategory(systolic: number, diastolic: number): 'normal' | 'elevated' | 'stage1' | 'stage2' | 'crisis';
  glucoseFlag(glucose: number, unit: string): 'low' | 'high' | 'ok' | '';
  calcDepAvg(values: number[]): number | null;
  driveBackupQuery(fields: string, primaryName: string, legacyNames?: string[]): string;
  pickDriveBackup<T extends { name?: string }>(files: T[], primaryName: string): T | null;
  migrateLegacyMeasures(measures: Measure[], options?: { now?: number; makeId?: (measure: Measure, index: number) => string }): ConditionEntry[];
  migrateBackupData(data: BackupData, options?: { now?: number; makeId?: (measure: Measure, index: number) => string }): BackupData;
  readonly CRISIS_THRESHOLD: number;
}

declare const logic: Logic;
export = logic;
