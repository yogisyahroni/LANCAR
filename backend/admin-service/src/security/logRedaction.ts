import { getCurrentRequestContext } from '../middleware/requestContext';

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /password|passcode|pin|otp|token|secret|api[_-]?key|authorization|cookie|signature|credential|card|cvv|pan|qris|raw[_-]?body|request[_-]?body|response[_-]?body|request\.body|response\.body/i;
const OBSERVABILITY_KEY_PATTERN = /^(correlation_id|request_id|trace_id|span_id)$/i;
const SAFE_OBSERVABILITY_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?62|0)8[\d\s-]{7,15}\d(?!\d)/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi;
const API_KEY_PATTERN = /\b(?:sk|pk|rk|AIza|SG|xox[baprs])[-_A-Za-z0-9]{12,}\b/g;
const LONG_HEX_PATTERN = /\b[a-f0-9]{32,}\b/gi;
const CARD_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
const URL_CREDENTIAL_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)([^:@\s/]+):([^@\s/]+)@/gi;

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const maskEmail = (value: string) => {
  const [localPart, domain] = value.split('@');
  if (!localPart || !domain) return REDACTED;
  return `${localPart.slice(0, 2)}***@${domain}`;
};

const maskPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6) return REDACTED;
  return `${digits.slice(0, 3)}***${digits.slice(-3)}`;
};

const preserveObservabilityId = (key: string, value: unknown) => {
  if (typeof value !== 'string') return REDACTED;
  const candidate = value.trim();
  if (/^trace_id$/i.test(key)) {
    return /^[a-f0-9]{32}$/i.test(candidate) ? candidate : REDACTED;
  }
  if (/^span_id$/i.test(key)) {
    return /^[a-f0-9]{16}$/i.test(candidate) ? candidate : REDACTED;
  }
  return SAFE_OBSERVABILITY_VALUE_PATTERN.test(candidate) ? candidate : REDACTED;
};

export const redactString = (value: string) =>
  value
    .replace(URL_CREDENTIAL_PATTERN, `$1${REDACTED}@`)
    .replace(BEARER_PATTERN, `Bearer ${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(API_KEY_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, (email) => maskEmail(email))
    .replace(PHONE_PATTERN, (phone) => maskPhone(phone))
    .replace(CARD_PATTERN, REDACTED)
    .replace(LONG_HEX_PATTERN, REDACTED);

const redactObject = (value: Record<string, unknown>, seen: WeakSet<object>) => {
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      OBSERVABILITY_KEY_PATTERN.test(key)
        ? preserveObservabilityId(key, nestedValue)
        : SENSITIVE_KEY_PATTERN.test(key)
          ? REDACTED
          : redactForLog(nestedValue, seen),
    ])
  );
};

export const redactForLog = (value: unknown, seen = new WeakSet<object>()): JsonLike | string => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
    } as Record<string, JsonLike | undefined> as JsonLike;
  }

  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, seen)) as JsonLike[];
  if (typeof value === 'object' && value) return redactObject(value as Record<string, unknown>, seen) as JsonLike;
  if (typeof value === 'undefined') return 'undefined';
  return String(value);
};

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ level: 'error', message: 'Failed to serialize log event' });
  }
};

export const writeStructuredLog = (level: LogLevel, message: string, meta?: unknown) => {
  const context = getCurrentRequestContext();
  const event = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME || 'admin-service',
    ...(context
      ? {
          correlation_id: context.correlationId,
          request_id: context.requestId,
          trace_id: context.traceId,
          span_id: context.spanId,
        }
      : {}),
    message: redactString(message),
    ...(meta === undefined ? {} : { meta: redactForLog(meta) }),
  };

  const line = safeStringify(event);
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
};

export const securityLog = {
  info: (message: string, meta?: unknown) => {
    writeStructuredLog('info', message, meta);
  },
  warn: (message: string, meta?: unknown) => {
    writeStructuredLog('warn', message, meta);
  },
  error: (message: string, meta?: unknown) => {
    writeStructuredLog('error', message, meta);
  },
};

let consoleRedactionInstalled = false;

export const installConsoleRedaction = () => {
  if (consoleRedactionInstalled) return;
  consoleRedactionInstalled = true;

  const wrap = (method: 'log' | 'info' | 'warn' | 'error') => {
    console[method] = (...args: unknown[]) => {
      const [firstArg, ...rest] = args;
      const message = typeof firstArg === 'string' ? firstArg : 'console event';
      const meta = typeof firstArg === 'string'
        ? (rest.length === 0 ? undefined : rest)
        : args;
      writeStructuredLog(method === 'log' ? 'info' : method, message, meta);
    };
  };

  wrap('log');
  wrap('info');
  wrap('warn');
  wrap('error');
};
