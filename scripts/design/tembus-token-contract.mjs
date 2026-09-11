import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const CONTRACT_PATH = path.join(ROOT, 'design-tokens', 'tembus.tokens.json');

export const REQUIRED_COLOR_TOKENS = [
  'background', 'surface', 'surface-raised', 'surface-subtle', 'foreground',
  'foreground-secondary', 'foreground-muted', 'border', 'border-strong',
  'input-background', 'input-border', 'focus-ring', 'primary', 'on-primary',
  'accent', 'on-accent', 'success', 'on-success', 'success-surface', 'warning',
  'on-warning', 'warning-surface', 'error', 'on-error', 'error-surface', 'info',
  'on-info', 'info-surface', 'selection', 'scrim',
];

export function readContract() {
  return JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
}

export function colorsFor(contract, mode) {
  return contract.themes[mode].color;
}

export function parseHex(value) {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new Error(`Invalid token color: ${value}`);
  }
  const normalized = value.slice(1);
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
}

function linearize(channel) {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(value) {
  const [red, green, blue] = parseHex(value).map(linearize);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first, second) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function cssVariableName(token) {
  return `--token-${token}`;
}

export function generatedCss(contract) {
  const renderTheme = (selector, mode) => {
    const colorLines = Object.entries(colorsFor(contract, mode))
      .map(([token, value]) => `  ${cssVariableName(token)}: ${value};`)
      .join('\n');
    const globalLines = Object.entries(contract.global)
      .flatMap(([family, values]) => Object.entries(values).map(([token, value]) =>
        `  --token-${family}-${token}: ${value};`))
      .join('\n');
    return `${selector} {\n${colorLines}\n${globalLines}\n}`;
  };

  return `/* GENERATED FILE — source: design-tokens/tembus.tokens.json. Do not edit. */\n${renderTheme(':root', 'light')}\n\n${renderTheme('.dark', 'dark')}\n\n${renderTheme('.theme-preview-light', 'light')}\n`;
}

export function generatedTypeScript(contract) {
  return `// GENERATED FILE — source: design-tokens/tembus.tokens.json. Do not edit.\nexport const tembusTokens = ${JSON.stringify({
    version: contract.version,
    themes: contract.themes,
    global: contract.global,
  }, null, 2)} as const;\n`;
}
