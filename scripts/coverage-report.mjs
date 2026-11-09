#!/usr/bin/env node
// Merges Playwright V8 coverage shards (converted through ast-v8-to-istanbul)
// and enforces line thresholds on first-party files.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseAstAsync } from 'vite';
import { convert } from 'ast-v8-to-istanbul';

const args = new Map();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
}
const MIN_TOTAL = Number(args.get('min-total') ?? 0);
const MIN_CRITICAL = Number(args.get('min-critical') ?? 0);
const CRITICAL = (args.get('critical') ?? 'www/app/app.js,www/app/logic.js,www/app/shared/utils.js').split(',');
const DIR = args.get('dir') ?? 'coverage-e2e';

if (!existsSync(DIR) || !readdirSync(DIR).some((f) => f.endsWith('.json'))) {
  console.error(`No e2e coverage found in ${DIR}/ — set PW_COVERAGE=1`);
  process.exit(1);
}

const lines = new Map(); // local file -> { all:Set, covered:Set }
const parsed = new Map(); // local file -> Promise<ast>
const sources = new Map(); // local file -> code

function localPath(url) {
  let pathname;
  try { pathname = new URL(url).pathname; } catch { return null; }
  if (!pathname.endsWith('.js') || /jspdf\.umd\.min\.js/.test(pathname)) return null;
  const local = 'www' + pathname;
  return existsSync(local) ? local : null;
}

for (const name of readdirSync(DIR)) {
  if (!name.endsWith('.json')) continue;
  const data = JSON.parse(readFileSync(join(DIR, name), 'utf8'));
  for (const [url, raw] of Object.entries(data.files ?? {})) {
    const local = localPath(url);
    if (!local || !raw || !Array.isArray(raw.functions)) continue;
    if (!sources.has(local)) sources.set(local, readFileSync(local, 'utf8'));
    if (!parsed.has(local)) parsed.set(local, parseAstAsync(sources.get(local)));

    let map;
    try {
      map = await convert({
        code: sources.get(local),
        ast: parsed.get(local),
        coverage: { url: pathToFileURL(resolve(local)).href, functions: raw.functions },
      });
    } catch (e) {
      console.warn(`skip ${local}: ${e.message}`);
      continue;
    }
    const entry = lines.get(local) ?? { all: new Set(), covered: new Set() };
    for (const fc of Object.values(map)) {
      const d = typeof fc.toJSON === 'function' ? fc.toJSON() : fc;
      for (const [id, loc] of Object.entries(d.statementMap ?? {})) {
        const line = loc.start.line;
        entry.all.add(line);
        if (d.s && d.s[id] > 0) entry.covered.add(line);
      }
    }
    lines.set(local, entry);
  }
}

if (!lines.size) {
  console.error('Coverage shards contained no matching first-party files');
  process.exit(1);
}

let totalLines = 0, totalCovered = 0, failed = false;
const rows = [];
for (const [file, entry] of [...lines].sort()) {
  const total = entry.all.size;
  if (!total) continue;
  const covered = entry.covered.size;
  const pct = (covered / total) * 100;
  totalLines += total; totalCovered += covered;
  const critical = CRITICAL.includes(file);
  if (critical && pct < MIN_CRITICAL) failed = true;
  rows.push({ file, pct, critical, covered, total });
}

const totalPct = totalLines ? (totalCovered / totalLines) * 100 : 0;
if (totalPct < MIN_TOTAL) failed = true;

console.log('E2E line coverage');
for (const r of rows) {
  console.log(`${r.critical ? '*' : ' '} ${r.pct.toFixed(1).padStart(5)}%  ${r.file} (${r.covered}/${r.total})`);
}
console.log(`\nTotal: ${totalPct.toFixed(1)}% (${totalCovered}/${totalLines})`);
console.log(`Thresholds: total >= ${MIN_TOTAL}%, critical >= ${MIN_CRITICAL}%`);
if (failed) {
  console.error('Coverage threshold failed');
  process.exit(1);
}
