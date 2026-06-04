export type ReadinessStatus = 'ready' | 'waiting_for_secret' | 'needs_device_validation';

export type OnDemandExternalReadinessCheck = {
  key: string;
  label: string;
  status: ReadinessStatus;
  configured: boolean;
  required_env: string[];
  message: string;
};

export type OnDemandExternalReadiness = {
  overall_status: 'ready_for_staging_validation' | 'waiting_for_configuration';
  checks: OnDemandExternalReadinessCheck[];
  next_steps: string[];
  docs: string[];
};

const PLACEHOLDER_MARKERS = ['your_', 'changeme', 'placeholder', 'example', '<', '>'];

const hasUsableSecret = (value?: string): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
};

export const hastomtomDirectionsConfig = (env: NodeJS.ProcessEnv = process.env): boolean =>
  hasUsableSecret(env.TOMTOM_SERVER_API_KEY) ||
  hasUsableSecret(env.TOMTOM_LEGACY_DIRECTIONS_API_KEY) ||
  hasUsableSecret(env.TOMTOM_API_KEY);

const decodeBase64 = (encoded?: string): string | undefined => {
  if (!encoded || !encoded.trim()) return undefined;
  try {
    return Buffer.from(encoded.trim(), 'base64').toString('utf8');
  } catch {
    return undefined;
  }
};

const getFirebaseServiceAccountValue = (raw?: string, encoded?: string): string | undefined =>
  raw && raw.trim() ? raw : decodeBase64(encoded);

export const parseFirebaseServiceAccount = (
  raw?: string,
  encoded?: string
): { valid: boolean; projectId?: string } => {
  const serviceAccountValue = getFirebaseServiceAccountValue(raw, encoded);

  if (!serviceAccountValue || !serviceAccountValue.trim()) {
    return { valid: false };
  }

  const normalized = serviceAccountValue.trim().toLowerCase();
  if (normalized === 'your_firebase_service_account_json' || normalized === 'placeholder') {
    return { valid: false };
  }

  try {
    const parsed = JSON.parse(serviceAccountValue);
    const valid = Boolean(parsed.project_id && parsed.client_email && parsed.private_key);
    return {
      valid,
      projectId: typeof parsed.project_id === 'string' ? parsed.project_id : undefined
    };
  } catch {
    return { valid: false };
  }
};

export const hasFirebaseAdminConfig = (env: NodeJS.ProcessEnv = process.env): boolean => {
  const defaultServiceAccount = parseFirebaseServiceAccount(
    env.FIREBASE_SERVICE_ACCOUNT,
    env.FIREBASE_SERVICE_ACCOUNT_B64
  );
  const customerServiceAccount = parseFirebaseServiceAccount(
    env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT,
    env.FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64
  );
  const courierServiceAccount = parseFirebaseServiceAccount(
    env.FIREBASE_COURIER_SERVICE_ACCOUNT,
    env.FIREBASE_COURIER_SERVICE_ACCOUNT_B64
  );
  const hasLegacyMetadataOnly = hasUsableSecret(env.FIREBASE_PROJECT_ID) || hasUsableSecret(env.FCM_PROJECT_ID);

  return defaultServiceAccount.valid || (customerServiceAccount.valid && courierServiceAccount.valid) || hasLegacyMetadataOnly;
};

export const getOnDemandExternalReadiness = (
  env: NodeJS.ProcessEnv = process.env
): OnDemandExternalReadiness => {
  const tomtomReady = hastomtomDirectionsConfig(env);
  const firebaseReady = hasFirebaseAdminConfig(env);

  const checks: OnDemandExternalReadinessCheck[] = [
    {
      key: 'TOMTOM_directions',
      label: 'TomTom Maps Routes / Directions',
      status: tomtomReady ? 'ready' : 'waiting_for_secret',
      configured: tomtomReady,
      required_env: ['TOMTOM_SERVER_API_KEY', 'TOMTOM_API_KEY', 'TOMTOM_LEGACY_DIRECTIONS_API_KEY'],
      message: tomtomReady
        ? 'Route polyline, ETA, dan traffic-aware policy siap memakai provider eksternal.'
        : 'Isi TOMTOM_SERVER_API_KEY atau TOMTOM_API_KEY dengan key yang sudah mengaktifkan Routes API. TOMTOM_LEGACY_DIRECTIONS_API_KEY tetap bisa dipakai sebagai fallback legacy.'
    },
    {
      key: 'firebase_admin',
      label: 'Firebase Admin / FCM',
      status: firebaseReady ? 'ready' : 'waiting_for_secret',
      configured: firebaseReady,
      required_env: [
        'FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64',
        'FIREBASE_CUSTOMER_PROJECT_ID',
        'FIREBASE_COURIER_SERVICE_ACCOUNT_B64',
        'FIREBASE_COURIER_PROJECT_ID',
        'FIREBASE_SERVICE_ACCOUNT'
      ],
      message: firebaseReady
        ? 'Backend siap mengirim push notification FCM untuk customer dan kurir setelah device mendaftarkan token.'
        : 'Isi Firebase Admin service account customer dan kurir. Gunakan *_SERVICE_ACCOUNT_B64 untuk format Docker yang aman.'
    },
    {
      key: 'device_validation',
      label: 'Device / Emulator Staging',
      status: tomtomReady && firebaseReady ? 'needs_device_validation' : 'waiting_for_secret',
      configured: false,
      required_env: [],
      message:
        tomtomReady && firebaseReady
          ? 'Infra sudah siap. Lanjutkan login customer dan kurir di device/emulator untuk validasi FCM foreground/background/killed app.'
          : 'Device validation bisa dijalankan setelah TomTom Maps dan Firebase secret terisi.'
    }
  ];

  const waiting = checks.filter((check) => check.status === 'waiting_for_secret');

  return {
    overall_status: waiting.length === 0 ? 'ready_for_staging_validation' : 'waiting_for_configuration',
    checks,
    next_steps:
      waiting.length === 0
        ? [
            'Deploy service dengan env staging terbaru.',
            'Login customer dan kurir di emulator/device staging.',
            'Jalankan checklist FCM dan tracking end-to-end.'
          ]
        : waiting.map((check) => check.message),
    docs: ['docs/on-demand-external-keys-setup.md', 'docs/on-demand-fcm-staging-checklist.md']
  };
};
