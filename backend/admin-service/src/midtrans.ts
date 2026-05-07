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
    custom_field1: input.customFields?.custom_field1,
    custom_field2: input.customFields?.custom_field2,
    custom_field3: input.customFields?.custom_field3,
  };

  const auth = Buffer.from(`${serverKey}:`).toString('base64');
  const response = await fetch(getSnapApiUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });

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
