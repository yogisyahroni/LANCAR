import { Request, Response } from 'express';
import axios from 'axios';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';
import { getActorId } from '../utils/authUtils';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:8080';

// ==========================================
// 1. Logistics Exception Policies (Web Admin Dynamic Config)
// ==========================================
export const getLogisticsExceptionPolicies = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await readDb.query(`
      SELECT * FROM logistics_exception_policies
      ORDER BY exception_type ASC, provider_name ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error fetching logistics exception policies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const upsertLogisticsExceptionPolicy = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      policy_code,
      policy_name,
      exception_type,
      provider_name = 'ALL',
      fee_borne_by = 'MERCHANT',
      fee_amount_idr = 0,
      fee_pct_order = 0,
      is_active = true,
      config_metadata = {},
    } = req.body;

    if (!policy_code || !policy_name || !exception_type) {
      res.status(400).json({ success: false, error: 'policy_code, policy_name, exception_type are required' });
      return;
    }

    const result = await db.query(
      `
      INSERT INTO logistics_exception_policies (
        policy_code, policy_name, exception_type, provider_name, fee_borne_by,
        fee_amount_idr, fee_pct_order, is_active, config_metadata, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      ON CONFLICT (policy_code) DO UPDATE SET
        policy_name = EXCLUDED.policy_name,
        exception_type = EXCLUDED.exception_type,
        provider_name = EXCLUDED.provider_name,
        fee_borne_by = EXCLUDED.fee_borne_by,
        fee_amount_idr = EXCLUDED.fee_amount_idr,
        fee_pct_order = EXCLUDED.fee_pct_order,
        is_active = EXCLUDED.is_active,
        config_metadata = EXCLUDED.config_metadata,
        updated_at = NOW()
      RETURNING *
      `,
      [policy_code, policy_name, exception_type, provider_name, fee_borne_by, fee_amount_idr, fee_pct_order, is_active, JSON.stringify(config_metadata)]
    );

    await db.query(
      `INSERT INTO audit_logs (id, user_id, action, resource, metadata, created_at)
       VALUES (gen_random_uuid(), $1, 'UPSERT_LOGISTICS_EXCEPTION_POLICY', $2, $3, NOW())`,
      [getActorId(req), policy_code, JSON.stringify(req.body)]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    securityLog.error('Error saving logistics exception policy:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// 2. Provider Invoices & Reconciliation
// ==========================================
export const listProviderInvoices = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provider_name, status, limit = 50, offset = 0 } = req.query;
    let queryStr = `SELECT * FROM provider_invoices WHERE 1=1`;
    const params: any[] = [];

    if (provider_name) {
      params.push(provider_name);
      queryStr += ` AND provider_name = $${params.length}`;
    }
    if (status) {
      params.push(status);
      queryStr += ` AND status = $${params.length}`;
    }

    params.push(limit, offset);
    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await readDb.query(queryStr, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error listing provider invoices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getProviderInvoiceDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const invRes = await readDb.query(`SELECT * FROM provider_invoices WHERE id = $1`, [id]);
    if (invRes.rows.length === 0) {
      res.status(404).json({ success: false, error: 'Provider invoice not found' });
      return;
    }

    const itemsRes = await readDb.query(
      `SELECT * FROM provider_invoice_items WHERE invoice_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      success: true,
      data: {
        ...invRes.rows[0],
        items: itemsRes.rows,
      },
    });
  } catch (error: any) {
    securityLog.error('Error fetching provider invoice detail:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const importProviderInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const resp = await axios.post(`${ORDER_SERVICE_URL}/api/v1/internal/aggregator-finance/invoices`, req.body);
    res.status(201).json({ success: true, data: resp.data });
  } catch (error: any) {
    securityLog.error('Error importing provider invoice:', error);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
};

export const reconcileProviderInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const resp = await axios.post(`${ORDER_SERVICE_URL}/api/v1/internal/aggregator-finance/invoices/reconcile/${id}`);
    res.json({ success: true, data: resp.data });
  } catch (error: any) {
    securityLog.error('Error reconciling provider invoice:', error);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
};

export const approveProviderInvoice = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const actorId = getActorId(req);
    const resp = await axios.post(`${ORDER_SERVICE_URL}/api/v1/internal/aggregator-finance/invoices/approve/${id}`, {
      approver_id: actorId,
    });
    res.json({ success: true, data: resp.data });
  } catch (error: any) {
    securityLog.error('Error approving provider invoice:', error);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
};

// ==========================================
// 3. Logistics Exception Claims
// ==========================================
export const listLogisticsClaims = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    let queryStr = `SELECT * FROM logistics_exception_claims WHERE 1=1`;
    const params: any[] = [];
    if (status) {
      params.push(status);
      queryStr += ` AND status = $${params.length}`;
    }
    params.push(limit, offset);
    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await readDb.query(queryStr, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error listing claims:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const resolveLogisticsClaim = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const resp = await axios.post(`${ORDER_SERVICE_URL}/api/v1/internal/aggregator-finance/claims/resolve/${id}`, {
      status,
    });
    res.json({ success: true, data: resp.data });
  } catch (error: any) {
    securityLog.error('Error resolving claim:', error);
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message,
    });
  }
};

// ==========================================
// 4. Merchant Settlement Ledger Entries
// ==========================================
export const listMerchantSettlementLedger = async (req: Request, res: Response): Promise<void> => {
  try {
    const { merchant_id, entry_type, limit = 50, offset = 0 } = req.query;
    let queryStr = `SELECT * FROM merchant_settlement_ledger_entries WHERE 1=1`;
    const params: any[] = [];

    if (merchant_id) {
      params.push(merchant_id);
      queryStr += ` AND merchant_id = $${params.length}`;
    }
    if (entry_type) {
      params.push(entry_type);
      queryStr += ` AND entry_type = $${params.length}`;
    }

    params.push(limit, offset);
    queryStr += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await readDb.query(queryStr, params);
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error listing merchant settlement ledger:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
