#!/usr/bin/env node

/**
 * CI compatibility entrypoint for the canonical TEMBUS token contract.
 * The source of truth is design-tokens/tembus.tokens.json; this command keeps
 * the existing Part S workflow name while delegating all values and WCAG
 * protected pairs to the design-system validator.
 */

import {
  REQUIRED_COLOR_TOKENS,
  contrastRatio,
  readContract,
} from '../design/tembus-token-contract.mjs';

const contract = readContract();
let failures = 0;

for (const [mode, theme] of Object.entries(contract.themes)) {
  const colors = theme.color;
  for (const token of REQUIRED_COLOR_TOKENS) {
    if (!colors[token]) {
      console.error(`[${mode}] missing token: ${token}`);
      failures += 1;
    }
  }

  for (const pair of contract.wcagProtectedPairs) {
    if (!colors[pair.foreground] || !colors[pair.background]) continue;
    const ratio = contrastRatio(colors[pair.foreground], colors[pair.background]);
    const result = ratio >= pair.minimum ? 'PASS' : 'FAIL';
    console.log(`${mode.padEnd(5)} ${pair.foreground.padEnd(22)} / ${pair.background.padEnd(18)} ${ratio.toFixed(2)}:1 (min ${pair.minimum}:1) ${result}`);
    if (ratio < pair.minimum) failures += 1;
  }
}

if (failures > 0) {
  console.error(`\nTEMBUS color token contract failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log(`\nTEMBUS color token contract passed: ${Object.keys(contract.themes).length} themes, ${REQUIRED_COLOR_TOKENS.length} required tokens, ${contract.wcagProtectedPairs.length} protected pairs.`);
