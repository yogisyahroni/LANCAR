import { withCircuitBreaker } from './lib/resilience/circuitBreaker';

type SnapItem = {
  id: string;
  price: number;
  quantity: number;
  name: string;
};

type SnapCustomer = {
  first_name?: string;
  email?: string;
  phone?: string;
};

type SnapTransactionInput = {
  orderId: string;
  grossAmount: number;
  itemDetails: SnapItem[];
  customerDetails?: SnapCustomer;
  customFields?: Record<string, string>;
  expiryMinutes?: number;
  routingDetails?: {
    ppn_amount: number;
    reserve_amount: number;
    insurance_amount: number;
    operational_amount: number;
  };
};

type SnapTransactionResult = {
  token: string;
  redirect_url: string;
  midtrans_order_id: string;
  expires_at: string;
};

const isProduction = () => (process.env.MIDTRANS_ENV || 'sandbox').toLowerCase() === 'production';

export const getMidtransSnapJsUrl = () =>
  isProduction()
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';

const getSnapApiUrl = () =>
  isProduction()
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

export const getMidtransClientKey = () => process.env.MIDTRANS_CLIENT_KEY || '';

const MIDTRANS_HTTP_TIMEOUT_MS = Number(process.env.MIDTRANS_HTTP_TIMEOUT_MS || 15_000);

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs = MIDTRANS_HTTP_TIMEOUT_MS,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const createSnapTransaction = async (input: SnapTransactionInput): Promise<SnapTransactionResult> => {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error('MIDTRANS_SERVER_KEY is not configured');
  }

  const expiryMinutes = input.expiryMinutes || 30;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();

  const payload = {
    transaction_details: {
      order_id: input.orderId,
      gross_amount: Math.round(input.grossAmount),
    },
    item_details: input.itemDetails.map((item) => ({
      ...item,
      price: Math.round(item.price),
      quantity: Math.max(1, Math.round(item.quantity)),
    })),
    customer_details: input.customerDetails || {},
    credit_card: {
      secure: true,
    },
    expiry: {
      unit: 'minutes',
      duration: expiryMinutes,
    },
    callbacks: {
      finish: process.env.MIDTRANS_FINISH_URL || process.env.FRONTEND_URL || 'http://localhost:3000/orders',
    },
    enabled_payments: [
      "credit_card", "mandiri_clickpay", "cimb_clicks", "bca_klikbca", "bca_klikpay", 
      "bri_epay", "echannel", "permata_va", "bca_va", "bni_va", "bri_va", "cimb_va", 
      "other_va", "gopay", "indomaret", "alfamart", "danamon_online", "akulaku", "shopeepay", "qris"
    ],
    custom_field1: input.customFields?.custom_field1,
    custom_field2: input.routingDetails ? JSON.stringify(input.routingDetails) : input.customFields?.custom_field2,
    custom_field3: input.customFields?.custom_field3,
  };

  const auth = Buffer.from(`${serverKey}:`).toString('base64');
  // POST create-transaction is non-idempotent: timeout + circuit breaker
  // only, NO auto-retry (a blind retry could double-charge the customer).
  const response = await withCircuitBreaker('midtrans', () =>
    fetchWithTimeout(getSnapApiUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(payload),
    }),
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error_messages?.join(', ') || data?.message || 'Failed to create Midtrans Snap transaction';
    throw new Error(message);
  }

  return {
    token: data.token,
    redirect_url: data.redirect_url,
    midtrans_order_id: input.orderId,
    expires_at: expiresAt,
  };
};

export const isSuccessfulTransaction = (status: string, fraudStatus?: string) => {
  if (status === 'capture') return fraudStatus === 'accept' || !fraudStatus;
  return status === 'settlement';
};

export const isExpiredOrFailedTransaction = (status: string) =>
  ['cancel', 'deny', 'expire', 'failure'].includes(status);
