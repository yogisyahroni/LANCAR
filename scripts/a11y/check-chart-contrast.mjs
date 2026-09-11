import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const css = fs.readFileSync(path.join(root, 'admin-dashboard/src/index.css'), 'utf8');
const chartSources = [
  'admin-dashboard/src/components/Charts.tsx',
  'admin-dashboard/src/pages/Analytics.tsx',
  'admin-dashboard/src/pages/PricingConfig.tsx',
  'admin-dashboard/src/pages/TaxCenter.tsx',
  'admin-dashboard/src/pages/finance/treasury/RekeningGridSection.tsx',
  'admin-dashboard/src/pages/useFinanceData.ts',
];
const chartTokens = new Set([
  'primary',
  'primary-light',
  'primary-dark',
  'success',
  'warning',
  'error',
  'info',
  'accent',
]);
const backgrounds = ['background', 'surface-raised'];
const minimumContrast = 3;

function readBlock(selector) {
  const match = css.match(new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  if (!match) throw new Error(`Missing theme token block: ${selector}`);
  return match[1];
}

function readToken(block, token) {
  const match = block.match(new RegExp(`--token-${token}:\\s*(#[0-9A-Fa-f]{6})\\b`));
  if (!match) throw new Error(`Missing --token-${token} in theme block`);
  return match[1];
}

function luminance(hex) {
  const channels = [0, 1, 2].map((index) => Number.parseInt(hex.slice(index * 2 + 1, index * 2 + 3), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first, second) {
  const lighter = Math.max(luminance(first), luminance(second));
  const darker = Math.min(luminance(first), luminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

const themes = {
  light: readBlock(':root'),
  dark: readBlock('\\.dark'),
};
const failures = [];
const discovered = new Set();

for (const relativeFile of chartSources) {
  const source = fs.readFileSync(path.join(root, relativeFile), 'utf8');
  const visualTags = [
    ...source.matchAll(/<(?:Area|Bar|Line|Cell)\b[\s\S]*?\/>/g),
    ...source.matchAll(/stopColor=[^\n]+/g),
    ...source.matchAll(/const COLORS\s*=.*$/gm),
  ];
  for (const match of visualTags) {
    const tokens = [...match[0].matchAll(/var\(--color-([a-z-]+)\)/g)].map((tokenMatch) => tokenMatch[1]);
    for (const token of tokens) {
      discovered.add(token);
      if (!chartTokens.has(token)) {
        failures.push(`${relativeFile}: unsupported chart visual token --color-${token}`);
      }
    }
  }
}

if (discovered.size === 0) {
  failures.push('No chart visual tokens discovered in the registered chart sources');
}

for (const token of discovered) {
  for (const [themeName, block] of Object.entries(themes)) {
    const foreground = readToken(block, token);
    for (const backgroundToken of backgrounds) {
      const background = readToken(block, backgroundToken);
      const ratio = contrast(foreground, background);
      if (ratio < minimumContrast) {
        failures.push(`${themeName} --color-${token} ${foreground} vs --token-${backgroundToken} ${background}: ${ratio.toFixed(2)}:1 < ${minimumContrast}:1`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Chart non-text contrast guard passed: ${discovered.size} semantic chart tokens meet ${minimumContrast}:1 against background and raised surfaces in light and dark themes.`);
