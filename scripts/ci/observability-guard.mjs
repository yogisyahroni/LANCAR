import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const sourceRoots = [
  'backend/api-gateway/src',
  'backend/admin-service/src',
  'backend/auth-service',
  'backend/routing-service',
  'android-app/app/src/main/java',
  'android-app-customer/app/src/main/java',
];
const workflowRoot = '.github/workflows';
const sourceExtensions = new Set(['.go', '.js', '.ts', '.kt']);
const ignoredSegments = new Set([
  '.gradle',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
]);
const ignoredFilePattern = /\.(test|spec)\.(js|ts|kt|go)$/i;
const allowedKeys = new Set([
  'auth.challenge_id',
  'auth.channel',
  'auth.channel.fallback',
  'auth.device_id_present',
  'auth.email_hash',
  'auth.email_verified',
  'auth.flow',
  'auth.identifier_type',
  'auth.otp.required',
  'auth.platform',
  'auth.purpose',
  'auth.refresh_token.rotate',
  'auth.require_2fa',
  'auth.result',
  'auth.totp_verified',
  'auth.transaction_id',
  'correlation_id',
  'deployment.environment',
  'http.method',
  'http.route',
  'http.status_code',
  'request.id',
  'request_id',
  'route.cache_hit',
  'route.distance_bucket',
  'route.provider',
  'service.name',
  'span_id',
  'trace_id',
  'zone.resolved',
]);

const attributePattern =
  /(?:attribute\.(?:String|Bool|Int|Int64|Float64)|setAttribute|setAttributes)\s*\(\s*["'`]([^"'`]+)["'`]/g;
const structuredKeyPattern = /["'`]([^"'`]+)["'`]\s*:/g;
const logSinkPattern =
  /(logger\.logger\.(?:debug|info|warn|error|fatal)|securityLog\.(?:info|warn|error)|writeStructuredLog|logJSON|log\.Printf)/g;
const artifactUploadPattern = /uses:\s*actions\/upload-artifact@/i;

const normalizeKey = (key) => key.trim().toLowerCase().replace(/\s+/g, '_');

const isForbiddenKey = (key) => {
  const normalized = normalizeKey(key);
  if (allowedKeys.has(normalized)) return false;
  if (normalized === 'authorization' || normalized.endsWith('.authorization')) return true;
  if (normalized === 'cookie' || normalized.endsWith('.cookie')) return true;
  if (normalized.includes('password')) return true;
  if (normalized === 'otp' || normalized.includes('.otp') || normalized.includes('_otp')) return true;
  if (normalized === 'rawbody' || normalized === 'raw_body') return true;
  if (normalized.includes('request.body') || normalized.includes('request_body')) return true;
  if (normalized.includes('response.body') || normalized.includes('response_body')) return true;
  if (/(^|[._-])token($|[._-])/.test(normalized)) return true;
  return false;
};

function* walk(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory)) {
    if (ignoredSegments.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    yield fullPath;
  }
}

const failures = [];

const addFailure = (file, message) => {
  failures.push(`${relative(root, file)}: ${message}`);
};

const scanAttributes = (file, content) => {
  for (const match of content.matchAll(attributePattern)) {
    const key = match[1];
    if (isForbiddenKey(key)) {
      addFailure(file, `unsafe OpenTelemetry attribute key "${key}"`);
    }
  }
};

const scanLogBlocks = (file, content) => {
  for (const match of content.matchAll(logSinkPattern)) {
    const block = content.slice(match.index ?? 0, (match.index ?? 0) + 1600);
    for (const keyMatch of block.matchAll(structuredKeyPattern)) {
      const key = keyMatch[1];
      if (isForbiddenKey(key)) {
        addFailure(file, `unsafe structured log key near ${match[1]}: "${key}"`);
      }
    }
  }
};

const scanWorkflowArtifacts = (file, content) => {
  if (!artifactUploadPattern.test(content)) return;
  const uploadBlocks = content.split(/(?=\n\s*-\s+name:|\n\s*-\s+uses:)/g);
  for (const block of uploadBlocks) {
    if (!artifactUploadPattern.test(block)) continue;
    const lowered = block.toLowerCase();
    if (lowered.includes('trace') || lowered.includes('jaeger') || lowered.includes('otel')) {
      addFailure(file, 'workflow must not upload trace, Jaeger, or OpenTelemetry artifacts');
    }
  }
};

for (const sourceRoot of sourceRoots) {
  for (const file of walk(join(root, sourceRoot))) {
    if (!sourceExtensions.has(extname(file))) continue;
    if (ignoredFilePattern.test(file)) continue;
    const content = readFileSync(file, 'utf8');
    scanAttributes(file, content);
    scanLogBlocks(file, content);
  }
}

for (const workflow of walk(join(root, workflowRoot))) {
  if (!/\.(ya?ml)$/i.test(workflow)) continue;
  scanWorkflowArtifacts(workflow, readFileSync(workflow, 'utf8'));
}

if (failures.length > 0) {
  console.error('Observability guard failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Observability guard passed');
