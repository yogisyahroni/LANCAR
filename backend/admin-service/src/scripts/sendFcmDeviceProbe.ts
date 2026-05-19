import { db } from '../db';
import * as admin from 'firebase-admin';
import { getFirebaseAppForUserType, initFirebase } from '../notifications';

type ProbeRole = 'customer' | 'courier';

type ProbeArgs = {
  role: ProbeRole;
  state: string;
  userId?: string;
};

const parseArgs = (): ProbeArgs => {
  const args = process.argv.slice(2);
  const getValue = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const role = getValue('--role') as ProbeRole | undefined;
  const state = getValue('--state') || 'foreground';
  const userId = getValue('--user-id');

  if (role !== 'customer' && role !== 'courier') {
    throw new Error('Usage: npm run fcm:probe -- --role customer|courier --state foreground|background|killed [--user-id uuid]');
  }

  return { role, state, userId };
};

const findLatestRegisteredUser = async (role: ProbeRole): Promise<string> => {
  const roleJoin =
    role === 'customer'
      ? 'INNER JOIN customers c ON c.id = ud.user_id'
      : 'INNER JOIN couriers cr ON cr.id = ud.user_id';

  const result = await db.query<{ user_id: string }>(
    `
    SELECT ud.user_id
    FROM user_devices ud
    ${roleJoin}
    WHERE ud.device_token IS NOT NULL
      AND length(trim(ud.device_token)) > 0
    ORDER BY ud.last_active_at DESC NULLS LAST, ud.created_at DESC
    LIMIT 1
    `
  );

  const userId = result.rows[0]?.user_id;
  if (!userId) {
    throw new Error(`No registered ${role} FCM token found in user_devices. Login the ${role} app first.`);
  }

  return userId;
};

const sendProbePush = async ({
  userId,
  role,
  state,
  probeId,
  title,
  body,
}: {
  userId: string;
  role: ProbeRole;
  state: string;
  probeId: string;
  title: string;
  body: string;
}) => {
  const devicesResult = await db.query<{ device_token: string }>(
    `
    SELECT ud.device_token
    FROM user_devices ud
    WHERE ud.user_id = $1
      AND ud.device_token IS NOT NULL
      AND length(trim(ud.device_token)) > 0
    ORDER BY ud.last_active_at DESC NULLS LAST, ud.created_at DESC
    `,
    [userId]
  );

  const tokens = devicesResult.rows.map((row) => row.device_token);
  if (tokens.length === 0) {
    throw new Error(`No registered ${role} FCM token found for user ${userId}. Login the ${role} app first.`);
  }

  const firebaseApp = getFirebaseAppForUserType(role);
  if (!firebaseApp) {
    throw new Error(`Firebase Admin app is not initialized for ${role}.`);
  }

  const response = await admin.messaging(firebaseApp).sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: {
      probe_id: probeId,
      os_state: state,
      source: 'os_level_fcm_validation',
      type: role === 'courier' ? 'on_demand_offer' : 'order_status_update',
      role,
      dispatch_id: role === 'courier' ? probeId : '',
      offer_ttl_seconds: role === 'courier' ? '15' : '',
      deep_link: role === 'courier' ? 'lancar://courier/offers' : 'lancar://order/tracking',
    },
    android: {
      priority: 'high',
      notification: {
        clickAction: 'FLUTTER_NOTIFICATION_CLICK',
        sound: 'default',
      },
    },
  });

  const invalidTokens = response.responses
    .map((item, index) => (!item.success && item.error?.code === 'messaging/registration-token-not-registered' ? tokens[index] : null))
    .filter((token): token is string => Boolean(token));

  if (invalidTokens.length > 0) {
    await db.query('DELETE FROM user_devices WHERE device_token = ANY($1)', [invalidTokens]);
  }

  return {
    device_count: tokens.length,
    success_count: response.successCount,
    failure_count: response.failureCount,
    cleaned_invalid_tokens: invalidTokens.length,
  };
};

const main = async () => {
  const args = parseArgs();
  const userId = args.userId || (await findLatestRegisteredUser(args.role));
  const firebaseApp = await initFirebase();

  if (!firebaseApp) {
    throw new Error('Firebase Admin is not initialized. Check FIREBASE_*_SERVICE_ACCOUNT_B64 env values.');
  }

  const probeId = `fcm-probe-${args.role}-${args.state}-${Date.now()}`;
  const title = args.role === 'courier' ? 'Tes tawaran LANCAR' : 'Tes tracking LANCAR';
  const body =
    args.role === 'courier'
      ? `Validasi push kurir ${args.state}`
      : `Validasi push customer ${args.state}`;

  const sendResult = await sendProbePush({
    userId,
    role: args.role,
    state: args.state,
    probeId,
    title,
    body,
  });

  process.stdout.write(
    `__FCM_PROBE_RESULT__${JSON.stringify(
      {
        success: true,
        probe_id: probeId,
        role: args.role,
        state: args.state,
        user_id: userId,
        ...sendResult,
      },
      null,
      2
    )}`
  );
};

main()
  .catch((error) => {
    process.stderr.write(
      `__FCM_PROBE_RESULT__${JSON.stringify(
        {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )}`
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
    const { redis } = await import('../redis');
    redis.disconnect();
  });
