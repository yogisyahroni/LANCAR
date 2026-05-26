const WEAK_SECRET_MARKERS = [
  'changeme',
  'change_me',
  'placeholder',
  'example',
  'your-secret-key',
  'your_secret',
  'lancar_secret_key_change_me',
];

const isProductionRuntime = () =>
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

const isBlank = (value: string | undefined) => !value || value.trim().length === 0;

const includesAnyMarker = (value: string, markers: string[]) => {
  const normalizedValue = value.toLowerCase();
  return markers.some((marker) => normalizedValue.includes(marker));
};

const requireStrongSecret = (name: string, failures: string[], minLength = 32) => {
  const value = process.env[name];
  if (isBlank(value)) {
    failures.push(`${name} is required in production`);
    return;
  }
  if (value!.trim().length < minLength) {
    failures.push(`${name} must be at least ${minLength} characters in production`);
  }
  if (includesAnyMarker(value!, WEAK_SECRET_MARKERS)) {
    failures.push(`${name} contains a weak placeholder marker`);
  }
};

const validateAllowedOrigins = (failures: string[]) => {
  const origins = process.env.ALLOWED_ORIGINS;
  if (isBlank(origins)) {
    failures.push('ALLOWED_ORIGINS is required in production');
    return;
  }
  const normalizedOrigins = origins!.toLowerCase();
  if (normalizedOrigins.includes('localhost') || normalizedOrigins.includes('127.0.0.1')) {
    failures.push('ALLOWED_ORIGINS must not include localhost or 127.0.0.1 in production');
  }
};

const validateDocsProtection = (failures: string[]) => {
  const username = process.env.DOCS_BASIC_AUTH_USERNAME;
  const password = process.env.DOCS_BASIC_AUTH_PASSWORD;

  if ((username && !password) || (!username && password)) {
    failures.push('DOCS_BASIC_AUTH_USERNAME and DOCS_BASIC_AUTH_PASSWORD must be configured together');
  }

  if (password) {
    if (password.trim().length < 16) {
      failures.push('DOCS_BASIC_AUTH_PASSWORD must be at least 16 characters in production');
    }
    if (includesAnyMarker(password, WEAK_SECRET_MARKERS)) {
      failures.push('DOCS_BASIC_AUTH_PASSWORD contains a weak placeholder marker');
    }
  }
};

export const validateProductionEnv = () => {
  if (!isProductionRuntime()) return;

  const failures: string[] = [];
  requireStrongSecret('JWT_SECRET', failures);
  requireStrongSecret('INTERNAL_GATEWAY_SECRET', failures);
  requireStrongSecret('METRICS_BEARER_TOKEN', failures);
  validateAllowedOrigins(failures);
  validateDocsProtection(failures);

  if (failures.length > 0) {
    console.error('[api-gateway] Production environment validation failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
};
