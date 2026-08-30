import { db } from './db';

/**
 * Idempotent merchant UAT data.
 *
 * This is deliberately opt-in and never runs in production. Every value is
 * persisted in PostgreSQL and is deterministic so repeated runs do not create
 * duplicate orders or random business metrics.
 */
const MERCHANT_EMAIL = 'e2e-siti-20260808@bawain.my.id';
const MERCHANT_USER_ID = '8e7a2e6a-1e4a-4b31-8af7-202608080001';
const LEGACY_SEED_MERCHANT_ID = '8e7a2e6a-1e4a-4b31-8af7-202608080002';
const CUSTOMER_ID = '8e7a2e6a-1e4a-4b31-8af7-202608080003';
const MENU_ID = '8e7a2e6a-1e4a-4b31-8af7-202608080004';
const VARIANT_ID = '8e7a2e6a-1e4a-4b31-8af7-202608080005';
const OPTION_REGULAR_ID = '8e7a2e6a-1e4a-4b31-8af7-202608080006';
const OPTION_LARGE_ID = '8e7a2e6a-1e4a-4b31-8af7-202608080007';
const ITEM_IDS = [
  '8e7a2e6a-1e4a-4b31-8af7-202608080013',
  '8e7a2e6a-1e4a-4b31-8af7-202608080014',
  '8e7a2e6a-1e4a-4b31-8af7-202608080015',
];
const ITEM_VARIANT_SNAPSHOT_IDS = [
  '8e7a2e6a-1e4a-4b31-8af7-202608080016',
  '8e7a2e6a-1e4a-4b31-8af7-202608080017',
  '8e7a2e6a-1e4a-4b31-8af7-202608080018',
];
const EVENT_IDS = [
  '8e7a2e6a-1e4a-4b31-8af7-202608080020',
  '8e7a2e6a-1e4a-4b31-8af7-202608080021',
  '8e7a2e6a-1e4a-4b31-8af7-202608080022',
];
const NOTIFICATION_ID = '8e7a2e6a-1e4a-4b31-8af7-202608080023';

const ORDERS = [
  { id: '8e7a2e6a-1e4a-4b31-8af7-202608080010', number: 'FOOD-E2E-DELIVERED', status: 'delivered', reason: null, rejectReason: null, total: 42000 },
  { id: '8e7a2e6a-1e4a-4b31-8af7-202608080011', number: 'FOOD-E2E-CANCELED', status: 'cancelled', reason: 'Pelanggan membatalkan pesanan sebelum diproses.', rejectReason: null, total: 38000 },
  // Merchant rejection is persisted as cancelled + reject_reason by the real
  // RejectOrder flow; the UI uses reject_reason to render the rejected variant.
  { id: '8e7a2e6a-1e4a-4b31-8af7-202608080012', number: 'FOOD-E2E-REJECTED', status: 'cancelled', reason: 'Menu sedang habis dan tidak dapat diproses.', rejectReason: 'stok_habis', total: 38000 },
];

const requireOptIn = () => {
  const enabled = ['1', 'true', 'yes'].includes((process.env.SEED_MERCHANT_DEMO || '').trim().toLowerCase());
  const production = ['production'].includes((process.env.NODE_ENV || '').trim().toLowerCase()) ||
    ['production'].includes((process.env.ENVIRONMENT || '').trim().toLowerCase());
  if (!enabled || production) throw new Error('Set SEED_MERCHANT_DEMO=true in a non-production environment to run this seed');
};

const main = async () => {
  requireOptIn();
  const passwordHash = (process.env.DEV_MERCHANT_PASSWORD_HASH || '').trim();
  if (!passwordHash.startsWith('$argon2id$')) {
    throw new Error('DEV_MERCHANT_PASSWORD_HASH must be an Argon2id hash generated outside the repository');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const merchantUserResult = await client.query<{ id: string }>(`
      INSERT INTO users (id, full_name, email, phone_number, role, status, password_hash, is_verified, created_at, updated_at)
      VALUES ($1, 'Siti E2E Merchant', $2, '6281200000008', 'customer', 'active', $3, true, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE SET
        full_name = EXCLUDED.full_name, phone_number = EXCLUDED.phone_number,
        role = 'customer', status = 'active', password_hash = EXCLUDED.password_hash,
        is_verified = true, updated_at = NOW()
      RETURNING id`, [MERCHANT_USER_ID, MERCHANT_EMAIL, passwordHash]);
    const merchantUserId = merchantUserResult.rows[0]?.id;
    if (!merchantUserId) throw new Error('merchant demo user upsert returned no id');

    const customerResult = await client.query<{ id: string }>(`
      INSERT INTO users (id, full_name, email, phone_number, role, status, password_hash, is_verified, created_at, updated_at)
      VALUES ($1, 'Rina Customer E2E', 'customer-e2e-siti@bawain.my.id', '6281200000009', 'customer', 'active', $2, true, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
      RETURNING id`, [CUSTOMER_ID, passwordHash]);
    const customerId = customerResult.rows[0]?.id;
    if (!customerId) throw new Error('customer demo user upsert returned no id');

    const merchantInsert = await client.query<{ id: string }>(`
      INSERT INTO merchants (id, user_id, nama_toko, alamat, lokasi, jam_buka, jam_tutup, is_open, completion_rate_pct, verification_status, created_at, updated_at)
      SELECT gen_random_uuid(), $1, 'Soto Ayam Siti E2E', 'Jl. Kamboja No. 7, Kelurahan Gandaria, Jakarta Selatan', ST_GeogFromText('POINT(106.797 -6.261)'), '08:00', '22:00', true, 98, 'approved', NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM merchants WHERE user_id = $1)
      RETURNING id`, [merchantUserId]);
    const merchantId = merchantInsert.rows[0]?.id || (await client.query<{ id: string }>(
      `SELECT m.id
       FROM merchants m
       WHERE m.user_id = $1
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT 1`, [merchantUserId]
    )).rows[0]?.id;
    if (!merchantId) throw new Error('merchant profile not found after user upsert');
    await client.query(`
      UPDATE merchants SET nama_toko = 'Soto Ayam Siti E2E', alamat = 'Jl. Kamboja No. 7, Kelurahan Gandaria, Jakarta Selatan',
        lokasi = ST_GeogFromText('POINT(106.797 -6.261)'), jam_buka = '08:00', jam_tutup = '22:00',
        is_open = true, completion_rate_pct = 98, verification_status = 'approved', updated_at = NOW()
      WHERE id = $1`, [merchantId]);

    await client.query(`
      INSERT INTO merchant_menu_items (id, merchant_id, nama, harga, deskripsi, kategori, prep_time_minutes, is_available, created_at, updated_at)
      VALUES ($1, $2, 'Soto Ayam Kampung', 32000, 'Soto ayam kampung dengan kuah gurih dan suwiran ayam.', 'Makanan Utama', 15, true, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET merchant_id = EXCLUDED.merchant_id, nama = EXCLUDED.nama, harga = EXCLUDED.harga,
        deskripsi = EXCLUDED.deskripsi, kategori = EXCLUDED.kategori, prep_time_minutes = EXCLUDED.prep_time_minutes, is_available = true, updated_at = NOW()`, [MENU_ID, merchantId]);
    await client.query(`
      INSERT INTO menu_item_variants (id, menu_item_id, nama, is_required, min_select, max_select, sort_order, created_at)
      VALUES ($1, $2, 'Ukuran', true, 1, 1, 1, NOW()) ON CONFLICT (id) DO NOTHING`, [VARIANT_ID, MENU_ID]);
    await client.query(`
      INSERT INTO menu_item_variant_options (id, variant_id, nama, price_delta, is_default, created_at)
      VALUES ($1, $2, 'Regular', 0, true, NOW()), ($3, $2, 'Besar', 8000, false, NOW())
      ON CONFLICT (id) DO UPDATE SET nama = EXCLUDED.nama, price_delta = EXCLUDED.price_delta, is_default = EXCLUDED.is_default`,
      [OPTION_REGULAR_ID, VARIANT_ID, OPTION_LARGE_ID]);

    const orderIds = ORDERS.map((order) => order.id);
    await client.query(`DELETE FROM order_events WHERE order_id = ANY($1::uuid[]) AND metadata->>'seed' = 'merchant_uat'`, [orderIds]);
    await client.query(`DELETE FROM notifications WHERE user_id = $1 AND metadata->>'seed' = 'merchant_uat'`, [merchantUserId]);
    await client.query(`
      DELETE FROM food_order_item_variants
      WHERE order_item_id IN (SELECT id FROM food_order_items WHERE order_id = ANY($1::uuid[]))`, [orderIds]);
    await client.query('DELETE FROM food_order_items WHERE order_id = ANY($1::uuid[])', [orderIds]);

    for (const [index, order] of ORDERS.entries()) {
      await client.query(`
        INSERT INTO orders (id, order_number, customer_id, model, status, service_sub_type, merchant_id,
          pickup_location, pickup_address, dropoff_location, dropoff_address, distance_km,
          base_price_idr, total_price_idr, ppn_idr, mdr_idr, prep_time_minutes,
          cancellation_reason, reject_reason, cancelled_at, delivered_at, created_at, updated_at)
      VALUES ($1, $2, $3, 'p2p', $4::varchar, 'food_delivery', $5,
          ST_GeogFromText('POINT(106.797 -6.261)'), 'Soto Ayam Siti E2E',
          ST_GeogFromText('POINT(106.808 -6.245)'), 'Jl. Melati No. 12, Jakarta Selatan', 2.4,
          $6, $6, 0, 0, 15, $7::text, $8::text, CASE WHEN $4::varchar IN ('cancelled','rejected') THEN NOW() ELSE NULL END,
          CASE WHEN $4::varchar = 'delivered' THEN NOW() ELSE NULL END, NOW() - INTERVAL '1 day', NOW())
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, total_price_idr = EXCLUDED.total_price_idr,
          cancellation_reason = EXCLUDED.cancellation_reason, reject_reason = EXCLUDED.reject_reason,
          cancelled_at = EXCLUDED.cancelled_at, delivered_at = EXCLUDED.delivered_at, updated_at = NOW()`,
        [order.id, order.number, customerId, order.status, merchantId, order.total, order.reason, order.rejectReason]);
      const itemId = ITEM_IDS[index];
      await client.query(`
        INSERT INTO food_order_items (id, order_id, menu_item_id, item_name, item_price, quantity, subtotal)
        VALUES ($1, $2, $3, 'Soto Ayam Kampung', 32000, 1, 32000)
        ON CONFLICT (id) DO NOTHING`, [itemId, order.id, MENU_ID]);
      await client.query(`
        INSERT INTO food_order_item_variants (id, order_item_id, variant_id, option_id, variant_name, option_name, price_delta)
        VALUES ($1, $2, $3, $4, 'Ukuran', 'Regular', 0)
        ON CONFLICT (id) DO NOTHING`, [ITEM_VARIANT_SNAPSHOT_IDS[index], itemId, VARIANT_ID, OPTION_REGULAR_ID]);
      await client.query(`
        INSERT INTO order_events (id, order_id, user_id, event_type, description, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, jsonb_build_object('seed', 'merchant_uat'), NOW())
        ON CONFLICT (id) DO UPDATE SET event_type = EXCLUDED.event_type, description = EXCLUDED.description,
          metadata = EXCLUDED.metadata`, [EVENT_IDS[index], order.id, customerId, order.status, order.reason || `Order ${order.status}`]);
    }

    await client.query(`
      INSERT INTO notifications (id, user_id, title, body, type, deep_link, channel, is_read, order_id, metadata, created_at)
      VALUES ($1, $2, 'Pesanan selesai', 'Pesanan FOOD-E2E-DELIVERED sudah selesai.', 'order_update', '/merchant/orders/8e7a2e6a-1e4a-4b31-8af7-202608080010', 'in_app', false, $3, jsonb_build_object('seed', 'merchant_uat'), NOW())
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, body = EXCLUDED.body, is_read = false, order_id = EXCLUDED.order_id`, [NOTIFICATION_ID, merchantUserId, ORDERS[0].id]);

    await client.query('COMMIT');
    console.info(JSON.stringify({ event: 'merchant_demo_seed_ready', merchant_email: MERCHANT_EMAIL, order_count: ORDERS.length }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await db.end();
  }
};

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
