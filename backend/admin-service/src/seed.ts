import { db } from './db';
import crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();

export const seedDashboardData = async () => {
  try {
    console.log('🌱 Seeding dashboard data...');

    // 1. Create a few users
    const customerResult = await db.query(`
      INSERT INTO users (id, full_name, email, phone_number, role, pin_hash)
      VALUES ($1, 'Test Customer', 'customer@example.com', '08123456789', 'customer', 'hashed')
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id
    `, [uuidv4()]);
    const customerId = customerResult.rows[0].id;

    const courierResult = await db.query(`
      INSERT INTO users (id, full_name, email, phone_number, role, pin_hash)
      VALUES ($1, 'Test Courier', 'courier@example.com', '08123456780', 'courier', 'hashed')
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id
    `, [uuidv4()]);
    const courierId = courierResult.rows[0].id;

    // 2. Create courier profile
    await db.query(`
      INSERT INTO courier_profiles (id, user_id, status, vehicle_type, tier, is_online)
      VALUES ($1, $2, 'approved', 'matic', 'regular', true)
      ON CONFLICT DO NOTHING
    `, [uuidv4(), courierId]);

    // 3. Create some orders
    for (let i = 0; i < 5; i++) {
      const orderId = uuidv4();
      const status = i < 3 ? 'delivered' : 'processing';
      const model = 'p2p';
      
      await db.query(`
        INSERT INTO orders (id, order_number, customer_id, status, model, total_price_idr, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW() - interval '${i} hours')
      `, [orderId, `ORD-${Date.now()}-${i}`, customerId, status, model, 50000 + (i * 10000)]);

      // 4. Create order events
      await db.query(`
        INSERT INTO order_events (id, order_id, status, message, created_at)
        VALUES ($1, $2, $3, $3, NOW() - interval '${i} hours')
      `, [uuidv4(), orderId, status === 'delivered' ? 'Order Delivered' : 'Order in Transit']);

      // 5. Create payments
      if (status === 'delivered') {
        await db.query(`
          INSERT INTO payments (id, order_id, payment_number, provider, method, status, amount_idr, mdr_amount_idr, ppn_amount_idr, weather_reserve_idr, net_operational_idr, created_at, paid_at, expires_at)
          VALUES ($1, $2, 'PAY-${Date.now()}-${i}', 'xendit', 'qris', 'paid', $3, 1000, 500, 1000, $3 - 2500, NOW(), NOW(), NOW() + interval '24 hours')
        `, [uuidv4(), orderId, 50000 + (i * 10000)]);
      }
    }

    console.log('✅ Seeding complete!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
  }
};
