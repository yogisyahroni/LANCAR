import { Request, Response } from 'express';
import { readDb } from '../db';
import { securityLog } from '../security/logRedaction';

export const getUnitEconomicsV2 = async (req: Request, res: Response): Promise<void> => {
  try {
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params: any[] = [];
    if (start_date && end_date) {
      params.push(start_date, end_date);
      dateFilter = `WHERE created_at >= $1 AND created_at <= $2`;
    }

    // 1. Margin on-demand per order (Aggregated)
    const marginOnDemand = await readDb.query(`
      SELECT 
        COUNT(id) as total_orders,
        COALESCE(SUM(customer_price), 0) as total_revenue,
        COALESCE(SUM(courier_fee), 0) as total_cost,
        COALESCE(SUM(customer_price - courier_fee), 0) as total_margin
      FROM orders
      ${dateFilter}
    `, params);

    // 2. Margin aggregator per provider/service
    let dateFilterInvoice = '';
    if (start_date && end_date) {
        dateFilterInvoice = `WHERE created_at >= $1 AND created_at <= $2`;
    }

    const marginAggregator = await readDb.query(`
      SELECT 
        provider_code,
        COUNT(id) as total_invoices,
        COALESCE(SUM(expected_cost_idr), 0) as expected_cost,
        COALESCE(SUM(actual_cost_idr), 0) as actual_cost
      FROM provider_invoices
      ${dateFilterInvoice}
      GROUP BY provider_code
    `, params);

    // 3. MDR cost per payment method
    let dateFilterPayment = '';
    if (start_date && end_date) {
        dateFilterPayment = `WHERE created_at >= $1 AND created_at <= $2`;
    }

    const mdrCost = await readDb.query(`
      SELECT 
        payment_method,
        COUNT(id) as total_transactions,
        COALESCE(SUM(amount), 0) as total_amount,
        COALESCE(SUM(fee_amount), 0) as total_mdr_fee
      FROM customer_payment_snap_sessions
      ${dateFilterPayment.replace('created_at', 'created_at')}
      GROUP BY payment_method
    `, params);

    // 4. Promo subsidy per campaign
    let promoDateFilter = '';
    if (start_date && end_date) {
      promoDateFilter = `WHERE redeemed_at >= $1 AND redeemed_at <= $2`;
    }
    const promoSubsidy = await readDb.query(`
      SELECT 
        promo_code,
        COUNT(id) as total_redemptions,
        COALESCE(SUM(discount_amount), 0) as total_subsidy
      FROM customer_promo_redemptions
      ${promoDateFilter}
      GROUP BY promo_code
    `, params);

    // Calculate overall ratios
    const totalRev = Number(marginOnDemand.rows[0]?.total_revenue || 0);
    const courierCost = Number(marginOnDemand.rows[0]?.total_cost || 0);
    
    // Total aggregator cost
    const providerCost = marginAggregator.rows.reduce((acc, row) => acc + Number(row.actual_cost), 0);

    const courierPayoutRatio = totalRev > 0 ? (courierCost / totalRev) * 100 : 0;
    const providerCostRatio = totalRev > 0 ? (providerCost / totalRev) * 100 : 0;

    res.json({
      success: true,
      data: {
        marginOnDemand: marginOnDemand.rows[0],
        marginAggregator: marginAggregator.rows,
        mdrCost: mdrCost.rows,
        promoSubsidy: promoSubsidy.rows,
        ratios: {
          courierPayoutRatio,
          providerCostRatio
        }
      }
    });

  } catch (error: any) {
    securityLog.error('Error generating Unit Economics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
