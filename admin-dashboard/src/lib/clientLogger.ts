type ClientLogMeta = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /token|cookie|authorization|password|pin|otp|secret|credential|phone|email|address|location|payload|body|lat|lng|coordinate/i;

const isDebugEnabled = () =>
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_CLIENT_DEBUG_LOGS === "true";

const sanitizeValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (typeof value === "string") {
    if (value.length > 120) return `${value.slice(0, 120)}...`;
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 5).map(sanitizeValue);
  }

  if (value && typeof value === "object") {
    return "[object]";
  }

  return value;
};

const sanitizeMeta = (meta?: ClientLogMeta) => {
  if (!meta) return undefined;

  return Object.fromEntries(
    Object.entries(meta).map(([key, value]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeValue(value),
    ])
  );
};

export const clientLog = {
  debug(message: string, meta?: ClientLogMeta) {
    if (!isDebugEnabled()) return;
    console.debug(message, sanitizeMeta(meta));
  },
  warn(message: string, meta?: ClientLogMeta) {
    if (!isDebugEnabled()) return;
    console.warn(message, sanitizeMeta(meta));
  },
  error(message: string, meta?: ClientLogMeta) {
    if (!isDebugEnabled()) return;
    console.error(message, sanitizeMeta(meta));
  },
};
