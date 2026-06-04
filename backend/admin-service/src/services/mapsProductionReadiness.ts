import crypto from 'crypto';
import { getMapsProviderOpsSnapshot, MapsProviderOpsSnapshot } from './mapsProviderConfig';
import {
  getActiveTomTomMapsServerCredential,
  listMapsRuntimeCredentials,
  MapsCredentialSummary,
} from './mapsRuntimeCredentials';

type MapsProductionEnvironment = 'development' | 'staging' | 'production' | 'unknown';
type MapsProductionStatus = 'ready' | 'degraded' | 'blocked';
type MapsProductionSeverity = 'info' | 'warning' | 'critical';
type MapsKeySurfaceId = 'android_courier' | 'android_customer' | 'web_browser' | 'server';
type MapsKeySource = 'env' | 'runtime_store' | 'metadata' | 'legacy_fallback' | 'missing';

type MapsProductionIssue = {
  code: string;
  severity: MapsProductionSeverity;
  message: string;
  action: string;
};

type MapsKeyRotationStatus = 'current' | 'due_soon' | 'overdue' | 'unknown';

export type MapsProductionKeyCheck = {
  id: MapsKeySurfaceId;
  label: string;
  expected_alias: string;
  alias: string | null;
  package_name?: string;
  configured: boolean;
  source: MapsKeySource;
  source_env: string[];
  key_identity: string | null;
  expected_application_restriction: string;
  declared_application_restriction: string | null;
  expected_api_restrictions: string[];
  declared_api_restrictions: string[];
  rotation: {
    status: MapsKeyRotationStatus;
    last_rotated_at: string | null;
    age_days: number | null;
    due_at: string | null;
    max_age_days: number;
  };
  issues: MapsProductionIssue[];
};

export type MapsSharedKeyFinding = {
  key_identity: string;
  surfaces: MapsKeySurfaceId[];
  severity: 'critical';
  message: string;
  action: string;
};

export type MapsProductionReadiness = {
  generated_at: string;
  environment: MapsProductionEnvironment;
  overall_status: MapsProductionStatus;
  key_inventory: MapsProductionKeyCheck[];
  shared_key_findings: MapsSharedKeyFinding[];
  active_alerts: MapsProductionIssue[];
  incident_response: {
    failover_steps: string[];
    quota_steps: string[];
    rotation_steps: string[];
  };
  docs: string[];
};

type SurfaceDefinition = {
  id: MapsKeySurfaceId;
  label: string;
  expectedAliasSuffix: string;
  packageName?: string;
  actualEnv: string[];
  configuredEnv: string;
  aliasEnv: string;
  restrictionEnv: string;
  apiEnv: string;
  rotatedAtEnv: string;
  expectedApplicationRestriction: string;
  acceptedApplicationRestrictions: string[];
  expectedApiRestrictions: string[];
  legacyEnv?: string[];
};

const API_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const PLACEHOLDER_MARKERS = ['your_', 'changeme', 'change_me', 'placeholder', 'example', '<', '>'];
const ROTATION_MAX_AGE_DAYS = 90;
const ROTATION_DUE_SOON_DAYS = 14;

const SURFACE_DEFINITIONS: SurfaceDefinition[] = [
  {
    id: 'android_courier',
    label: 'Courier Android',
    expectedAliasSuffix: 'android-courier-maps-key',
    packageName: 'com.tembus.courier',
    actualEnv: ['TOMTOM_ANDROID_COURIER_API_KEY', 'COURIER_TOMTOM_ANDROID_API_KEY'],
    configuredEnv: 'TOMTOM_ANDROID_COURIER_KEY_CONFIGURED',
    aliasEnv: 'TOMTOM_ANDROID_COURIER_KEY_ALIAS',
    restrictionEnv: 'TOMTOM_ANDROID_COURIER_KEY_RESTRICTION',
    apiEnv: 'TOMTOM_ANDROID_COURIER_KEY_APIS',
    rotatedAtEnv: 'TOMTOM_ANDROID_COURIER_KEY_ROTATED_AT',
    expectedApplicationRestriction: 'android_package_sha1',
    acceptedApplicationRestrictions: ['android_package_sha1', 'android_app', 'android_apps'],
    expectedApiRestrictions: ['maps_sdk_android', 'navigation_sdk_android'],
    legacyEnv: ['TOMTOM_ANDROID_API_KEY'],
  },
  {
    id: 'android_customer',
    label: 'Customer Android',
    expectedAliasSuffix: 'android-customer-maps-key',
    packageName: 'com.tembus.customer',
    actualEnv: ['TOMTOM_ANDROID_CUSTOMER_API_KEY', 'CUSTOMER_TOMTOM_ANDROID_API_KEY'],
    configuredEnv: 'TOMTOM_ANDROID_CUSTOMER_KEY_CONFIGURED',
    aliasEnv: 'TOMTOM_ANDROID_CUSTOMER_KEY_ALIAS',
    restrictionEnv: 'TOMTOM_ANDROID_CUSTOMER_KEY_RESTRICTION',
    apiEnv: 'TOMTOM_ANDROID_CUSTOMER_KEY_APIS',
    rotatedAtEnv: 'TOMTOM_ANDROID_CUSTOMER_KEY_ROTATED_AT',
    expectedApplicationRestriction: 'android_package_sha1',
    acceptedApplicationRestrictions: ['android_package_sha1', 'android_app', 'android_apps'],
    expectedApiRestrictions: ['maps_sdk_android'],
    legacyEnv: ['TOMTOM_ANDROID_API_KEY'],
  },
  {
    id: 'web_browser',
    label: 'Web Browser',
    expectedAliasSuffix: 'web-maps-key',
    actualEnv: ['TOMTOM_WEB_API_KEY', 'TOMTOM_PUBLIC_API_KEY'],
    configuredEnv: 'TOMTOM_WEB_KEY_CONFIGURED',
    aliasEnv: 'TOMTOM_WEB_KEY_ALIAS',
    restrictionEnv: 'TOMTOM_WEB_KEY_RESTRICTION',
    apiEnv: 'TOMTOM_WEB_KEY_APIS',
    rotatedAtEnv: 'TOMTOM_WEB_KEY_ROTATED_AT',
    expectedApplicationRestriction: 'http_referrer',
    acceptedApplicationRestrictions: ['http_referrer', 'http_referrers', 'website'],
    expectedApiRestrictions: ['maps_sdk_web'],
  },
  {
    id: 'server',
    label: 'Server Routes / Geocoding',
    expectedAliasSuffix: 'server-maps-key',
    actualEnv: ['TOMTOM_SERVER_API_KEY'],
    configuredEnv: 'TOMTOM_SERVER_KEY_CONFIGURED',
    aliasEnv: 'TOMTOM_SERVER_KEY_ALIAS',
    restrictionEnv: 'TOMTOM_SERVER_KEY_RESTRICTION',
    apiEnv: 'TOMTOM_SERVER_KEY_APIS',
    rotatedAtEnv: 'TOMTOM_SERVER_KEY_ROTATED_AT',
    expectedApplicationRestriction: 'server_ip',
    acceptedApplicationRestrictions: ['server_ip', 'ip_address', 'ip_addresses'],
    expectedApiRestrictions: ['routing', 'search', 'geocoding', 'reverse_geocoding'],
    legacyEnv: ['TOMTOM_API_KEY', 'TOMTOM_LEGACY_DIRECTIONS_API_KEY'],
  },
];

const normalizeEnvironment = (env: NodeJS.ProcessEnv): MapsProductionEnvironment => {
  const candidate = String(env.APP_ENV || env.ENVIRONMENT || env.DEPLOY_ENV || env.NODE_ENV || '').trim().toLowerCase();
  if (candidate.includes('prod')) return 'production';
  if (candidate.includes('stag')) return 'staging';
  if (candidate.includes('dev') || candidate.includes('local') || candidate === 'test') return 'development';
  return 'unknown';
};

const envText = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const value = env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const hasUsableSecret = (value: string | null): boolean => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return !PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
};

const envFlagEnabled = (env: NodeJS.ProcessEnv, name: string): boolean => {
  const value = envText(env, name);
  if (!value) return false;
  return ['1', 'true', 'yes', 'on', 'configured'].includes(value.toLowerCase());
};

const normalizeToken = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const envList = (env: NodeJS.ProcessEnv, name: string): string[] => {
  const value = envText(env, name);
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map(normalizeToken)
    .filter(Boolean);
};

const fingerprintSecret = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

const publicFingerprint = (fingerprint: string): string => `sha256:${fingerprint.slice(0, 12)}`;

const expectedAlias = (environment: MapsProductionEnvironment, suffix: string): string => {
  const prefix = environment === 'unknown' ? 'tembus-env' : `tembus-${environment}`;
  return `${prefix}-${suffix}`;
};

const firstUsableEnvValue = (env: NodeJS.ProcessEnv, names: string[]): { name: string; value: string } | null => {
  for (const name of names) {
    const value = envText(env, name);
    if (hasUsableSecret(value)) return { name, value: value! };
  }
  return null;
};

const parseDate = (value: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const rotationPosture = (
  rotatedAt: string | null,
  now: Date,
  maxAgeDays = ROTATION_MAX_AGE_DAYS
): MapsProductionKeyCheck['rotation'] => {
  const date = parseDate(rotatedAt);
  if (!date) {
    return {
      status: 'unknown',
      last_rotated_at: null,
      age_days: null,
      due_at: null,
      max_age_days: maxAgeDays,
    };
  }
  const ageDays = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
  const dueAt = new Date(date.getTime() + maxAgeDays * 86_400_000);
  const daysUntilDue = Math.floor((dueAt.getTime() - now.getTime()) / 86_400_000);
  const status: MapsKeyRotationStatus = ageDays > maxAgeDays
    ? 'overdue'
    : daysUntilDue <= ROTATION_DUE_SOON_DAYS
      ? 'due_soon'
      : 'current';
  return {
    status,
    last_rotated_at: date.toISOString(),
    age_days: ageDays,
    due_at: dueAt.toISOString(),
    max_age_days: maxAgeDays,
  };
};

const issue = (code: string, severity: MapsProductionSeverity, message: string, action: string): MapsProductionIssue => ({
  code,
  severity,
  message,
  action,
});

const restrictionIssue = (
  declared: string | null,
  definition: SurfaceDefinition
): MapsProductionIssue | null => {
  if (!declared) {
    return issue(
      'maps_key_restriction_metadata_missing',
      'warning',
      `${definition.label} belum punya deklarasi restriction di env metadata.`,
      `Set ${definition.restrictionEnv}=${definition.expectedApplicationRestriction} setelah restriction dikonfirmasi di TomTom Cloud.`
    );
  }

  const normalized = normalizeToken(declared);
  if (normalized === 'unrestricted') {
    return issue(
      'maps_key_unrestricted',
      'critical',
      `${definition.label} tidak boleh memakai unrestricted key.`,
      `Restrict key ke ${definition.expectedApplicationRestriction}, lalu update ${definition.restrictionEnv}.`
    );
  }

  if (!definition.acceptedApplicationRestrictions.includes(normalized)) {
    return issue(
      'maps_key_restriction_mismatch',
      'critical',
      `${definition.label} memakai deklarasi restriction ${declared}, bukan ${definition.expectedApplicationRestriction}.`,
      `Buat key terpisah dengan application restriction ${definition.expectedApplicationRestriction}.`
    );
  }
  return null;
};

const apiRestrictionIssues = (declaredApis: string[], definition: SurfaceDefinition): MapsProductionIssue[] => {
  if (declaredApis.length === 0) {
    return [
      issue(
        'maps_key_api_restriction_metadata_missing',
        'warning',
        `${definition.label} belum punya deklarasi API restriction.`,
        `Set ${definition.apiEnv} sesuai API yang diizinkan: ${definition.expectedApiRestrictions.join(', ')}.`
      ),
    ];
  }

  const missing = definition.expectedApiRestrictions.filter((expected) => !declaredApis.includes(normalizeToken(expected)));
  if (missing.length === 0) return [];

  return [
    issue(
      'maps_key_api_restriction_incomplete',
      'critical',
      `${definition.label} belum mendeklarasikan API restriction wajib: ${missing.join(', ')}.`,
      `Update API restrictions di TomTom Cloud lalu set ${definition.apiEnv}.`
    ),
  ];
};

const buildEnvSurfaceCheck = (
  definition: SurfaceDefinition,
  environment: MapsProductionEnvironment,
  env: NodeJS.ProcessEnv,
  now: Date
): { check: MapsProductionKeyCheck; fingerprint: string | null } => {
  const specific = firstUsableEnvValue(env, definition.actualEnv);
  const legacy = !specific && definition.legacyEnv ? firstUsableEnvValue(env, definition.legacyEnv) : null;
  const keyValue = specific?.value || legacy?.value || null;
  const configuredByMetadata = envFlagEnabled(env, definition.configuredEnv);
  const configured = Boolean(keyValue) || configuredByMetadata;
  const declaredRestriction = envText(env, definition.restrictionEnv);
  const declaredApis = envList(env, definition.apiEnv);
  const alias = envText(env, definition.aliasEnv) || (configured ? expectedAlias(environment, definition.expectedAliasSuffix) : null);
  const rotation = rotationPosture(envText(env, definition.rotatedAtEnv), now);
  const issues: MapsProductionIssue[] = [];

  if (!configured) {
    issues.push(issue(
      'maps_key_missing',
      'critical',
      `${definition.label} key belum tercatat untuk environment ini.`,
      `Isi secret spesifik (${definition.actualEnv.join(' atau ')}) atau set ${definition.configuredEnv}=true setelah key tersedia di secret manager/CI.`
    ));
  }

  if (legacy) {
    issues.push(issue(
      'maps_key_legacy_fallback_used',
      'warning',
      `${definition.label} masih memakai env legacy ${legacy.name}.`,
      `Pindahkan ke env spesifik: ${definition.actualEnv.join(' atau ')}.`
    ));
  }

  if (keyValue && !API_KEY_PATTERN.test(keyValue)) {
    issues.push(issue(
      'maps_key_format_invalid',
      'critical',
      `${definition.label} key tidak sesuai format TomTom Maps API key.`,
      'Ganti dengan API key TomTom Maps Platform yang valid dari TomTom Cloud Credentials.'
    ));
  }

  const restrictionProblem = configured ? restrictionIssue(declaredRestriction, definition) : null;
  if (restrictionProblem) issues.push(restrictionProblem);
  if (configured) issues.push(...apiRestrictionIssues(declaredApis, definition));

  if (configured && rotation.status === 'unknown') {
    issues.push(issue(
      'maps_key_rotation_date_missing',
      'warning',
      `${definition.label} belum punya tanggal rotasi.`,
      `Set ${definition.rotatedAtEnv}=YYYY-MM-DD saat key dibuat/dirotate.`
    ));
  } else if (rotation.status === 'overdue') {
    issues.push(issue(
      'maps_key_rotation_overdue',
      'warning',
      `${definition.label} sudah melewati batas rotasi ${rotation.max_age_days} hari.`,
      'Buat key baru, validasi, pindahkan traffic, lalu revoke key lama.'
    ));
  } else if (rotation.status === 'due_soon') {
    issues.push(issue(
      'maps_key_rotation_due_soon',
      'info',
      `${definition.label} mendekati jadwal rotasi.`,
      'Siapkan key baru dan jadwalkan rollout sebelum due date.'
    ));
  }

  const fingerprint = keyValue ? fingerprintSecret(keyValue) : null;

  return {
    fingerprint,
    check: {
      id: definition.id,
      label: definition.label,
      expected_alias: expectedAlias(environment, definition.expectedAliasSuffix),
      alias,
      package_name: definition.packageName,
      configured,
      source: specific ? 'env' : legacy ? 'legacy_fallback' : configuredByMetadata ? 'metadata' : 'missing',
      source_env: specific ? [specific.name] : legacy ? [legacy.name] : definition.actualEnv,
      key_identity: fingerprint ? publicFingerprint(fingerprint) : null,
      expected_application_restriction: definition.expectedApplicationRestriction,
      declared_application_restriction: declaredRestriction,
      expected_api_restrictions: definition.expectedApiRestrictions,
      declared_api_restrictions: declaredApis,
      rotation,
      issues,
    },
  };
};

const buildServerCheck = async (
  definition: SurfaceDefinition,
  environment: MapsProductionEnvironment,
  env: NodeJS.ProcessEnv,
  now: Date
): Promise<{ check: MapsProductionKeyCheck; fingerprint: string | null }> => {
  const activeCredential = await getActiveTomTomMapsServerCredential();
  const credentials = await listMapsRuntimeCredentials().catch(() => [] as MapsCredentialSummary[]);
  const activeSummary = activeCredential?.credentialId
    ? credentials.find((credential) => credential.id === activeCredential.credentialId)
    : null;

  if (activeCredential?.source === 'runtime_store') {
    const declaredApis = (activeSummary?.enabled_apis || []).map(normalizeToken);
    const declaredRestriction = activeSummary?.restriction_type || envText(env, definition.restrictionEnv);
    const rotation = rotationPosture(activeSummary?.activated_at || envText(env, definition.rotatedAtEnv), now);
    const issues: MapsProductionIssue[] = [];
    const restrictionProblem = restrictionIssue(declaredRestriction, definition);
    if (restrictionProblem) issues.push(restrictionProblem);
    issues.push(...apiRestrictionIssues(declaredApis, definition));
    if (rotation.status === 'unknown') {
      issues.push(issue(
        'maps_key_rotation_date_missing',
        'warning',
        `${definition.label} belum punya tanggal rotasi.`,
        'Activate ulang key baru dari admin Maps Runtime atau set metadata rotasi untuk env fallback.'
      ));
    } else if (rotation.status === 'overdue') {
      issues.push(issue(
        'maps_key_rotation_overdue',
        'warning',
        `${definition.label} sudah melewati batas rotasi ${rotation.max_age_days} hari.`,
        'Create credential baru di admin, test, activate, pantau route, lalu deactivate/revoke key lama.'
      ));
    }
    const fingerprint = fingerprintSecret(activeCredential.apiKey);
    return {
      fingerprint,
      check: {
        id: definition.id,
        label: definition.label,
        expected_alias: expectedAlias(environment, definition.expectedAliasSuffix),
        alias: activeCredential.keyAlias,
        configured: true,
        source: 'runtime_store',
        source_env: ['maps_provider_credentials'],
        key_identity: publicFingerprint(fingerprint),
        expected_application_restriction: definition.expectedApplicationRestriction,
        declared_application_restriction: declaredRestriction || null,
        expected_api_restrictions: definition.expectedApiRestrictions,
        declared_api_restrictions: declaredApis,
        rotation,
        issues,
      },
    };
  }

  const envCheck = buildEnvSurfaceCheck(definition, environment, env, now);
  if (envCheck.check.configured) {
    envCheck.check.issues.push(issue(
      'maps_server_key_not_runtime_rotatable',
      'warning',
      `${definition.label} masih memakai env fallback, bukan runtime credential store.`,
      'Tambahkan server key lewat admin Maps Runtime agar rotasi tidak membutuhkan restart backend.'
    ));
  }
  return envCheck;
};

const addSharedKeyFindings = (
  checks: MapsProductionKeyCheck[],
  fingerprints: Array<{ surface: MapsKeySurfaceId; fingerprint: string | null }>
): MapsSharedKeyFinding[] => {
  const groups = new Map<string, MapsKeySurfaceId[]>();
  for (const item of fingerprints) {
    if (!item.fingerprint) continue;
    const group = groups.get(item.fingerprint) || [];
    group.push(item.surface);
    groups.set(item.fingerprint, group);
  }

  const findings: MapsSharedKeyFinding[] = [];
  for (const [fingerprint, surfaces] of groups.entries()) {
    if (surfaces.length < 2) continue;
    const finding = {
      key_identity: publicFingerprint(fingerprint),
      surfaces,
      severity: 'critical' as const,
      message: 'Satu TomTom Maps API key terdeteksi dipakai oleh lebih dari satu surface.',
      action: 'Buat key terpisah per platform/environment, update secret, lalu revoke key lama setelah traffic sehat.',
    };
    findings.push(finding);
    for (const check of checks) {
      if (surfaces.includes(check.id)) {
        check.issues.push(issue(
          'maps_key_shared_across_surfaces',
          'critical',
          `${check.label} memakai key identity yang sama dengan surface lain.`,
          finding.action
        ));
      }
    }
  }
  return findings;
};

const diagnoseProviderIssue = (ops: MapsProviderOpsSnapshot): MapsProductionIssue | null => {
  const lastError = ops.last_error;
  const rawText = [
    lastError?.error_message,
    lastError?.fallback_reason,
    lastError?.provider,
    ...ops.active_alerts.map((alert) => `${alert.code} ${alert.message}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!rawText) return null;

  if (rawText.includes('api_not_activated') || rawText.includes('not enabled') || rawText.includes('api is not enabled')) {
    return issue(
      'tomtom_api_not_enabled',
      'critical',
      'TomTom Maps API yang dibutuhkan belum aktif untuk project/key ini.',
      'Enable Routes API dan Geocoding API untuk server key, atau Maps JavaScript/Maps SDK Android sesuai surface yang gagal.'
    );
  }

  if (rawText.includes('billing')) {
    return issue(
      'tomtom_billing_problem',
      'critical',
      'TomTom Maps menolak request karena billing project belum sehat.',
      'Cek Billing Account TomTom Cloud, payment method, dan budget alert sebelum mengaktifkan TomTom Maps lagi.'
    );
  }

  if (rawText.includes('request_denied') || rawText.includes('permission_denied') || rawText.includes('forbidden')) {
    return issue(
      'tomtom_request_denied',
      'critical',
      'TomTom Maps menolak request server route/geocode.',
      'Test server key di Admin Maps Runtime, cek Routes/Geocoding API, billing, dan pastikan restriction server IP sesuai VPS.'
    );
  }

  if (rawText.includes('quota') || rawText.includes('over_query_limit') || rawText.includes('resource_exhausted')) {
    return issue(
      'tomtom_quota_exhausted',
      'critical',
      'TomTom Maps quota habis atau mendekati limit operasional.',
      'Switch sementara ke OpenStreetMap/Text Only, naikkan quota pada key restricted yang benar, lalu pantau fallback rate.'
    );
  }

  if (rawText.includes('sha') || rawText.includes('package')) {
    return issue(
      'tomtom_android_authorization_failure',
      'critical',
      'Android Maps SDK kemungkinan ditolak karena package name atau SHA-1/SHA-256 tidak cocok.',
      'Cek package com.tembus.courier/com.tembus.customer, signing certificate SHA, lalu update Android key restriction di TomTom Cloud.'
    );
  }

  if (rawText.includes('circuit')) {
    return issue(
      'maps_provider_circuit_open',
      'warning',
      'Circuit breaker provider maps sedang terbuka karena kegagalan berulang.',
      'Biarkan cool-down berjalan, validasi credential/provider, lalu refresh setelah route/geocode test sehat.'
    );
  }

  return null;
};

const uniqueIssues = (items: MapsProductionIssue[]): MapsProductionIssue[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.code}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const opsAlertsToIssues = (ops: MapsProviderOpsSnapshot): MapsProductionIssue[] => {
  const alertIssues = ops.active_alerts.map((alert) => {
    const action = alert.code === 'tomtom_quota_near_limit'
      ? 'Naikkan quota/billing guard atau switch sementara ke OpenStreetMap/Text Only dari admin.'
      : alert.code === 'maps_provider_failure_high'
        ? 'Cek credential, API enablement, billing, dan konektivitas provider. Gunakan emergency fallback jika perlu.'
        : alert.code === 'maps_latency_high'
          ? 'Pantau provider latency dan pertimbangkan fallback jika mobile mulai lambat.'
          : 'Ikuti panel Maps Runtime untuk fallback dan pemulihan provider.';
    return issue(alert.code, alert.severity, alert.message, action);
  });
  const diagnosis = diagnoseProviderIssue(ops);
  return uniqueIssues(diagnosis ? [...alertIssues, diagnosis] : alertIssues);
};

const overallStatus = (checks: MapsProductionKeyCheck[], shared: MapsSharedKeyFinding[], alerts: MapsProductionIssue[]): MapsProductionStatus => {
  const issues = [...checks.flatMap((check) => check.issues), ...alerts];
  if (shared.length > 0 || issues.some((item) => item.severity === 'critical')) return 'blocked';
  if (issues.some((item) => item.severity === 'warning')) return 'degraded';
  return 'ready';
};

export const getMapsProductionReadiness = async (
  env: NodeJS.ProcessEnv = process.env,
  now = new Date()
): Promise<MapsProductionReadiness> => {
  const environment = normalizeEnvironment(env);
  const checks: MapsProductionKeyCheck[] = [];
  const fingerprints: Array<{ surface: MapsKeySurfaceId; fingerprint: string | null }> = [];

  for (const definition of SURFACE_DEFINITIONS) {
    const result = definition.id === 'server'
      ? await buildServerCheck(definition, environment, env, now)
      : buildEnvSurfaceCheck(definition, environment, env, now);
    checks.push(result.check);
    fingerprints.push({ surface: definition.id, fingerprint: result.fingerprint });
  }

  const sharedKeyFindings = addSharedKeyFindings(checks, fingerprints);
  const ops = await getMapsProviderOpsSnapshot();
  const activeAlerts = opsAlertsToIssues(ops);

  return {
    generated_at: now.toISOString(),
    environment,
    overall_status: overallStatus(checks, sharedKeyFindings, activeAlerts),
    key_inventory: checks,
    shared_key_findings: sharedKeyFindings,
    active_alerts: activeAlerts,
    incident_response: {
      failover_steps: [
        'Buka Admin > Maps Runtime.',
        'Klik Restore OpenStreetMap untuk fallback visual map yang aman.',
        'Jika provider tetap gagal atau quota habis, aktifkan Text-Only Mode agar order tetap berjalan.',
        'Catat incident dan provider issue sebelum menaikkan traffic lagi.',
      ],
      quota_steps: [
        'Cek billing dan quota TomTom Maps Platform.',
        'Jika remaining quota <= 10%, switch sementara ke OpenStreetMap/Text Only.',
        'Naikkan quota hanya untuk key restricted yang benar, bukan unrestricted key.',
      ],
      rotation_steps: [
        'Buat key baru dengan restriction yang sama atau lebih ketat.',
        'Server key: test dan activate lewat Admin Maps Runtime.',
        'Android key: build release baru, tunggu adoption, lalu revoke key lama setelah traffic pindah.',
        'Web key: update secret/env, deploy frontend/admin dashboard, lalu revoke old key.',
      ],
    },
    docs: [
      'docs/TomTom-maps-production-key-runbook.md',
      'docs/TomTom-maps-demo-readiness.md',
      'docs/VPS_SECURITY_RUNBOOK.md',
    ],
  };
};
