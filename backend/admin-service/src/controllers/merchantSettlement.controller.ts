import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import axios from 'axios';
import { db } from '../db';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:8083';

export const listMerchantSettlements = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/internal/merchant-settlements`,
      {
        params: { ...req.query, is_admin: 'true' },
        headers: {
          'X-User-ID': (req as any).user?.id || req.headers['x-user-id'] || '',
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const getSettlementConfigs = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT key, value, description
      FROM system_configs
      WHERE key IN (
        'merchant_settlement_holding_days',
        'merchant_settlement_auto_enabled',
        'merchant_settlement_max_retry',
        'merchant_settlement_retry_delay_hours'
      )
    `;
    const result = await db.query(query);
    const configMap: Record<string, string> = {
      merchant_settlement_holding_days: '1',
      merchant_settlement_auto_enabled: 'true',
      merchant_settlement_max_retry: '3',
      merchant_settlement_retry_delay_hours: '1',
    };
    for (const row of result.rows) {
      configMap[row.key] = row.value;
    }
    res.json({
      holding_days: parseInt(configMap.merchant_settlement_holding_days, 10) || 1,
      auto_enabled: configMap.merchant_settlement_auto_enabled === 'true',
      max_retry: parseInt(configMap.merchant_settlement_max_retry, 10) || 3,
      retry_delay_hours: parseInt(configMap.merchant_settlement_retry_delay_hours, 10) || 1,
    });
  } catch (err: any) {
    securityLog.error('Failed to get settlement configs:', err);
    res.status(500).json({ error: 'Failed to retrieve merchant settlement configs' });
  }
};

export const updateSettlementConfigs = async (req: Request, res: Response) => {
  try {
    const { holding_days, auto_enabled, max_retry, retry_delay_hours } = req.body;

    if (holding_days !== undefined && (isNaN(Number(holding_days)) || Number(holding_days) < 0)) {
      return res.status(400).json({ error: 'holding_days must be a valid non-negative integer' });
    }
    if (max_retry !== undefined && (isNaN(Number(max_retry)) || Number(max_retry) < 1)) {
      return res.status(400).json({ error: 'max_retry must be at least 1' });
    }
    if (retry_delay_hours !== undefined && (isNaN(Number(retry_delay_hours)) || Number(retry_delay_hours) < 1)) {
      return res.status(400).json({ error: 'retry_delay_hours must be at least 1' });
    }

    const updates = [
      {
        key: 'merchant_settlement_holding_days',
        value: holding_days !== undefined ? String(holding_days) : undefined,
        desc: 'Jumlah hari dana ditahan setelah POD sebelum dicairkan ke merchant',
      },
      {
        key: 'merchant_settlement_auto_enabled',
        value: auto_enabled !== undefined ? String(Boolean(auto_enabled)) : undefined,
        desc: 'Aktifkan auto-disbursement settlement ke merchant',
      },
      {
        key: 'merchant_settlement_max_retry',
        value: max_retry !== undefined ? String(max_retry) : undefined,
        desc: 'Jumlah maksimal retry jika disbursement gagal',
      },
      {
        key: 'merchant_settlement_retry_delay_hours',
        value: retry_delay_hours !== undefined ? String(retry_delay_hours) : undefined,
        desc: 'Jeda jam antar retry disbursement yang gagal',
      },
    ];

    for (const item of updates) {
      if (item.value !== undefined) {
        await db.query(
          `INSERT INTO system_configs (key, value, description, category, updated_at)
           VALUES ($1, $2, $3, 'finance', NOW())
           ON CONFLICT (key) DO UPDATE
           SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = NOW()`,
          [item.key, item.value, item.desc]
        );
      }
    }

    res.json({ message: 'Merchant settlement configurations updated successfully' });
  } catch (err: any) {
    securityLog.error('Failed to update settlement configs:', err);
    res.status(500).json({ error: 'Failed to update merchant settlement configs' });
  }
};

export const verifyMerchantBank = async (req: Request, res: Response) => {
  try {
    const { merchantId } = req.params;
    if (!merchantId) {
      return res.status(400).json({ error: 'merchantId parameter is required' });
    }

    const result = await db.query(
      `UPDATE users
       SET bank_verified = TRUE, updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, email, bank_code, bank_account_number, bank_account_name, bank_verified`,
      [merchantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    res.json({
      message: 'Merchant bank account successfully verified',
      merchant: result.rows[0],
    });
  } catch (err: any) {
    securityLog.error('Failed to verify merchant bank:', err);
    res.status(500).json({ error: 'Failed to verify merchant bank account' });
  }
};
