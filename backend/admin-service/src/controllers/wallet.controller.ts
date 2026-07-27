import { Request, Response } from 'express';
import { securityLog } from '../security/logRedaction';
import crypto from 'crypto';

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:8084';

export const getWalletBalance = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized: User session missing' });
    }

    // For now, since payment service may not be available, return default balance
    let data: any;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`${PAYMENT_SERVICE_URL}/api/v1/wallet/balance`, {
        signal: controller.signal,
        headers: {
          'X-User-ID': user.id,
          'Content-Type': 'application/json'
        }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json(errorData);
      }

      data = await response.json();
    } catch (upstreamError: any) {
      securityLog.warn('Payment service unreachable, returning default balance:', upstreamError.message || upstreamError);
      // Payment service not available — return safe default
      const db = (await import('../db')).default;
      const { rows } = await db.query(
        `SELECT COALESCE(SUM(balance), 0)::bigint AS wallet_balance
         FROM customer_wallets
         WHERE customer_id = $1`,
        [user.id]
      );
      return res.json({
        success: true,
        balance: Number(rows[0]?.wallet_balance || 0),
        currency: 'IDR'
      });
    }

    return res.json(data);
  } catch (error: any) {
    securityLog.error('Error fetching wallet balance:', error);
    return res.status(500).json({ error: 'Failed to communicate with payment service' });
  }
};

export const createTopUp = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { amount, idempotency_key } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const response = await fetch(`${PAYMENT_SERVICE_URL}/api/v1/wallet/topup`, {
      method: 'POST',
      headers: {
        'X-User-ID': user.id,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotency_key || crypto.randomUUID()
      },
      body: JSON.stringify({ amount })
    });

    const data = await response.json().catch(() => ({ error: 'Invalid response from payment service' }));
    return res.status(response.status).json(data);
  } catch (error: any) {
    securityLog.error('Error creating top up:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { amount, bank_name, bank_code, account_number, account_holder, idempotency_key } = req.body;
    const finalBankCode = (bank_code || bank_name || '').toUpperCase().trim();
    
    if (!amount || amount <= 0 || !finalBankCode || !account_number || !account_holder) {
      return res.status(400).json({ error: 'Missing or invalid withdrawal details' });
    }

    const finalIdempotencyKey = idempotency_key || req.headers['x-idempotency-key'] || crypto.randomUUID();

    const response = await fetch(`${PAYMENT_SERVICE_URL}/api/v1/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'X-User-ID': user.id,
        'X-User-Role': user.role || 'customer',
        'Content-Type': 'application/json',
        'X-Idempotency-Key': finalIdempotencyKey as string
      },
      body: JSON.stringify({ 
        amount: Number(amount),
        bank_code: finalBankCode,
        account_number: String(account_number).replace(/[^0-9]/g, ''),
        account_holder: String(account_holder).trim(),
        idempotency_key: finalIdempotencyKey
      })
    });

    const data = await response.json().catch(() => ({ error: 'Invalid response from payment service' }));
    return res.status(response.status).json(data);
  } catch (error: any) {
    securityLog.error('Error requesting withdrawal:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
