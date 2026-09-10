#!/usr/bin/env node

/**
 * Deterministic WCAG 2.1 AA guard for the shared web token contract.
 *
 * This intentionally has no npm dependency so it can run in local checks and
 * CI before either web application is bundled. The CSS token values are kept
 * in docs/design/color-token-contract.md and mirrored here as the executable
 * contract; a mismatch or failing protected pair must fail the command.
 */

const REQUIRED_TOKENS = [
  'background',
  'surface',
  'surfaceRaised',
  'surfaceSubtle',
  'foreground',
  'foregroundSecondary',
  'foregroundMuted',
  'border',
  'borderStrong',
  'inputBackground',
  'inputBorder',
  'focusRing',
  'primary',
  'onPrimary',
  'accent',
  'onAccent',
  'success',
  'onSuccess',
  'successSurface',
  'warning',
  'onWarning',
  'warningSurface',
  'error',
  'onError',
  'errorSurface',
  'info',
  'onInfo',
  'infoSurface',
  'selection',
  'scrim',
];

const TOKENS = {
  light: {
    background: '#F7F8F7',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceSubtle: '#EEF3EF',
    foreground: '#14211A',
    foregroundSecondary: '#415047',
    foregroundMuted: '#5F6B63',
    border: '#C7D1CA',
    borderStrong: '#718078',
    inputBackground: '#FFFFFF',
    inputBorder: '#66756C',
    focusRing: '#9A3412',
    primary: '#006437',
    onPrimary: '#FFFFFF',
    accent: '#C2410C',
    onAccent: '#FFFFFF',
    success: '#15803D',
    onSuccess: '#FFFFFF',
    successSurface: '#DCFCE7',
    warning: '#B45309',
    onWarning: '#FFFFFF',
    warningSurface: '#FEF3C7',
    error: '#B91C1C',
    onError: '#FFFFFF',
    errorSurface: '#FEE2E2',
    info: '#1D4ED8',
    onInfo: '#FFFFFF',
    infoSurface: '#DBEAFE',
    selection: '#B7E4C7',
    scrim: '#14211A',
  },
  dark: {
    background: '#0B120E',
    surface: '#142019',
    surfaceRaised: '#1B2921',
    surfaceSubtle: '#203329',
    foreground: '#F4F7F5',
    foregroundSecondary: '#D0DBD3',
    foregroundMuted: '#AAB5AE',
    border: '#4B5D52',
    borderStrong: '#71877A',
    inputBackground: '#142019',
    inputBorder: '#71877A',
    focusRing: '#FDBA74',
    primary: '#34D399',
    onPrimary: '#032318',
    accent: '#FB923C',
    onAccent: '#241000',
    success: '#4ADE80',
    onSuccess: '#032318',
    successSurface: '#123B25',
    warning: '#FBBF24',
    onWarning: '#241000',
    warningSurface: '#4A3210',
    error: '#F87171',
    onError: '#2A0808',
    errorSurface: '#4A1717',
    info: '#60A5FA',
    onInfo: '#071A35',
    infoSurface: '#132E52',
    selection: '#1A7A4C',
    scrim: '#000000',
  },
};

const PROTECTED_PAIRS = [
  ['foreground', 'background', 4.5],
  ['foregroundSecondary', 'background', 4.5],
  ['foregroundMuted', 'background', 4.5],
  ['foreground', 'surface', 4.5],
  ['foregroundSecondary', 'surface', 4.5],
  ['foregroundMuted', 'surface', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['onAccent', 'accent', 4.5],
  ['onSuccess', 'success', 4.5],
  ['onWarning', 'warning', 4.5],
  ['onError', 'error', 4.5],
  ['onInfo', 'info', 4.5],
  ['borderStrong', 'background', 3],
  ['inputBorder', 'inputBackground', 3],
  ['focusRing', 'background', 3],
  ['focusRing', 'surface', 3],
];

// Explicit state-surface checks catch regressions where a status remains
// colored but becomes unreadable on its tinted container.
const STATE_PAIRS = [
  ['success', 'successSurface', 4.5],
  ['warning', 'warningSurface', 4.5],
  ['error', 'errorSurface', 4.5],
  ['info', 'infoSurface', 4.5],
  ['primary', 'background', 4.5],
  ['accent', 'background', 4.5],
  ['focusRing', 'surfaceSubtle', 3],
];

function parseHex(value) {
  const normalized = value.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    throw new Error(`Invalid token color: ${value}`);
  }
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function linearize(channel) {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(value) {
  const [red, green, blue] = parseHex(value).map(linearize);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

let failures = 0;
for (const [mode, tokens] of Object.entries(TOKENS)) {
  for (const token of REQUIRED_TOKENS) {
    if (!tokens[token]) {
      console.error(`[${mode}] missing token: ${token}`);
      failures += 1;
    }
  }

  for (const [foreground, background, minimum] of PROTECTED_PAIRS) {
    const ratio = contrastRatio(tokens[foreground], tokens[background]);
    const result = ratio >= minimum ? 'PASS' : 'FAIL';
    console.log(`${mode.padEnd(5)} ${foreground.padEnd(20)} / ${background.padEnd(16)} ${ratio.toFixed(2)}:1 (min ${minimum}:1) ${result}`);
    if (ratio < minimum) failures += 1;
  }

  for (const [foreground, background, minimum] of STATE_PAIRS) {
    const ratio = contrastRatio(tokens[foreground], tokens[background]);
    const result = ratio >= minimum ? 'PASS' : 'FAIL';
    console.log(`${mode.padEnd(5)} ${foreground.padEnd(20)} / ${background.padEnd(16)} ${ratio.toFixed(2)}:1 (min ${minimum}:1) ${result}`);
    if (ratio < minimum) failures += 1;
  }
}

if (failures > 0) {
  console.error(`\nColor token contract failed with ${failures} issue(s).`);
  process.exit(1);
}

console.log(`\nColor token contract passed: ${Object.keys(TOKENS).length} themes, ${REQUIRED_TOKENS.length} tokens, ${PROTECTED_PAIRS.length + STATE_PAIRS.length} protected pairs.`);
