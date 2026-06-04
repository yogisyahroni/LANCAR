const WEAK_SECRET_MARKERS = [
  'changeme',
  'change_me',
  'placeholder',
  'example',
  'your-secret-key',
  'your_secret',
  'tembus_secret_key_change_me',
];

const WEAK_URL_MARKERS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'guest:guest',
  'password_url_encoded',
  'password_raw',
  'redis_password_url_encoded',
  'rabbitmq_password_url_encoded',
  'changeme',
  'change_me',
  'placeholder',
  'example',
];

const isProductionRuntime = () =>
  process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production';

const isBlank = (value: string | undefined) => !value || value.trim().length === 0;

const includesAnyMarker = (value: string, markers: string[]) => {
  const normalizedValue = value.toLowerCase();
  return markers.some((marker) => normalizedValue.includes(marker));
};

const requirePresent = (name: string, failures: string[]) => {
  const value = process.env[name];
  if (isBlank(value)) {
    failures.push(`${name} is required in production`);
    return undefined;
  }
  return value!.trim();
};

const requireStrongSecret = (name: string, failures: string[], minLength = 32) => {
  const value = requirePresent(name, failures);
  if (!value) return;
  if (value.length < minLength) {
    failures.push(`${name} must be at least ${minLength} characters in production`);
  }
  if (includesAnyMarker(value, WEAK_SECRET_MARKERS)) {
    failures.push(`${name} contains a weak placeholder marker`);
  }
};

const requireProductionUrl = (name: string, failures: string[]) => {
  const value = requirePresent(name, failures);
  if (!value) return;
  if (includesAnyMarker(value, WEAK_URL_MARKERS)) {
    failures.push(`${name} must not point to localhost, guest credentials, or placeholder values in production`);
  }
};

const rejectWeakOptionalValue = (name: string, failures: string[], markers = WEAK_SECRET_MARKERS) => {
  const value = process.env[name];
  if (isBlank(value)) return;
  if (includesAnyMarker(value!, markers)) {
    failures.push(`${name} contains a weak placeholder marker`);
  }
};

const validateObservabilityEnv = (failures: string[]) => {
  const enabled = process.env.OTEL_ENABLED === 'true';
  const protocol = process.env.OTEL_EXPORTER_OTLP_PROTOCOL;
  const sampler = process.env.OTEL_TRACES_SAMPLER;
  const samplerArg = process.env.OTEL_TRACES_SAMPLER_ARG;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!enabled) return;

  if (isBlank(endpoint)) {
    failures.push('OTEL_EXPORTER_OTLP_ENDPOINT is required when OTEL_ENABLED=true');
  } else {
    try {
      const parsed = new URL(endpoint!);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        failures.push('OTEL_EXPORTER_OTLP_ENDPOINT must be an http(s) URL');
      }
      if (isProductionRuntime() && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
        failures.push('OTEL_EXPORTER_OTLP_ENDPOINT must use an internal collector host, not localhost, in production');
      }
    } catch {
      failures.push('OTEL_EXPORTER_OTLP_ENDPOINT must be a valid URL when OTEL_ENABLED=true');
    }
  }

  if (protocol && !['grpc', 'http/protobuf'].includes(protocol)) {
    failures.push('OTEL_EXPORTER_OTLP_PROTOCOL must be grpc or http/protobuf');
  }

  if (sampler && !['always_on', 'always_off', 'traceidratio'].includes(sampler)) {
    failures.push('OTEL_TRACES_SAMPLER must be always_on, always_off, or traceidratio');
  }

  if (sampler === 'traceidratio') {
    const ratio = Number(samplerArg);
    if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
      failures.push('OTEL_TRACES_SAMPLER_ARG must be a number between 0 and 1 when OTEL_TRACES_SAMPLER=traceidratio');
    }
  }
};

const hasAnyFirebaseCredential = () =>
  Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_B64 ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64 ||
      process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT ||
      process.env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON ||
      process.env.FIREBASE_COURIER_SERVICE_ACCOUNT_B64 ||
      process.env.FIREBASE_COURIER_SERVICE_ACCOUNT ||
      process.env.FIREBASE_COURIER_SERVICE_ACCOUNT_JSON,
  );

export const validateProductionEnv = () => {
  if (!isProductionRuntime()) return;

  const failures: string[] = [];

  requireStrongSecret('JWT_SECRET', failures);
  requireStrongSecret('INTERNAL_GATEWAY_SECRET', failures);
  requireProductionUrl('DATABASE_URL', failures);
  requireProductionUrl('READ_DATABASE_URL', failures);
  requireProductionUrl('REDIS_URL', failures);
  requirePresent('ALLOWED_ORIGINS', failures);

  if (process.env.OUTBOX_RABBITMQ_ENABLED === 'true') {
    requireProductionUrl('RABBITMQ_URL', failures);
  } else if (!isBlank(process.env.RABBITMQ_URL)) {
    requireProductionUrl('RABBITMQ_URL', failures);
  }

  if (process.env.MIDTRANS_ENV === 'production') {
    requireStrongSecret('MIDTRANS_SERVER_KEY', failures, 16);
    requireStrongSecret('MIDTRANS_CLIENT_KEY', failures, 8);
    requireProductionUrl('MIDTRANS_FINISH_URL', failures);
    requireProductionUrl('FRONTEND_URL', failures);
    requireProductionUrl('PUBLIC_APP_URL', failures);
  } else {
    rejectWeakOptionalValue('MIDTRANS_SERVER_KEY', failures);
    rejectWeakOptionalValue('MIDTRANS_CLIENT_KEY', failures);
  }

  rejectWeakOptionalValue('GOOGLE_MAPS_API_KEY', failures);
  rejectWeakOptionalValue('GOOGLE_ROUTES_API_KEY', failures);
  rejectWeakOptionalValue('GOOGLE_DIRECTIONS_API_KEY', failures);
  rejectWeakOptionalValue('GOOGLE_MAPS_BROWSER_API_KEY', failures);
  rejectWeakOptionalValue('GOOGLE_MAPS_ANDROID_COURIER_API_KEY', failures);
  rejectWeakOptionalValue('GOOGLE_MAPS_ANDROID_CUSTOMER_API_KEY', failures);
  if (!isBlank(process.env.GOOGLE_MAPS_ANDROID_API_KEY)) {
    failures.push('GOOGLE_MAPS_ANDROID_API_KEY is legacy/debug-only; production Android release builds must use courier/customer-specific keys');
  }
  requireStrongSecret('MAPS_CREDENTIAL_ENCRYPTION_KEY', failures, 32);
  rejectWeakOptionalValue('PAYMENT_WEBHOOK_SECRET', failures);
  rejectWeakOptionalValue('PAYOUT_WEBHOOK_SECRET', failures);
  rejectWeakOptionalValue('COURIER_PAYOUT_WEBHOOK_SECRET', failures);
  rejectWeakOptionalValue('FIREBASE_SERVICE_ACCOUNT_B64', failures);
  rejectWeakOptionalValue('FIREBASE_SERVICE_ACCOUNT', failures);
  rejectWeakOptionalValue('FIREBASE_SERVICE_ACCOUNT_JSON', failures);
  rejectWeakOptionalValue('FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64', failures);
  rejectWeakOptionalValue('FIREBASE_CUSTOMER_SERVICE_ACCOUNT', failures);
  rejectWeakOptionalValue('FIREBASE_CUSTOMER_SERVICE_ACCOUNT_JSON', failures);
  rejectWeakOptionalValue('FIREBASE_COURIER_SERVICE_ACCOUNT_B64', failures);
  rejectWeakOptionalValue('FIREBASE_COURIER_SERVICE_ACCOUNT', failures);
  rejectWeakOptionalValue('FIREBASE_COURIER_SERVICE_ACCOUNT_JSON', failures);

  if (process.env.FCM_REQUIRED === 'true' && !hasAnyFirebaseCredential()) {
    failures.push('FCM_REQUIRED=true requires a Firebase service account credential');
  }

  validateObservabilityEnv(failures);

  if (failures.length > 0) {
    console.error('[admin-service] Production environment validation failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
};

export const assertProductionRequiredEnv = (name: string) => {
  if (!isProductionRuntime()) return;
  if (isBlank(process.env[name])) {
    throw new Error(`${name} is required in production`);
  }
};
