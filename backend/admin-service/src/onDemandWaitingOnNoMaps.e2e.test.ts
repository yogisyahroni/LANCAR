const makeServiceAccountBase64 = (projectId: string) =>
  Buffer.from(
    JSON.stringify({
      project_id: projectId,
      client_email: `firebase-adminsdk@test-${projectId}.iam.gserviceaccount.com`,
      private_key: '-----BEGIN PRIVATE KEY-----\\ntest-key\\n-----END PRIVATE KEY-----\\n',
    }),
    'utf8'
  ).toString('base64');

describe('waiting-on automation without TomTom Maps keys', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      TOMTOM_API_KEY: '',
      TOMTOM_LEGACY_DIRECTIONS_API_KEY: '',
      FIREBASE_CUSTOMER_PROJECT_ID: 'android-customer-c2872',
      FIREBASE_CUSTOMER_SERVICE_ACCOUNT_B64: makeServiceAccountBase64('android-customer-c2872'),
      FIREBASE_COURIER_PROJECT_ID: 'android-kurir',
      FIREBASE_COURIER_SERVICE_ACCOUNT_B64: makeServiceAccountBase64('android-kurir'),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.dontMock('firebase-admin/app');
    jest.dontMock('firebase-admin/messaging');
    jest.dontMock('./db');
    jest.dontMock('./websocket');
    jest.dontMock('./services/realtimeObservability');
  });

  it('keeps FCM customer-courier automation green even when Directions API keys are not configured', async () => {
    const initializedApps: Array<{ name: string }> = [];
    const sendEachForMulticast = jest.fn().mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    });
    const credentialCert = jest.fn((serviceAccount) => ({ serviceAccount }));
    const initializeApp = jest.fn((_config, appName: string) => {
      const app = { name: appName };
      initializedApps.push(app);
      return app;
    });
    const messaging = jest.fn((_app) => ({ sendEachForMulticast }));

    jest.doMock('firebase-admin/app', () => ({
      getApps: () => initializedApps,
      initializeApp,
      cert: credentialCert,
    }));
    jest.doMock('firebase-admin/messaging', () => ({
      getMessaging: messaging,
    }));

    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] }) // ensureUserDevicesTable
      .mockResolvedValueOnce({ rows: [{ id: 'notification-customer-1' }] }) // create customer notification
      .mockResolvedValueOnce({
        rows: [{
          device_token: 'customer-fcm-token',
          user_type: 'customer',
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'notification-courier-1' }] }) // create courier notification
      .mockResolvedValueOnce({
        rows: [{
          device_token: 'courier-fcm-token',
          user_type: 'courier',
        }],
      });

    jest.doMock('./db', () => ({
      db: { query },
      readDb: { query: jest.fn() },
    }));

    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    jest.doMock('./websocket', () => ({
      getIO: jest.fn(() => ({ to })),
    }));

    const recordPushDelivery = jest.fn();
    jest.doMock('./services/realtimeObservability', () => ({
      recordPushDelivery,
      recordRealtimeMetric: jest.fn(),
    }));

    const readiness = await import('./services/onDemandExternalReadiness');
    expect(readiness.hastomtomDirectionsConfig()).toBe(false);
    expect(readiness.hasFirebaseAdminConfig()).toBe(true);

    const notifications = await import('./notifications');
    await notifications.initFirebase();

    expect(notifications.getConfiguredFirebaseTargets()).toEqual(['customer', 'courier']);
    expect(initializeApp).toHaveBeenCalledWith(expect.any(Object), 'tembus-customer');
    expect(initializeApp).toHaveBeenCalledWith(expect.any(Object), 'tembus-courier');

    await notifications.createNotification({
      user_id: 'customer-user-1',
      title: 'Kurir menuju pickup',
      body: 'Kurir sedang menuju titik pickup.',
      type: 'courier_otw_pickup',
      order_id: 'order-1',
    });

    await notifications.createNotification({
      user_id: 'courier-user-1',
      title: 'Tawaran baru',
      body: 'Ada pekerjaan on-demand baru.',
      type: 'on_demand_offer',
      order_id: 'order-1',
      metadata: {
        dispatch_id: 'dispatch-1',
        offer_ttl_seconds: 15,
      },
    });

    expect(messaging).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'tembus-customer' }));
    expect(messaging).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'tembus-courier' }));
    expect(sendEachForMulticast).toHaveBeenNthCalledWith(1, expect.objectContaining({
      tokens: ['customer-fcm-token'],
      data: expect.objectContaining({
        type: 'courier_otw_pickup',
        order_id: 'order-1',
      }),
    }));
    expect(sendEachForMulticast).toHaveBeenNthCalledWith(2, expect.objectContaining({
      tokens: ['courier-fcm-token'],
      data: expect.objectContaining({
        type: 'on_demand_offer',
        dispatch_id: 'dispatch-1',
        offer_ttl_seconds: '15',
      }),
    }));
    expect(recordPushDelivery).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'customer-user-1',
      device_count: 1,
      success_count: 1,
      failure_count: 0,
    }));
    expect(recordPushDelivery).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'courier-user-1',
      device_count: 1,
      success_count: 1,
      failure_count: 0,
    }));
  });
});
