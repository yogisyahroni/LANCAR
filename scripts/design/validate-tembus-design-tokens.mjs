#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  CONTRACT_PATH,
  REQUIRED_COLOR_TOKENS,
  ROOT,
  colorsFor,
  contrastRatio,
  generatedCss,
  generatedTypeScript,
  readContract,
} from './tembus-token-contract.mjs';

const contract = readContract();
const failures = [];
const modes = ['light', 'dark'];

if (contract.product !== 'TEMBUS') failures.push('contract product must be TEMBUS');
if (!contract.version) failures.push('contract version is missing');
if (!contract.figma?.file || !contract.figma?.foundationsPage) failures.push('Figma mapping metadata is incomplete');

for (const mode of modes) {
  const colors = colorsFor(contract, mode);
  for (const token of REQUIRED_COLOR_TOKENS) {
    if (!colors[token]) failures.push(`[${mode}] missing color token: ${token}`);
  }
  for (const pair of contract.wcagProtectedPairs) {
    if (!colors[pair.foreground] || !colors[pair.background]) continue;
    const ratio = contrastRatio(colors[pair.foreground], colors[pair.background]);
    const result = ratio >= pair.minimum ? 'PASS' : 'FAIL';
    console.log(`${mode.padEnd(5)} ${pair.foreground.padEnd(22)} / ${pair.background.padEnd(18)} ${ratio.toFixed(2)}:1 (min ${pair.minimum}:1) ${result}`);
    if (ratio < pair.minimum) failures.push(`[${mode}] ${pair.foreground}/${pair.background} is ${ratio.toFixed(2)}:1, below ${pair.minimum}:1`);
  }
}

function checkCss(relativePath) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  const blocks = relativePath.startsWith('admin-dashboard/')
    ? { light: [':root', '.theme-preview-light'], dark: ['.dark'] }
    : { light: [':root'], dark: ['.dark'] };
  for (const mode of modes) {
    const colors = colorsFor(contract, mode);
    for (const selector of blocks[mode]) {
      const block = source.match(new RegExp(`${selector.replace('.', '\\.') }\\s*\\{([\\s\\S]*?)\\}`));
      if (!block) {
        failures.push(`${relativePath} is missing ${selector} theme block`);
        continue;
      }
      for (const [token, expected] of Object.entries(colors)) {
        const match = block[1].match(new RegExp(`--token-${token.replaceAll('-', '\\-')}\\s*:\\s*(#[0-9A-Fa-f]{6})`));
        if (!match) failures.push(`${relativePath} ${selector} is missing ${token}`);
        else if (match[1].toUpperCase() !== expected.toUpperCase()) failures.push(`${relativePath} ${selector} has a non-canonical value for ${token}`);
      }
    }
  }
  console.log(`CSS sync checked: ${relativePath}`);
}

checkCss('frontend/src/app/globals.css');
checkCss('admin-dashboard/src/index.css');

const generatedOutputs = new Map([
  ['frontend/src/app/tembus-tokens.generated.css', generatedCss(contract)],
  ['admin-dashboard/src/tembus-tokens.generated.css', generatedCss(contract)],
  ['frontend/src/lib/generated/tembusTokens.ts', generatedTypeScript(contract)],
  ['admin-dashboard/src/lib/generated/tembusTokens.ts', generatedTypeScript(contract)],
]);
for (const [relativePath, expected] of generatedOutputs) {
  const actual = fs.existsSync(path.join(ROOT, relativePath))
    ? fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
    : null;
  if (actual !== expected) failures.push(`generated output is stale or missing: ${relativePath}`);
  else console.log(`generated sync checked: ${relativePath}`);
}

const androidFiles = [
  'android-app-customer/app/src/main/java/com/tembus/customer/ui/theme/Color.kt',
  'android-app-merchant/app/src/main/java/com/tembus/merchant/ui/theme/Color.kt',
  'android-app/app/src/main/java/com/tembus/courier/ui/theme/Color.kt',
];
const androidHex = (source, name) => {
  const match = source.match(new RegExp(`val\\s+${name}\\s*=\\s*Color\\(0xFF([0-9A-Fa-f]{6})\\)`));
  return match ? `#${match[1].toUpperCase()}` : null;
};
for (const relativePath of androidFiles) {
  const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  for (const [mode, mappings] of Object.entries(contract.platformMappings.android)) {
    const colors = colorsFor(contract, mode);
    for (const [token, variable] of Object.entries(mappings)) {
      const actual = androidHex(source, variable);
      const expected = colors[token]?.toUpperCase();
      if (!actual) failures.push(`${relativePath} is missing ${variable} for ${mode}.${token}`);
      else if (actual !== expected) failures.push(`${relativePath} ${variable}=${actual}, expected ${expected} for ${mode}.${token}`);
    }
  }
  console.log(`Android sync checked: ${relativePath}`);
}

if (failures.length > 0) {
  console.error(`\nTEMBUS token contract failed with ${failures.length} issue(s).`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\nTEMBUS token contract passed: ${modes.length} themes, ${REQUIRED_COLOR_TOKENS.length} required colors, ${contract.wcagProtectedPairs.length} protected pairs, CSS/Admin/Android sync.`);
