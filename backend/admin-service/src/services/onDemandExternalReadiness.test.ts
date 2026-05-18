import {
  getOnDemandExternalReadiness,
  hasFirebaseAdminConfig,
  hasGoogleDirectionsConfig,
  parseFirebaseServiceAccount
} from './onDemandExternalReadiness';

describe('onDemandExternalReadiness', () => {
  it('marks Google Directions ready when either maps key is configured', () => {
    expect(hasGoogleDirectionsConfig({ GOOGLE_MAPS_API_KEY: 'AIza-real-key' })).toBe(true);
    expect(hasGoogleDirectionsConfig({ GOOGLE_DIRECTIONS_API_KEY: 'directions-real-key' })).toBe(true);
    expect(hasGoogleDirectionsConfig({ GOOGLE_MAPS_API_KEY: 'your_google_maps_api_key' })).toBe(false);
  });

  it('validates Firebase service account shape without exposing the secret', () => {
    const raw = JSON.stringify({
      project_id: 'lancar-staging',
      client_email: 'firebase-adminsdk@example.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'
    });

    expect(parseFirebaseServiceAccount(raw)).toEqual({ valid: true, projectId: 'lancar-staging' });
    expect(hasFirebaseAdminConfig({ FIREBASE_SERVICE_ACCOUNT: raw })).toBe(true);
    expect(hasFirebaseAdminConfig({ FIREBASE_SERVICE_ACCOUNT: '{bad-json' })).toBe(false);
  });

  it('returns waiting status until external secrets are inserted', () => {
    const readiness = getOnDemandExternalReadiness({});

    expect(readiness.overall_status).toBe('waiting_for_configuration');
    expect(readiness.checks.find((check) => check.key === 'google_directions')?.status).toBe('waiting_for_secret');
    expect(readiness.checks.find((check) => check.key === 'firebase_admin')?.status).toBe('waiting_for_secret');
  });

  it('returns ready for staging validation after Google and Firebase config exist', () => {
    const readiness = getOnDemandExternalReadiness({
      GOOGLE_MAPS_API_KEY: 'AIza-real-key',
      FIREBASE_SERVICE_ACCOUNT: JSON.stringify({
        project_id: 'lancar-staging',
        client_email: 'firebase-adminsdk@example.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n'
      })
    });

    expect(readiness.overall_status).toBe('ready_for_staging_validation');
    expect(readiness.checks.find((check) => check.key === 'device_validation')?.status).toBe(
      'needs_device_validation'
    );
    expect(JSON.stringify(readiness)).not.toContain('AIza-real-key');
    expect(JSON.stringify(readiness)).not.toContain('PRIVATE KEY');
  });
});
