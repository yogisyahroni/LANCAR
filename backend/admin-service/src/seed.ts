import { PoolClient } from 'pg';
import { db } from './db';

const DEV_COURIER_ZONE_CODE = 'JKT-PST';

type DevelopmentCourierAccount = {
  email: string;
  phoneNumber: string;
  fullName: string;
  vehiclePlate: string;
  applicationChannel: 'on_demand' | 'regular';
  serviceRole: 'on_demand' | 'pickup_only' | 'delivery_only';
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: number;
};

type DevelopmentCustomerAccount = {
  email: string;
  phoneNumber: string;
  fullName: string;
};

const DEV_CUSTOMER_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=2$WYID1WrJJf2UjFDrnrP/Xg$QS327ZhyYvWoFv9tZMwkhjE/QCv08fAQkdP7FfWXM1Y';

const DEVELOPMENT_COURIER_ACCOUNTS: DevelopmentCourierAccount[] = [
  {
    email: 'andri.pratama@tembus.id',
    phoneNumber: '6281211112222',
    fullName: 'Andri Pratama',
    vehiclePlate: 'B 1001 TBS',
    applicationChannel: 'on_demand',
    serviceRole: 'on_demand',
    vehicleBrand: 'Honda',
    vehicleModel: 'Beat',
    vehicleYear: 2024,
  },
  {
    email: 'raka.pickup@tembus.id',
    phoneNumber: '6281222223333',
    fullName: 'Raka Pickup',
    vehiclePlate: 'B 1002 TBS',
    applicationChannel: 'regular',
    serviceRole: 'pickup_only',
    vehicleBrand: 'Yamaha',
    vehicleModel: 'Mio',
    vehicleYear: 2023,
  },
  {
    email: 'dimas.delivery@tembus.id',
    phoneNumber: '6281233334444',
    fullName: 'Dimas Delivery',
    vehiclePlate: 'B 1003 TBS',
    applicationChannel: 'regular',
    serviceRole: 'delivery_only',
    vehicleBrand: 'Honda',
    vehicleModel: 'Vario',
    vehicleYear: 2023,
  },
];

const DEVELOPMENT_CUSTOMER_ACCOUNTS: DevelopmentCustomerAccount[] = [
  {
    email: 'customer@tembus.id',
    phoneNumber: '6281244445555',
    fullName: 'Tembus Customer',
  },
  {
    email: 'customer.mobile@tembus.id',
    phoneNumber: '6281255556666',
    fullName: 'Tembus Mobile Customer',
  },
];

const isProductionRuntime = () => {
  const nodeEnv = (process.env.NODE_ENV || '').trim().toLowerCase();
  const environment = (process.env.ENVIRONMENT || '').trim().toLowerCase();
  return nodeEnv === 'production' || environment === 'production';
};

const isSeedEnabled = () => {
  const seedDb = (process.env.SEED_DB || '').trim().toLowerCase();
  return seedDb === 'true' || seedDb === '1' || seedDb === 'yes';
};

const queryOptionalZoneId = async (client: PoolClient) => {
  const result = await client.query<{ id: string }>(
    `SELECT id
     FROM zones
     WHERE code = $1
     LIMIT 1`,
    [DEV_COURIER_ZONE_CODE]
  );
  return result.rows[0]?.id || null;
};

const upsertDevelopmentCourierUser = async (
  client: PoolClient,
  account: DevelopmentCourierAccount,
) => {
  const result = await client.query<{ id: string }>(
    `WITH matched_user AS (
       SELECT id
       FROM users
       WHERE email = $2
          OR phone_number = $3
       ORDER BY
         CASE
           WHEN email = $2 THEN 1
           ELSE 2
         END
       LIMIT 1
     ),
     updated_user AS (
       UPDATE users
       SET
         full_name = $1,
         email = $2,
         phone_number = $3,
         role = 'courier',
         status = 'active',
         pin_hash = 'hashed_pin',
         is_verified = true,
         updated_at = NOW()
       WHERE id = (SELECT id FROM matched_user)
       RETURNING id
     ),
     inserted_user AS (
       INSERT INTO users (
         full_name,
         email,
         phone_number,
         role,
         status,
         pin_hash,
         is_verified,
         created_at,
         updated_at
       )
       SELECT $1, $2, $3, 'courier', 'active', 'hashed_pin', true, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM updated_user)
       ON CONFLICT (email)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         phone_number = EXCLUDED.phone_number,
         role = 'courier',
         status = 'active',
         pin_hash = 'hashed_pin',
         is_verified = true,
         updated_at = NOW()
       RETURNING id
     )
     SELECT id FROM updated_user
     UNION ALL
     SELECT id FROM inserted_user
     LIMIT 1`,
    [account.fullName, account.email, account.phoneNumber]
  );
  return result.rows[0].id;
};

const upsertDevelopmentCustomerUser = async (
  client: PoolClient,
  account: DevelopmentCustomerAccount,
) => {
  const result = await client.query<{ id: string }>(
    `WITH matched_user AS (
       SELECT id
       FROM users
       WHERE email = $2
          OR phone_number = $3
       ORDER BY
         CASE
           WHEN email = $2 THEN 1
           ELSE 2
         END
       LIMIT 1
     ),
     updated_user AS (
       UPDATE users
       SET
         full_name = $1,
         email = $2,
         phone_number = $3,
         role = 'customer',
         status = 'active',
         password_hash = $4,
         is_verified = true,
         updated_at = NOW()
       WHERE id = (SELECT id FROM matched_user)
       RETURNING id
     ),
     inserted_user AS (
       INSERT INTO users (
         full_name,
         email,
         phone_number,
         role,
         status,
         password_hash,
         is_verified,
         created_at,
         updated_at
       )
       SELECT $1, $2, $3, 'customer', 'active', $4, true, NOW(), NOW()
       WHERE NOT EXISTS (SELECT 1 FROM updated_user)
       ON CONFLICT (email)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         phone_number = EXCLUDED.phone_number,
         role = 'customer',
         status = 'active',
         password_hash = EXCLUDED.password_hash,
         is_verified = true,
         updated_at = NOW()
       RETURNING id
     )
     SELECT id FROM updated_user
     UNION ALL
     SELECT id FROM inserted_user
     LIMIT 1`,
    [
      account.fullName,
      account.email,
      account.phoneNumber,
      DEV_CUSTOMER_PASSWORD_HASH,
    ]
  );
  return result.rows[0].id;
};

const upsertDevelopmentCourierProfile = async (
  client: PoolClient,
  courierUserId: string,
  zoneId: string | null,
  account: DevelopmentCourierAccount,
) => {
  const result = await client.query<{ id: string }>(
    `INSERT INTO courier_profiles (
       user_id,
       vehicle_type,
       vehicle_plate,
       vehicle_cc,
       verification_status,
       tier,
       is_online,
       current_zone_id,
       is_verified,
       verified_at,
       liveness_verified,
       application_channel,
       vehicle_brand,
       vehicle_model,
       vehicle_year,
       vehicle_category,
       onboarding_checklist,
       reviewed_at,
       created_at,
       updated_at
     )
     VALUES (
       $1,
       'matic',
       $2,
       125,
       'approved',
       'regular',
       false,
       $3::uuid,
       true,
       NOW(),
       true,
       $4::varchar,
       $5::varchar,
       $6::varchar,
       $7::integer,
       'motorcycle',
       '{"identity": true, "vehicle": true, "bank": true}'::jsonb,
       NOW(),
       NOW(),
       NOW()
     )
     ON CONFLICT (user_id)
     DO UPDATE SET
       vehicle_type = EXCLUDED.vehicle_type,
       vehicle_plate = EXCLUDED.vehicle_plate,
       vehicle_cc = EXCLUDED.vehicle_cc,
       verification_status = 'approved',
       tier = 'regular',
       current_zone_id = EXCLUDED.current_zone_id,
       is_verified = true,
       verified_at = COALESCE(courier_profiles.verified_at, NOW()),
       liveness_verified = true,
       application_channel = EXCLUDED.application_channel,
       vehicle_brand = EXCLUDED.vehicle_brand,
       vehicle_model = EXCLUDED.vehicle_model,
       vehicle_year = EXCLUDED.vehicle_year,
       vehicle_category = EXCLUDED.vehicle_category,
       onboarding_checklist = EXCLUDED.onboarding_checklist,
       reviewed_at = COALESCE(courier_profiles.reviewed_at, NOW()),
       updated_at = NOW()
     RETURNING id`,
    [
      courierUserId,
      account.vehiclePlate,
      zoneId,
      account.applicationChannel,
      account.vehicleBrand,
      account.vehicleModel,
      account.vehicleYear,
    ]
  );
  return result.rows[0].id;
};

const upsertDevelopmentCourierVehicle = async (
  client: PoolClient,
  courierProfileId: string,
  account: DevelopmentCourierAccount,
) => {
  const result = await client.query<{ id: string }>(
    `INSERT INTO courier_vehicles (
       courier_profile_id,
       plate_number,
       vehicle_type,
       vehicle_category,
       brand,
       model,
       production_year,
       engine_cc,
       engine_type,
       max_weight_kg,
       is_primary,
       verification_status,
       approved_at,
       created_at,
       updated_at
     )
     VALUES (
       $1,
       $2,
       'motor',
       'motorcycle',
       $3::varchar,
       $4::varchar,
       $5::integer,
       125,
       'gasoline',
       20,
       true,
       'approved',
       NOW(),
       NOW(),
       NOW()
     )
     ON CONFLICT (courier_profile_id, plate_number)
     DO UPDATE SET
       vehicle_type = EXCLUDED.vehicle_type,
       vehicle_category = EXCLUDED.vehicle_category,
       brand = EXCLUDED.brand,
       model = EXCLUDED.model,
       production_year = EXCLUDED.production_year,
       engine_cc = EXCLUDED.engine_cc,
       engine_type = EXCLUDED.engine_type,
       max_weight_kg = EXCLUDED.max_weight_kg,
       is_primary = true,
       verification_status = 'approved',
       approved_at = COALESCE(courier_vehicles.approved_at, NOW()),
       updated_at = NOW()
     RETURNING id`,
    [
      courierProfileId,
      account.vehiclePlate,
      account.vehicleBrand,
      account.vehicleModel,
      account.vehicleYear,
    ]
  );
  return result.rows[0].id;
};

const upsertDevelopmentCourierCapabilities = async (
  client: PoolClient,
  courierProfileId: string,
  vehicleId: string,
  account: DevelopmentCourierAccount,
) => {
  await client.query(
    `INSERT INTO courier_service_capabilities (
       courier_profile_id,
       vehicle_id,
       service_code,
       application_channel,
       status,
       eligibility_reason,
       max_weight_kg,
       approved_at,
       created_at,
       updated_at
     )
     SELECT
       $1,
       $2,
       code,
       $3::varchar,
       'enabled',
       $4::text,
       CASE
         WHEN code = 'tembus_mobil' THEN 100
         ELSE 20
       END,
       NOW(),
       NOW(),
       NOW()
     FROM delivery_service_products
     WHERE service_category = $3::varchar
     ON CONFLICT (courier_profile_id, service_code)
     DO UPDATE SET
       vehicle_id = EXCLUDED.vehicle_id,
       application_channel = EXCLUDED.application_channel,
       status = 'enabled',
       eligibility_reason = EXCLUDED.eligibility_reason,
       max_weight_kg = EXCLUDED.max_weight_kg,
       approved_at = COALESCE(courier_service_capabilities.approved_at, NOW()),
       updated_at = NOW()`,
    [
      courierProfileId,
      vehicleId,
      account.applicationChannel,
      `Development seed courier for ${account.serviceRole.replace('_', ' ')} mobile verification`,
    ]
  );
};

const disableDevelopmentOtpFlags = async (client: PoolClient) => {
  await client.query(
    `UPDATE feature_flags
     SET
       is_enabled = false,
       updated_at = NOW()
     WHERE key IN (
       'courier_login_otp_required',
       'customer_auth_otp_required'
     )`
  );
};

export const seedDevelopmentData = async () => {
  if (!isSeedEnabled()) return;
  if (isProductionRuntime()) {
    console.warn(JSON.stringify({
      event: 'development_seed_skipped',
      reason: 'production_runtime',
    }));
    return;
  }

  const seedPin = (process.env.DEV_SEEDED_COURIER_PIN || '').trim();
  if (seedPin.length < 6) {
    throw new Error('DEV_SEEDED_COURIER_PIN must be at least 6 characters when SEED_DB is enabled');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const zoneId = await queryOptionalZoneId(client);
    const seededCouriers: string[] = [];
    const seededCustomers: string[] = [];

    for (const account of DEVELOPMENT_COURIER_ACCOUNTS) {
      const courierUserId = await upsertDevelopmentCourierUser(client, account);
      const courierProfileId = await upsertDevelopmentCourierProfile(client, courierUserId, zoneId, account);
      const vehicleId = await upsertDevelopmentCourierVehicle(client, courierProfileId, account);
      await upsertDevelopmentCourierCapabilities(client, courierProfileId, vehicleId, account);
      seededCouriers.push(account.email);
    }

    for (const account of DEVELOPMENT_CUSTOMER_ACCOUNTS) {
      await upsertDevelopmentCustomerUser(client, account);
      seededCustomers.push(account.email);
    }

    await disableDevelopmentOtpFlags(client);

    await client.query('COMMIT');
    console.info(JSON.stringify({
      event: 'development_seed_ready',
      courier_emails: seededCouriers.map((email) => email.replace(/^(.{2}).+(@.+)$/, '$1***$2')),
      customer_emails: seededCustomers.map((email) => email.replace(/^(.{2}).+(@.+)$/, '$1***$2')),
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
