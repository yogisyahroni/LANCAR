import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const surfaces = [
  ['admin-dashboard/src/components/Charts.tsx', ['revenue-chart-summary', 'order-distribution-chart-summary']],
  ['admin-dashboard/src/pages/Analytics.tsx', ['sla-chart-summary', 'surge-chart-summary', 'accuracy-chart-summary']],
  ['admin-dashboard/src/pages/PricingConfig.tsx', ['pricing-simulation-summary']],
  ['admin-dashboard/src/pages/finance/treasury/RekeningGridSection.tsx', ['finance-revenue-breakdown-summary', 'finance-burn-analysis-summary']],
  ['admin-dashboard/src/pages/TaxCenter.tsx', ['tax-revenue-trend-summary']],
];

const failures = [];
for (const [relativeFile, summaryIds] of surfaces) {
  const file = path.join(root, relativeFile);
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('ResponsiveContainer')) {
    failures.push(`${relativeFile}: missing ResponsiveContainer inventory marker`);
  }
  for (const summaryId of summaryIds) {
    const summaryIndex = source.indexOf(`id="${summaryId}"`);
    if (summaryIndex < 0) {
      failures.push(`${relativeFile}: missing #${summaryId}`);
      continue;
    }
    const windowStart = Math.max(0, summaryIndex - 520);
    const wrapper = source.slice(windowStart, summaryIndex + 700);
    if (!/role="(?:img|group)"/.test(wrapper) || !new RegExp(`aria-describedby="${summaryId}"`).test(wrapper)) {
      failures.push(`${relativeFile}: #${summaryId} is not attached to a named chart region`);
    }
    if (!source.slice(summaryIndex, summaryIndex + 850).includes('map(')) {
      failures.push(`${relativeFile}: #${summaryId} does not expose direct data values`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`Chart accessibility guard passed: ${surfaces.reduce((count, [, ids]) => count + ids.length, 0)} chart summaries expose named direct-data alternatives.`);
