#!/usr/bin/env node
// Fails if Math.random() is used in first-party application code.
// All generated identifiers / demo values must use Web Crypto instead.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['www/app'];
const SKIP = /(^|\/)(jspdf\.umd\.min\.js|vendor)(\/|$)/;
const BAD = /Math\.random\s*\(/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    if (SKIP.test(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (BAD.test(line)) hits.push(`${relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (hits.length) {
  console.error('Insecure Math.random() found:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('randomness check: OK (no Math.random in application code)');
