import { db } from './db';
import crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();

const randomElement = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// Coordinates around Jakarta
const getRandomCoords = () => {
  const lat = -6.175 + (Math.random() - 0.5) * 0.2;
  const lng = 106.827 + (Math.random() - 0.5) * 0.2;
  return `POINT(${lng} ${lat})`;
};

const runSeed = async () => {
  const client = await db.connect();
  try {
    console.log('🚀 Starting comprehensive seeding...');
    await client.query('BEGIN');

    // 0. Clean existing mock data (optional but recommended for clean charts)
    console.log('🧹 Cleaning existing data...');
    await client.query('DELETE FROM payout_records');
    await client.query('DELETE FROM payments');
    await client.query('DELETE FROM order_events');
    await client.query('DELETE FROM order_legs');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM courier_profiles');
    await client.query("DELETE FROM users WHERE role IN ('customer', 'courier')");

    // 1. Seed Users (Customers)
    console.log('👥 Seeding 50 customers...');
    const customerIds: string[] = [];
    for (let i = 0; i < 50; i++) {
      const id = uuidv4();
      await client.query(`
        INSERT INTO users (id, full_name, email, phone_number, role, pin_hash, status)
        VALUES ($1, $2, $3, $4, 'customer', 'hashed_pin', 'active')
      `, [id, `Customer ${i + 1}`, `customer${i + 1}@tembus.id`, `0812${randomInt(10000000, 99999999)}`]);
      customerIds.push(id);
    }

    // 2. Seed Couriers
    console.log('🛵 Seeding 10 couriers...');
    const courierIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = uuidv4();
      await client.query(`
        INSERT INTO users (id, full_name, email, phone_number, role, pin_hash, status)
        VALUES ($1, $2, $3, $4, 'courier', 'hashed_pin', 'active')
      `, [id, `Courier ${i + 1}`, `courier${i + 1}@tembus.id`, `0877${randomInt(10000000, 99999999)}`]);
      
      await client.query(`
        INSERT INTO courier_profiles (
          id, user_id, vehicle_type, tier, is_online, 
          current_location, status, vehicle_plate, relay_score,
          acceptance_rate_pct, completion_rate_pct, ontime_rate_pct,
          is_verified, verified_at
        )
        VALUES ($1, $2, $3, $4, true, ST_GeomFromText($5, 4326), 'approved', $6, $7, $8, $9, $10, true, NOW())
      `, [
        uuidv4(), id, 
        randomElement(['matic', 'bebek', 'sport']), 
        randomElement(['regular', 'mitra', 'elite']), 
        getRandomCoords(),
        `B ${randomInt(1000, 9999)} ${randomElement(['ABC', 'XYZ', 'LCR', 'KJH', 'POQ'])}`,
        (Math.random() * 4 + 1).toFixed(1),
        randomInt(80, 100),
        randomInt(80, 100),
        randomInt(80, 100)
      ]);
      
      courierIds.push(id);
    }

    // Fetch existing zones and meeting points for legs
    const zonesRes = await client.query('SELECT id FROM zones');
    const zones = zonesRes.rows.map(r => r.id);
    const mpsRes = await client.query('SELECT id, zone_id FROM meeting_points');
    const meetingPoints = mpsRes.rows;

    if (zones.length === 0 || meetingPoints.length === 0) {
      throw new Error('Please seed zones and meeting points first.');
    }

    // 3. Seed Orders (200 orders over 30 days)
    console.log('📦 Seeding 200 orders over 30 days...');
    for (let i = 0; i < 200; i++) {
      const orderId = uuidv4();
      const customerId = randomElement(customerIds);
      const status = randomElement(['delivered', 'delivered', 'delivered', 'delivered', 'cancelled', 'processing']);
      const model = 'p2p';
      const daysAgo = randomInt(0, 30);
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - daysAgo);
      createdAt.setHours(randomInt(0, 23), randomInt(0, 59));

      const basePrice = randomInt(15000, 100000);
      const ppn = Math.floor(basePrice * 0.11);
      const mdr = Math.floor(basePrice * 0.007);
      const totalPrice = basePrice + ppn;
      const orderNum = `P2P-${createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${randomInt(10000, 99999)}`;

      // Insert Order
      await client.query(`
        INSERT INTO orders (
          id, order_number, customer_id, status, model, 
          base_price_idr, ppn_idr, mdr_idr, total_price_idr,
          pickup_location, pickup_address, dropoff_location, dropoff_address,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ST_GeomFromText($10, 4326), $11, ST_GeomFromText($12, 4326), $13, $14, $14)
      `, [
        orderId, orderNum, customerId, status, model, 
        basePrice, ppn, mdr, totalPrice,
        getRandomCoords(), 'Pickup Address ' + i, getRandomCoords(), 'Dropoff Address ' + i,
        createdAt
      ]);

      // Seed Order Legs
      const legCount = 1;
      const legIds: string[] = [];
      const assignedCouriers: string[] = [];

      for (let legNum = 1; legNum <= legCount; legNum++) {
        const legId = uuidv4();
        const courierId = randomElement(courierIds);
        const zoneId = randomElement(zones);
        const legStatus = status === 'delivered' ? 'delivered' : (status === 'cancelled' ? 'cancelled' : 'assigned');
        const fee = Math.floor(basePrice * (1 / legCount) * 0.8);

        await client.query(`
          INSERT INTO order_legs (
            id, order_id, leg_number, courier_id, zone_id, status, 
            assigned_fee_idr, pickup_location, dropoff_location,
            created_at, updated_at, assigned_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, ST_GeomFromText($8, 4326), ST_GeomFromText($9, 4326), $10, $10, $10)
        `, [
          legId, orderId, legNum, courierId, zoneId, legStatus, 
          fee, getRandomCoords(), getRandomCoords(), createdAt
        ]);
        legIds.push(legId);
        assignedCouriers.push(courierId);
      }

      // 4. Seeding Payments for delivered orders
      if (status === 'delivered') {
        const paymentId = uuidv4();
        const weatherReserve = randomInt(500, 2000);
        const netOperational = totalPrice - mdr - ppn - weatherReserve;

        const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

        await client.query(`
          INSERT INTO payments (
            id, order_id, payment_number, provider, method, status, 
            amount_idr, mdr_amount_idr, ppn_amount_idr, weather_reserve_idr, net_operational_idr,
            created_at, paid_at, expires_at
          )
          VALUES ($1, $2, $3, 'xendit', 'qris', 'paid', $4, $5, $6, $7, $8, $9, $9, $10)
        `, [paymentId, orderId, `PAY-${orderNum}`, totalPrice, mdr, ppn, weatherReserve, netOperational, createdAt, expiresAt]);

        // 5. Seeding Payout Records for each leg
        for (let j = 0; j < legIds.length; j++) {
          const payoutId = uuidv4();
          const courierId = assignedCouriers[j];
          const legId = legIds[j];
          const legFee = Math.floor(basePrice * (1 / legCount) * 0.8);
          const payoutStatus = randomElement(['completed', 'completed', 'completed', 'pending', 'processing']);

          await client.query(`
            INSERT INTO payout_records (
              id, courier_id, order_id, order_leg_id, type, gross_idr, net_idr, 
              disbursement_status, created_at, disbursement_at, updated_at
            )
            VALUES ($1, $2, $3, $4, 'delivery', $5, $6, $7, $8, $9, $8)
          `, [
            payoutId, courierId, orderId, legId, legFee, legFee, 
            payoutStatus, createdAt, payoutStatus === 'completed' ? createdAt : null
          ]);
        }
      }

      // 6. Order Events
      await client.query(`
        INSERT INTO order_events (id, order_id, user_id, event_type, description, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [uuidv4(), orderId, customerId, status, `Order moved to ${status}`, createdAt]);
    }

    await client.query('COMMIT');
    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
  } finally {
    client.release();
    await db.end();
  }
};

runSeed();
