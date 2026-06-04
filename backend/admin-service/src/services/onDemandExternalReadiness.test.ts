import {
  getOnDemandExternalReadiness,
  hasFirebaseAdminConfig,
  hastomtomDirectionsConfig,
  parseFirebaseServiceAccount
} from './onDemandExternalReadiness';

describe('onDemandExternalReadiness', () => {
  const makeServiceAccount = (projectId: string) =>
    JSON.stringify({
      project_id: projectId,
      client_email: `firebase-adminsdk@example.iam.gserviceaccount.com`,
      private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'
    });

  it('marks tomtom routing ready when routes, maps, or directions key is configured', () => {
    expect(hastomtomDirectionsConfig({ TOMTOM_SERVER_API_KEY: 'routes-real-key' })).toBe(true);
    expect(hastomtomDirectionsConfig({ TOMTOM_API_KEY: 'AIza-real-key' })).toBe(true);
    expect(hastomtomDirectionsConfig({ TOMTOM_LEGACY_DIRECTIONS_API_KEY: 'directions-real-key' })).toBe(true);
    expect(hastomtomDirectionsConfig({ TOMTOM_API_KEY: 'your_TOMTOM_api_key' })).toBe(false);
  });

  it('validates Firebase service account shape without exposing the secret', () => {
    const raw = makeServiceAccount('tembus-staging');

    expect(parseFirebaseServiceAccount(raw)).toEqual({ valid: true, projectId: 'tembus-staging' });
    expect(hasFirebaseAdminConfig({ FIREBASE_SERVICE_ACCOUNT: raw })).toBe(true);
    expect(hasFirebaseAdminConfig({ FIREBASE_SERVICE_ACCOUNT: '{bad-json' })).toBe(false);
  });

  it('validates Firebase service account from base64 for Docker-safe envs', () => {
    const raw = makeServiceAccount('android-customer-c2872');
    const encoded = Buffer.from(raw, 'utf8').toString('base64');

    expect(parseFirebaseServiceAccount(undefined, encoded)).toEqual({
      valid: true,
      projectId: 'android-customer-c2872'
    });
    expect(
      hasFirebaseAdminConfig({
        FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64: encoded,
        FIREBASE_COURIER_SERVICE_ACCOUNT_B64: Buffer.from(makeServiceAccount('android-kurir'), 'utf8').toString(
          'base64'
        )
      })
    ).toBe(true);
  });

  it('returns waiting status until external secrets are inserted', () => {
    const readiness = getOnDemandExternalReadiness({});

    expect(readiness.overall_status).toBe('waiting_for_configuration');
    expect(readiness.checks.find((check) => check.key === 'TOMTOM_directions')?.status).toBe('waiting_for_secret');
    expect(readiness.checks.find((check) => check.key === 'firebase_admin')?.status).toBe('waiting_for_secret');
  });

  it('returns ready for staging validation after tomtom and Firebase config exist', () => {
    const readiness = getOnDemandExternalReadiness({
      TOMTOM_SERVER_API_KEY: 'routes-real-key',
      FIREBASE_SERVICE_ACCOUNT: makeServiceAccount('tembus-staging')
    });

    expect(readiness.overall_status).toBe('ready_for_staging_validation');
    expect(readiness.checks.find((check) => check.key === 'device_validation')?.status).toBe(
      'needs_device_validation'
    );
    expect(JSON.stringify(readiness)).not.toContain('AIza-real-key');
    expect(JSON.stringify(readiness)).not.toContain('PRIVATE KEY');
  });

  it('returns ready when customer and courier Firebase projects are configured separately', () => {
    const readiness = getOnDemandExternalReadiness({
      TOMTOM_SERVER_API_KEY: 'routes-real-key',
      FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64: Buffer.from(
        makeServiceAccount('android-customer-c2872'),
        'utf8'
      ).toString('base64'),
      FIREBASE_COURIER_SERVICE_ACCOUNT_B64: Buffer.from(makeServiceAccount('android-kurir'), 'utf8').toString(
        'base64'
      )
    });

    expect(readiness.overall_status).toBe('ready_for_staging_validation');
    expect(readiness.checks.find((check) => check.key === 'firebase_admin')?.message).toContain('customer dan kurir');
  });
});
