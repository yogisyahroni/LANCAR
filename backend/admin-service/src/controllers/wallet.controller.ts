import { Request, Response } from 'express';

const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || 'http://payment-service:8084';

export const getWalletBalance = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized: User session missing' });
    }

    const response = await fetch(`${PAYMENT_SERVICE_URL}/api/v1/wallet/balance`, {
      headers: {
        'X-User-ID': user.id,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error('Error fetching wallet balance:', error);
    return res.status(500).json({ error: 'Failed to communicate with payment service' });
  }
};

export const createTopUp = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const response = await fetch(`${PAYMENT_SERVICE_URL}/api/v1/wallet/topup`, {
      method: 'POST',
      headers: {
        'X-User-ID': user.id,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Error creating top up:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { amount, bank_name, account_number, account_holder } = req.body;
    if (!amount || amount <= 0 || !bank_name || !account_number || !account_holder) {
      return res.status(400).json({ error: 'Missing or invalid withdrawal details' });
    }

    const response = await fetch(`${PAYMENT_SERVICE_URL}/api/v1/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'X-User-ID': user.id,
        'X-User-Role': user.role,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        amount, 
        bank_details: { bank_name, account_number, account_holder } 
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error: any) {
    console.error('Error requesting withdrawal:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
