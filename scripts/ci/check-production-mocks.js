const { execFileSync } = require('child_process');
const fs = require('fs');

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const runtimeRoots = [
  'backend/admin-service/src/',
  'backend/auth-service/internal/',
  'backend/order-service/internal/',
  'backend/payment-service/internal/',
  'backend/routing-service/internal/',
  'frontend/src/',
  'android-app/app/src/main/',
  'android-app-customer/app/src/main/',
];

const excludedPathPatterns = [
  /(^|\/)(test|tests|__tests__|test-results|playwright-report)\//i,
  /\.test\.(ts|tsx|js|jsx|go|kt)$/i,
  /_test\.go$/i,
  /(^|\/)seed[^/]*\.(ts|js|sql)$/i,
  /seed-comprehensive\.ts$/i,
  /\.(png|jpg|jpeg|webp|gif|ico|lock|exe)$/i,
  /(^|\/)docs?\//i,
];

const forbiddenPatterns = [
  { pattern: /mock_snap_token/i, reason: 'fake Midtrans Snap token' },
  { pattern: /\[MOCK OTP SEND\]|\[MOCK COURIER OTP SEND\]/i, reason: 'OTP code logging/mock sender' },
  { pattern: /MOCK_SIGNATURE/i, reason: 'payment webhook signature bypass' },
  { pattern: /Mocking Midtrans|MOCK-MT-|dummyQR/i, reason: 'fake Midtrans QRIS provider response' },
  { pattern: /code\s*(?:==|===)\s*['"](?:123456|111111)['"]/i, reason: 'hardcoded OTP bypass code' },
  { pattern: /password\s*(?:==|===)\s*['"](?:123456|admin123|hashed_pin)['"]/i, reason: 'hardcoded login bypass password' },
  { pattern: /Send OTP fallback|fallback redirection on missing\/mock API endpoint/i, reason: 'client-side fake success fallback' },
  { pattern: /simulated_\$\{|checkSimulatedWeather|Math\.random\(\).*dimension/i, reason: 'simulated runtime production data' },
  { pattern: /Delivered notification .* successfully/i, reason: 'fake notification provider delivery' },
  { pattern: /Math\.random\(\)/i, reason: 'runtime pseudo-random mock data/id generation' },
];

const findings = [];

for (const file of trackedFiles) {
  if (!runtimeRoots.some((root) => file.startsWith(root))) continue;
  if (excludedPathPatterns.some((pattern) => pattern.test(file))) continue;

  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    forbiddenPatterns.forEach(({ pattern, reason }) => {
      if (pattern.test(line)) {
        findings.push(`${file}:${index + 1} ${reason}: ${line.trim()}`);
      }
    });
  });
}

if (findings.length > 0) {
  console.error('Production mock guard failed. Remove runtime mock/hardcoded production data patterns:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('Production mock guard passed.');
