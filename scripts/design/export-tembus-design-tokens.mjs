#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  generatedCss,
  generatedTypeScript,
  readContract,
} from './tembus-token-contract.mjs';

const contract = readContract();
const outputs = new Map([
  ['frontend/src/app/tembus-tokens.generated.css', generatedCss(contract)],
  ['admin-dashboard/src/tembus-tokens.generated.css', generatedCss(contract)],
  ['frontend/src/lib/generated/tembusTokens.ts', generatedTypeScript(contract)],
  ['admin-dashboard/src/lib/generated/tembusTokens.ts', generatedTypeScript(contract)],
]);

const checkOnly = process.argv.includes('--check');
let failures = 0;

for (const [relativePath, expected] of outputs) {
  const outputPath = path.join(ROOT, relativePath);
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
  if (checkOnly) {
    if (current !== expected) {
      console.error(`generated token output is stale: ${relativePath}`);
      failures += 1;
    } else {
      console.log(`synced: ${relativePath}`);
    }
    continue;
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, expected, 'utf8');
  console.log(`written: ${relativePath}`);
}

if (failures > 0) {
  process.exit(1);
}

console.log(`TEMBUS token export ${checkOnly ? 'check' : 'write'} passed: ${outputs.size} platform outputs.`);
