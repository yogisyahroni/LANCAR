import { Request, Response } from 'express';
import { readDb } from '../db';
import { db } from '../db';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const ordersResult = await readDb.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('pending', 'processing', 'on_relay')) as active,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM orders
    `);

    const revenueResult = await readDb.query(`
      SELECT COALESCE(SUM(amount_idr), 0) as total
      FROM payments
      WHERE status = 'paid' AND created_at >= CURRENT_DATE
    `);

    const couriersResult = await readDb.query(`
      SELECT COUNT(*) as total FROM courier_profiles WHERE status = 'approved'
    `);

    const slaResult = await readDb.query(`
      SELECT 
        (COUNT(*) FILTER (WHERE delivered_at IS NOT NULL)::float / NULLIF(COUNT(*), 0)) * 100 as compliance
      FROM orders 
      WHERE status = 'delivered'
    `);

    res.json({
      total_orders_today: parseInt(ordersResult.rows[0].total),
      active_orders: parseInt(ordersResult.rows[0].active),
      delivered_orders: parseInt(ordersResult.rows[0].delivered),
      cancelled_orders: parseInt(ordersResult.rows[0].cancelled),
      revenue_today: parseInt(revenueResult.rows[0].total),
      active_couriers: parseInt(couriersResult.rows[0].total),
      sla_compliance: Math.round(slaResult.rows[0].compliance || 0),
      orders_growth: 12,
      revenue_growth: 8.5,
      courier_growth: -2.1,
      sla_growth: 0.5
    });
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getDashboardEvents = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      (SELECT 'order' as type, order_id::text as target, event_type as title, description, created_at 
       FROM order_events)
      UNION ALL 
      (SELECT 'system' as type, key as target, 'Flag/Config Changed' as title, change_reason as description, created_at 
       FROM feature_flag_logs)
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching dashboard events:', error);
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsKPIs = async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || '7D';
    const interval = range === '24H' ? '24 hours' : range === '7D' ? '7 days' : range === '30D' ? '30 days' : '1 year';

    const slaRes = await readDb.query(`
      SELECT 
        (COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sla_logs sl WHERE sl.order_id = orders.id))::float / NULLIF(COUNT(*), 0)) * 100 as current,
        (COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sla_logs sl WHERE sl.order_id = orders.id) AND created_at < NOW() - INTERVAL '${interval}')::float / NULLIF(COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '${interval}'), 0)) * 100 as previous
      FROM orders 
      WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL '${interval}' * 2
    `);

    const demandGapRes = await readDb.query(`
      WITH stats AS (
        SELECT 
          (SELECT COUNT(*) FROM orders WHERE status = 'pending') as pending_orders,
          (SELECT COUNT(*) FROM courier_profiles WHERE status = 'approved' AND is_online = TRUE) as online_couriers
      )
      SELECT 
        CASE 
          WHEN online_couriers = 0 THEN pending_orders * 100 
          ELSE (pending_orders::float / online_couriers) * 10 
        END as gap_score
      FROM stats
    `);

    const courierRes = await readDb.query(`
      SELECT COUNT(*) as total FROM courier_profiles WHERE status = 'approved'
    `);

    const avgDeliveryRes = await readDb.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (delivered_at - picked_up_at))/60) as avg_minutes
      FROM orders 
      WHERE status = 'delivered' AND created_at >= NOW() - INTERVAL '${interval}'
    `);

    const currentSla = Math.round(slaRes.rows[0].current || 0);
    const prevSla = Math.round(slaRes.rows[0].previous || 0);
    const slaDiff = currentSla - prevSla;

    res.json([
      {
        label: 'SLA Compliance',
        value: `${currentSla}%`,
        change: `${slaDiff >= 0 ? '+' : ''}${slaDiff}%`,
        up: slaDiff >= 0
      },
      {
        label: 'Demand Gap',
        value: `${(demandGapRes.rows[0].gap_score || 0).toFixed(1)}%`,
        change: '-0.5%',
        up: demandGapRes.rows[0].gap_score < 5
      },
      {
        label: 'Active Couriers',
        value: courierRes.rows[0].total.toString(),
        change: '+5%',
        up: true
      },
      {
        label: 'Avg. Delivery',
        value: `${Math.round(avgDeliveryRes.rows[0].avg_minutes || 0)}m`,
        change: '-2m',
        up: true
      }
    ]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsSLA = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      WITH daily_stats AS (
        SELECT 
          TO_CHAR(o.created_at, 'Dy') as day_name,
          DATE_TRUNC('day', o.created_at) as day_date,
          z.name as zone_name,
          (COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM sla_logs sl WHERE sl.order_id = o.id)))::float / NULLIF(COUNT(*), 0) * 100 as compliance
        FROM orders o
        JOIN zones z ON ST_Intersects(z.polygon, o.pickup_location)
        WHERE o.status = 'delivered' AND o.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY 1, 2, 3
      )
      SELECT 
        day_name as name,
        day_date,
        JSONB_OBJECT_AGG(LOWER(REPLACE(zone_name, ' ', '_')), ROUND(compliance)) as zones
      FROM daily_stats
      GROUP BY 1, 2
      ORDER BY day_date
    `);

    const chartData = result.rows.map(r => ({
      name: r.name,
      ...r.zones
    }));

    res.json(chartData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsSurge = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT 
        TO_CHAR(created_at, 'HH24:00') as time,
        COUNT(*) as frequency,
        ROUND(AVG(dynamic_price_idr / 1000), 1) as impact
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '7 days' AND dynamic_price_idr > 0
      GROUP BY 1
      ORDER BY 1
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsScanAccuracy = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT 
        (FLOOR(confidence_score * 10) / 10)::float as confidence,
        COUNT(*) as count
      FROM package_scans
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY 1
      ORDER BY 1
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getAnalyticsRetention = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      WITH first_orders AS (
        SELECT customer_id, MIN(DATE_TRUNC('month', created_at)) as cohort_month
        FROM orders
        GROUP BY 1
      ),
      cohort_sizes AS (
        SELECT cohort_month, COUNT(*) as size
        FROM first_orders
        GROUP BY 1
      ),
      retention AS (
        SELECT 
          f.cohort_month,
          DATE_TRUNC('month', o.created_at) as order_month,
          COUNT(DISTINCT o.customer_id) as retained_users
        FROM first_orders f
        JOIN orders o ON f.customer_id = o.customer_id
        GROUP BY 1, 2
      )
      SELECT 
        TO_CHAR(s.cohort_month, 'Mon YYYY') as month,
        size,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '1 month' THEN retained_users::float / size END) * 100) as m1,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '2 month' THEN retained_users::float / size END) * 100) as m2,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '3 month' THEN retained_users::float / size END) * 100) as m3,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '4 month' THEN retained_users::float / size END) * 100) as m4,
        ROUND(MAX(CASE WHEN order_month = s.cohort_month + INTERVAL '5 month' THEN retained_users::float / size END) * 100) as m5
      FROM cohort_sizes s
      LEFT JOIN retention r ON s.cohort_month = r.cohort_month
      GROUP BY 1, 2
      ORDER BY MIN(s.cohort_month) DESC
      LIMIT 6
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getHeatData = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query(`
      SELECT 
        ST_Y(current_location::geometry) as lat,
        ST_X(current_location::geometry) as lng,
        CASE 
          WHEN is_online = TRUE THEN 1.0
          ELSE 0.5
        END as weight
      FROM courier_profiles
      WHERE status = 'approved' AND current_location IS NOT NULL
    `);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const exportAnalytics = async (req: Request, res: Response) => {
  try {
    const { range } = req.query;
    const interval = range === '24H' ? '24 hours' : range === '7D' ? '7 days' : '30 days';

    const result = await readDb.query(`
      SELECT 
        DATE_TRUNC('hour', created_at) as hour,
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'delivered') as completed_orders,
        SUM(total_price_idr) as revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY 1
      ORDER BY 1 DESC
    `);

    let csv = 'Hour,Total Orders,Completed Orders,Revenue (IDR)\n';
    result.rows.forEach(row => {
      csv += `${row.hour.toISOString()},${row.total_orders},${row.completed_orders},${row.revenue}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_export_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const getScheduledReports = async (req: Request, res: Response) => {
  try {
    const result = await readDb.query('SELECT * FROM scheduled_reports ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const createScheduledReport = async (req: Request, res: Response) => {
  const { name, frequency, time_slot, day_of_week, day_of_month, recipient_emails, query_payload } = req.body;
  try {
    const result = await db.query(
      `INSERT INTO scheduled_reports (name, frequency, time_slot, day_of_week, day_of_month, recipient_emails, query_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, frequency, time_slot, day_of_week, day_of_month, recipient_emails, query_payload]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const updateScheduledReport = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, frequency, time_slot, is_active, recipient_emails } = req.body;
  try {
    const result = await db.query(
      `UPDATE scheduled_reports 
       SET name = COALESCE($1, name),
           frequency = COALESCE($2, frequency),
           time_slot = COALESCE($3, time_slot),
           is_active = COALESCE($4, is_active),
           recipient_emails = COALESCE($5, recipient_emails),
           updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [name, frequency, time_slot, is_active, recipient_emails, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
    res.json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteScheduledReport = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM scheduled_reports WHERE id = $1', [id]);
    res.json({ message: 'Report deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
