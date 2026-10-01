import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import { PoolClient } from 'pg';
import { db } from './db';

const UAT_CREDIT_IDR = 1_000_000;
const UAT_CREDIT_DAYS = 30;

type UATAccount = {
  email: string;
  phoneNumber: string;
  fullName: string;
  role: 'customer' | 'courier';
  passwordEnv: string;
  serviceCategories?: string[];
  allowsTambalBan?: boolean;
  allowsTowing?: boolean;
  vehiclePlate?: string;
};

const ACCOUNTS: UATAccount[] = [
  { email: 'uat.customer.01@bawain.my.id', phoneNumber: '6281300001001', fullName: 'UAT Customer 01', role: 'customer', passwordEnv: 'UAT_CUSTOMER_01_PASSWORD' },
  { email: 'uat.customer.02@bawain.my.id', phoneNumber: '6281300001002', fullName: 'UAT Customer 02', role: 'customer', passwordEnv: 'UAT_CUSTOMER_02_PASSWORD' },
  { email: 'uat.customer.03@bawain.my.id', phoneNumber: '6281300001003', fullName: 'UAT Customer 03', role: 'customer', passwordEnv: 'UAT_CUSTOMER_03_PASSWORD' },
  {
    email: 'uat.courier.roadside.01@bawain.my.id', phoneNumber: '6281300011001', fullName: 'UAT Courier Roadside 01', role: 'courier', passwordEnv: 'UAT_ROADSIDE_01_PASSWORD',
    serviceCategories: ['on_demand', 'tambal_ban_motor', 'food_delivery'], allowsTambalBan: true, vehiclePlate: 'B 7101 UAT',
  },
  {
    email: 'uat.courier.roadside.02@bawain.my.id', phoneNumber: '6281300011002', fullName: 'UAT Courier Roadside 02', role: 'courier', passwordEnv: 'UAT_ROADSIDE_02_PASSWORD',
    serviceCategories: ['on_demand', 'tambal_ban_motor', 'food_delivery'], allowsTambalBan: true, vehiclePlate: 'B 7102 UAT',
  },
  {
    email: 'uat.courier.towing.01@bawain.my.id', phoneNumber: '6281300021001', fullName: 'UAT Courier Towing 01', role: 'courier', passwordEnv: 'UAT_TOWING_01_PASSWORD',
    serviceCategories: ['towing_motor'], allowsTowing: true, vehiclePlate: 'B 7201 UAT',
  },
  {
    email: 'uat.courier.towing.02@bawain.my.id', phoneNumber: '6281300021002', fullName: 'UAT Courier Towing 02', role: 'courier', passwordEnv: 'UAT_TOWING_02_PASSWORD',
    serviceCategories: ['towing_motor'], allowsTowing: true, vehiclePlate: 'B 7202 UAT',
  },
];

const requireOptIn = () => {
  const enabled = ['1', 'true', 'yes'].includes(String(process.env.UAT_SEED_ENABLED || '').trim().toLowerCase());
  const production = ['production'].includes(String(process.env.NODE_ENV || '').trim().toLowerCase())
    || ['production'].includes(String(process.env.ENVIRONMENT || '').trim().toLowerCase());
  if (!enabled || production) throw new Error('Set UAT_SEED_ENABLED=true in a non-production environment to run this seed');
};

const requirePassword = (name: string) => {
  const password = String(process.env[name] || '');
  if (password.length < 12) throw new Error(`${name} must be provided and at least 12 characters long`);
  return password;
};

const upsertUser = async (client: PoolClient, account: UATAccount, passwordHash: string) => {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 OR phone_number = $2 ORDER BY (email = $1) DESC LIMIT 1 FOR UPDATE`,
    [account.email, account.phoneNumber],
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE users
          SET full_name = $1, email = $2, phone_number = $3, role = $4,
              status = 'active', deleted_at = NULL, password_hash = $5::text,
              pin_hash = $5::varchar, is_verified = TRUE, updated_at = NOW()
        WHERE id = $6`,
      [account.fullName, account.email, account.phoneNumber, account.role, passwordHash, existing.rows[0].id],
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO users (full_name, email, phone_number, role, status, password_hash, pin_hash, is_verified, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', $5::text, $5::varchar, TRUE, NOW(), NOW())
     RETURNING id`,
    [account.fullName, account.email, account.phoneNumber, account.role, passwordHash],
  );
  return inserted.rows[0].id;
};

const upsertCourierProfile = async (client: PoolClient, account: UATAccount, userId: string) => {
  if (account.role !== 'courier') return;
  const profileResult = await client.query<{ id: string }>(
    `INSERT INTO courier_profiles (
       user_id, vehicle_type, vehicle_plate, vehicle_cc, verification_status,
       onboarding_status, status, market_code, application_channel,
       vehicle_brand, vehicle_model, vehicle_year, vehicle_category,
       onboarding_checklist, service_categories, allows_tambal_ban,
       allows_towing, is_online, current_location, current_lat, current_lng,
       is_verified, verified_at, reviewed_at, updated_at
     ) VALUES (
       $1, 'matic', $2, 110, 'approved', 'ACTIVE', 'offline', 'id', 'on_demand',
       'Honda', 'Beat', 2024, 'motorcycle', '{"passed":true,"uat_allowlist":true}'::jsonb,
       $3::text[], $4, $5, FALSE, ST_GeogFromText('POINT(106.827 -6.175)'), -6.175, 106.827,
       TRUE, NOW(), NOW(), NOW()
     )
     ON CONFLICT (user_id) DO UPDATE SET
       vehicle_type = EXCLUDED.vehicle_type,
       vehicle_plate = EXCLUDED.vehicle_plate,
       verification_status = EXCLUDED.verification_status,
       onboarding_status = EXCLUDED.onboarding_status,
       status = 'offline',
       application_channel = EXCLUDED.application_channel,
       vehicle_brand = EXCLUDED.vehicle_brand,
       vehicle_model = EXCLUDED.vehicle_model,
       vehicle_year = EXCLUDED.vehicle_year,
       vehicle_category = EXCLUDED.vehicle_category,
       onboarding_checklist = EXCLUDED.onboarding_checklist,
       service_categories = EXCLUDED.service_categories,
       allows_tambal_ban = EXCLUDED.allows_tambal_ban,
       allows_towing = EXCLUDED.allows_towing,
       is_online = FALSE,
       current_location = EXCLUDED.current_location,
       current_lat = EXCLUDED.current_lat,
       current_lng = EXCLUDED.current_lng,
       is_verified = TRUE,
       verified_at = NOW(),
       reviewed_at = NOW(),
       updated_at = NOW()
     RETURNING id`,
    [
      userId,
      account.vehiclePlate,
      account.serviceCategories || [],
      account.allowsTambalBan === true,
      account.allowsTowing === true,
    ],
  );
  const profileId = profileResult.rows[0]?.id;
  if (!profileId) throw new Error(`courier profile upsert returned no id for ${account.email}`);

  const serviceCode = account.allowsTowing ? 'towing_motor' : 'tambal_ban_motor';
  const price = account.allowsTowing ? 50_000 : 30_000;
  await client.query(
    `INSERT INTO courier_service_prices (
       courier_id, service_code, price_amount, min_price, max_price,
       is_active, per_km_rate_idr, toll_entry_idr, toll_exit_idr, price_per_hole_idr
     ) VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8, $9)
     ON CONFLICT (courier_id, service_code) DO UPDATE SET
       price_amount = EXCLUDED.price_amount,
       min_price = EXCLUDED.min_price,
       max_price = EXCLUDED.max_price,
       is_active = TRUE,
       per_km_rate_idr = EXCLUDED.per_km_rate_idr,
       toll_entry_idr = EXCLUDED.toll_entry_idr,
       toll_exit_idr = EXCLUDED.toll_exit_idr,
       price_per_hole_idr = EXCLUDED.price_per_hole_idr,
       updated_at = NOW()`,
    [profileId, serviceCode, price, account.allowsTowing ? 50_000 : 10_000, account.allowsTowing ? 500_000 : 150_000, account.allowsTowing ? 5_000 : 0, account.allowsTowing ? 10_000 : 0, account.allowsTowing ? 10_000 : 0, account.allowsTowing ? 0 : 10_000],
  );
};

const seedCustomerCredit = async (client: PoolClient, userId: string, email: string) => {
  const reference = `UAT-CREDIT-${email}`;
  const expiresAt = new Date(Date.now() + UAT_CREDIT_DAYS * 24 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO uat_test_accounts (user_id, account_type, allow_withdrawal, wallet_credit_idr, wallet_credit_reference, wallet_credit_expires_at)
     VALUES ($1, 'customer', FALSE, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       account_type = 'customer', allow_withdrawal = FALSE,
       wallet_credit_idr = GREATEST(uat_test_accounts.wallet_credit_idr, EXCLUDED.wallet_credit_idr),
       wallet_credit_reference = COALESCE(uat_test_accounts.wallet_credit_reference, EXCLUDED.wallet_credit_reference),
       wallet_credit_expires_at = COALESCE(uat_test_accounts.wallet_credit_expires_at, EXCLUDED.wallet_credit_expires_at),
       updated_at = NOW()`,
    [userId, UAT_CREDIT_IDR, reference, expiresAt],
  );

  const walletResult = await client.query<{ id: string; balance: string }>(
    `SELECT id, balance::text FROM customer_wallets WHERE customer_id = $1 FOR UPDATE`,
    [userId],
  );
  const wallet = walletResult.rows[0] || (await client.query<{ id: string; balance: string }>(
    `INSERT INTO customer_wallets (customer_id, balance, currency, status)
     VALUES ($1, 0, 'IDR', 'active') RETURNING id, balance::text`,
    [userId],
  )).rows[0];

  const creditExists = await client.query<{ id: string }>(
    `SELECT id FROM customer_wallet_transactions WHERE reference_id = $1 LIMIT 1`,
    [reference],
  );
  if (creditExists.rows[0]) return;

  const balanceAfter = Number(wallet.balance) + UAT_CREDIT_IDR;
  await client.query(`UPDATE customer_wallets SET balance = $2, status = 'active', updated_at = NOW() WHERE id = $1`, [wallet.id, balanceAfter]);
  await client.query(
    `INSERT INTO customer_wallet_transactions (wallet_id, type, amount, fee, status, reference_id, metadata)
     VALUES ($1, 'DEPOSIT', $2, 0, 'COMPLETED', $3, $4::jsonb)`,
    [wallet.id, UAT_CREDIT_IDR, reference, JSON.stringify({ source: 'uat_allowlist', withdrawable: false, expires_at: expiresAt.toISOString() })],
  );
  await client.query(
    `INSERT INTO customer_wallet_ledger_entries (
       customer_id, wallet_id, idempotency_key, entry_type, direction,
       amount_idr, balance_after_idr, metadata
     ) VALUES ($1, $2, $3, 'uat_test_credit', 'credit', $4, $5, $6::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [userId, wallet.id, reference, UAT_CREDIT_IDR, balanceAfter, JSON.stringify({ source: 'uat_allowlist', withdrawable: false, expires_at: expiresAt.toISOString() })],
  );
};

const main = async () => {
  requireOptIn();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const account of ACCOUNTS) {
      const password = requirePassword(account.passwordEnv);
      const passwordHash = account.role === 'courier'
        ? await argon2.hash(password, { type: argon2.argon2id })
        : await argon2.hash(password, { type: argon2.argon2id });
      const userId = await upsertUser(client, account, account.role === 'courier' ? await argon2.hash(password, { type: argon2.argon2id }) : passwordHash);
      if (account.role === 'courier') {
        const courierPinHash = await bcrypt.hash(password, 12);
        await client.query(`UPDATE users SET pin_hash = $1 WHERE id = $2`, [courierPinHash, userId]);
        await upsertCourierProfile(client, account, userId);
      } else {
        await seedCustomerCredit(client, userId, account.email);
      }
      console.log(`UAT account ready: ${account.role} ${account.email}`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await db.end();
  }
};

main().catch((error) => {
  console.error(`UAT seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
