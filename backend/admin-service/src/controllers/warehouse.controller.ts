import { Request, Response } from 'express';
import { db, readDb } from '../db';

// Get list of all consolidation bags
export const getConsolidationBags = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT 
        cb.bag_number,
        cb.vehicle_plate,
        cb.flight_number,
        cb.origin_warehouse_id,
        cb.destination_warehouse_id,
        cb.status,
        cb.created_at,
        cb.updated_at,
        (SELECT COUNT(DISTINCT order_id) FROM package_scans ps WHERE ps.bag_number = cb.bag_number) as packages_count
      FROM consolidation_bags cb
      ORDER BY cb.created_at DESC
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching consolidation bags:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get single consolidation bag detail with nested scanned orders
export const getConsolidationBagDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { bag_number } = req.params;
    const bagRes = await readDb.query(`
      SELECT * FROM consolidation_bags WHERE bag_number = $1
    `, [bag_number]);

    if (bagRes.rows.length === 0) {
      res.status(404).json({ error: 'Consolidation bag not found' });
      return;
    }

    const packageScansRes = await readDb.query(`
      SELECT DISTINCT ON (ps.order_id)
        ps.id,
        ps.order_id,
        ps.scan_type,
        ps.created_at,
        o.model as order_model,
        o.status as order_status,
        u.full_name as customer_name
      FROM package_scans ps
      JOIN orders o ON ps.order_id = o.id
      JOIN users u ON o.customer_id = u.id
      WHERE ps.bag_number = $1
      ORDER BY ps.order_id, ps.created_at DESC
    `, [bag_number]);

    res.json({
      ...bagRes.rows[0],
      scanned_packages: packageScansRes.rows
    });
  } catch (error: any) {
    console.error('Error fetching consolidation bag detail:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create and seal a new consolidation bag
export const createConsolidationBag = async (req: Request, res: Response): Promise<void> => {
  const { bag_number, vehicle_plate, flight_number, origin_warehouse_id, destination_warehouse_id } = req.body;

  if (!bag_number || bag_number.trim() === '') {
    res.status(400).json({ error: 'Bag number is required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Check if already exists
    const checkExist = await client.query('SELECT 1 FROM consolidation_bags WHERE bag_number = $1', [bag_number]);
    if (checkExist.rows.length > 0) {
      res.status(400).json({ error: 'Consolidation bag number already exists' });
      client.release();
      return;
    }

    const result = await client.query(`
      INSERT INTO consolidation_bags (
        bag_number, vehicle_plate, flight_number, origin_warehouse_id, destination_warehouse_id, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'sealed', NOW(), NOW())
      RETURNING *
    `, [bag_number, vehicle_plate || null, flight_number || null, origin_warehouse_id || null, destination_warehouse_id || null]);

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating consolidation bag:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Open/Unbag a consolidation bag (Bag Out)
export const openConsolidationBag = async (req: Request, res: Response): Promise<void> => {
  const { bag_number } = req.body;

  if (!bag_number) {
    res.status(400).json({ error: 'Bag number is required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT status FROM consolidation_bags WHERE bag_number = $1', [bag_number]);
    if (checkRes.rows.length === 0) {
      res.status(404).json({ error: 'Consolidation bag not found' });
      client.release();
      return;
    }

    if (checkRes.rows[0].status === 'open') {
      res.status(400).json({ error: 'Consolidation bag is already unbagged / open' });
      client.release();
      return;
    }

    const result = await client.query(`
      UPDATE consolidation_bags 
      SET status = 'open', updated_at = NOW() 
      WHERE bag_number = $1 
      RETURNING *
    `, [bag_number]);

    await client.query('COMMIT');
    res.json({ message: 'Consolidation bag successfully unbagged', bag: result.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error opening consolidation bag:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Scan package inbound/outbound
export const scanPackageInboundOutbound = async (req: Request, res: Response): Promise<void> => {
  const { order_id, scan_type, bag_number, latitude, longitude } = req.body;

  if (!order_id || !scan_type) {
    res.status(400).json({ error: 'Order ID and Scan Type are required' });
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch order details to validate
    const orderRes = await client.query('SELECT status, model FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      client.release();
      return;
    }
    const order = orderRes.rows[0];

    // 2. Enforce unbagging constraint for inbound_destination
    if (scan_type === 'inbound_destination') {
      const activeBagRes = await client.query(`
        SELECT ps.bag_number, cb.status
        FROM package_scans ps
        JOIN consolidation_bags cb ON ps.bag_number = cb.bag_number
        WHERE ps.order_id = $1 AND ps.bag_number IS NOT NULL
        ORDER BY ps.created_at DESC LIMIT 1
      `, [order_id]);

      if (activeBagRes.rows.length > 0 && activeBagRes.rows[0].status === 'sealed') {
        res.status(400).json({ 
          error: `Cannot inbound package. Consolidation bag ${activeBagRes.rows[0].bag_number} must be unbagged (Bag Out) at destination first.` 
        });
        client.release();
        return;
      }
    }

    // 3. Save package scan entry
    const scanId = 'scan-' + Math.random().toString(36).substring(2, 11);
    await client.query(`
      INSERT INTO package_scans (
        id, order_id, scan_type, bag_number, latitude, longitude, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [scanId, order_id, scan_type, bag_number || null, latitude || null, longitude || null]);

    // 4. Update the order status based on scan type
    let newStatus = order.status;
    if (scan_type === 'pickup') newStatus = 'picked_up';
    else if (scan_type === 'inbound_origin') newStatus = 'inbound_origin';
    else if (scan_type === 'outbound_origin') newStatus = 'outbound_origin';
    else if (scan_type === 'inbound_destination') newStatus = 'inbound_destination';
    else if (scan_type === 'outbound_destination') newStatus = 'outbound_destination';
    else if (scan_type === 'delivered') newStatus = 'delivered';

    await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, order_id]);

    // 5. Create order event log
    const eventId = 'evt-' + Math.random().toString(36).substring(2, 11);
    const adminId = req.user?.id || 'c6708cbc-9c98-4afc-8da6-d2aa3f3c37f3';
    await client.query(`
      INSERT INTO order_events (id, order_id, user_id, event_type, description, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, [eventId, order_id, adminId, 'scan_update', `Package scanned for ${scan_type.replace('_', ' ')}` + (bag_number ? ` with bag ${bag_number}` : '')]);

    await client.query('COMMIT');
    res.json({ message: `Package successfully scanned as ${scan_type}`, order_id, status: newStatus });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error scanning package:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// Intelligent process auto-detection
export const autoDetectScanType = async (req: Request, res: Response): Promise<void> => {
  const { order_id } = req.body;

  if (!order_id) {
    res.status(400).json({ error: 'Order ID is required' });
    return;
  }

  try {
    const orderRes = await readDb.query('SELECT status, model FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    const order = orderRes.rows[0];

    // Find the latest scan
    const latestScanRes = await readDb.query(`
      SELECT scan_type FROM package_scans WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [order_id]);

    let latestScan = '';
    if (latestScanRes.rows.length > 0) {
      latestScan = latestScanRes.rows[0].scan_type;
    }

    let nextScan = 'pickup';
    let label = 'Scan Pickup (Kurir Ambil)';

    if (latestScan === 'pickup' || order.status === 'picked_up') {
      nextScan = 'inbound_origin';
      label = 'Scan Inbound Gudang Asal (Origin)';
    } else if (latestScan === 'inbound_origin' || order.status === 'inbound_origin') {
      nextScan = 'outbound_origin';
      label = 'Scan Outbound Gudang Asal (Bagging/Consolidation)';
    } else if (latestScan === 'outbound_origin' || order.status === 'outbound_origin') {
      nextScan = 'inbound_destination';
      label = 'Scan Inbound Gudang Tujuan (Destinasi)';
    } else if (latestScan === 'inbound_destination' || order.status === 'inbound_destination') {
      nextScan = 'outbound_destination';
      label = 'Scan Outbound Kurir Pengirim (Delivery)';
    } else if (latestScan === 'outbound_destination' || order.status === 'outbound_destination') {
      nextScan = 'delivered';
      label = 'Scan Selesai Terkirim (ePOD)';
    } else if (latestScan === 'delivered') {
      nextScan = 'complete';
      label = 'Paket Selesai Dikirim';
    }

    res.json({
      order_id,
      current_status: order.status,
      latest_scan: latestScan || 'none',
      next_scan_type: nextScan,
      suggested_label: label
    });
  } catch (error: any) {
    console.error('Error auto-detecting scan type:', error);
    res.status(500).json({ error: error.message });
  }
};
