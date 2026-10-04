import { getMerchantRegistrationStatus } from './merchants-public.controller';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';

jest.mock('../db', () => ({
  db: { query: jest.fn() },
  readDb: { query: jest.fn() },
}));

jest.mock('../security/logRedaction', () => ({
  securityLog: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const makeResponse = () => {
  const response: any = { statusCode: 200, body: undefined };
  response.status = (code: number) => {
    response.statusCode = code;
    return response;
  };
  response.json = (body: unknown) => {
    response.body = body;
    return response;
  };
  return response;
};

describe('public merchant registration status contract', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires both identifiers to match the same account and reads from primary for read-after-write', async () => {
    (db.query as jest.Mock).mockResolvedValue({
      rows: [{
        merchant_id: 'merchant-1',
        nama_toko: 'Toko Uji',
        onboarding_status: 'ACTIVE',
        verification_status: 'approved',
        rejection_reason: null,
        onboarding_suspension_reason: null,
        created_at: '2026-10-04T08:00:00.000Z',
        updated_at: '2026-10-04T09:00:00.000Z',
        user_status: 'active',
      }],
    });
    const response = makeResponse();

    await getMerchantRegistrationStatus({
      query: { email: 'owner@example.test', phone: '081234567890' },
      path: '/api/v1/auth/merchant/registration-status',
    } as any, response);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('LOWER(u.email) = $1 AND u.phone_number = ANY($2::text[])'),
      ['owner@example.test', ['081234567890', '+6281234567890']],
    );
    expect(readDb.query).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      status: 'ACTIVE',
      onboarding_status: 'ACTIVE',
      next_action: 'open_portal',
      updated_at: '2026-10-04T09:00:00.000Z',
    }));
    expect(response.body.user_status).toBeUndefined();
    expect(securityLog.info).toHaveBeenCalledWith('merchant_registration_status_lookup', expect.objectContaining({
      outcome: 'matched',
      status: 'ACTIVE',
      has_email: true,
      has_phone: true,
    }));
  });

  it('accepts the domestic phone format used by the merchant web form', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });
    const response = makeResponse();

    await getMerchantRegistrationStatus({
      query: { phone: '081234567890' },
    } as any, response);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('u.phone_number = ANY($1::text[])'),
      [['081234567890', '+6281234567890']],
    );
    expect(response.statusCode).toBe(404);
  });

  it('returns a generic not-found response for a mismatched email and phone', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [] });
    const response = makeResponse();

    await getMerchantRegistrationStatus({
      query: { email: 'owner@example.test', phone: '089999999999' },
    } as any, response);

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ status: 'not_found', message: 'Pendaftaran tidak ditemukan' });
    expect(response.body).not.toHaveProperty('onboarding_status');
    expect(securityLog.info).toHaveBeenCalledWith('merchant_registration_status_lookup', expect.objectContaining({
      outcome: 'not_found',
      has_email: true,
      has_phone: true,
    }));
  });

  it.each([
    ['DRAFT', 'complete_submission'],
    ['SUBMITTED', 'wait_for_review'],
    ['VERIFYING', 'wait_for_review'],
    ['ACTIVE', 'open_portal'],
    ['REJECTED', 'resubmit'],
    ['SUSPENDED', 'contact_support'],
  ])('returns the canonical next action for %s', async (status, nextAction) => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [{
      merchant_id: 'merchant-state',
      nama_toko: 'Toko State',
      onboarding_status: status,
      verification_status: null,
      rejection_reason: null,
      onboarding_suspension_reason: null,
      created_at: '2026-10-04T08:00:00.000Z',
      updated_at: '2026-10-04T09:00:00.000Z',
    }] });
    const response = makeResponse();

    await getMerchantRegistrationStatus({ query: { email: 'owner@example.test' } } as any, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ status, next_action: nextAction }));
  });

  it('keeps the no-merchant state explicit without exposing account internals', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [{ merchant_id: null, user_status: 'active' }] });
    const response = makeResponse();

    await getMerchantRegistrationStatus({ query: { email: 'customer@example.test' } } as any, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      status: 'no_merchant',
      onboarding_status: null,
      next_action: 'start_registration',
      message: 'Akun ditemukan, tetapi belum ada data toko.',
    });
    expect(response.body.user_status).toBeUndefined();
  });

  it('returns a safe suspension reason only after the matched identity lookup', async () => {
    (db.query as jest.Mock).mockResolvedValue({ rows: [{
      merchant_id: 'merchant-2',
      nama_toko: 'Toko Ditangguhkan',
      onboarding_status: 'SUSPENDED',
      verification_status: 'pending',
      rejection_reason: null,
      onboarding_suspension_reason: 'database query detail tidak boleh tampil',
      created_at: '2026-10-04T08:00:00.000Z',
      updated_at: '2026-10-04T09:00:00.000Z',
    }] });
    const response = makeResponse();

    await getMerchantRegistrationStatus({ query: { email: 'owner@example.test' } } as any, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      status: 'SUSPENDED',
      next_action: 'contact_support',
      suspension_reason: 'Ada data yang perlu diperbaiki. Hubungi bantuan TEMBUS untuk detail.',
    }));
    expect(JSON.stringify(response.body)).not.toMatch(/database|query/i);
  });

  it('returns a safe unavailable response and logs only redacted lookup metadata', async () => {
    (db.query as jest.Mock).mockRejectedValue(new Error('password=do-not-leak database detail'));
    const response = makeResponse();

    await getMerchantRegistrationStatus({
      query: { email: 'owner@example.test' },
    } as any, response);

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({
      error: 'Status pendaftaran belum dapat diperiksa. Coba lagi beberapa saat.',
      code: 'ERR_STATUS_LOOKUP_UNAVAILABLE',
    });
    expect(JSON.stringify(response.body)).not.toContain('password');
    expect(securityLog.error).toHaveBeenCalledWith('merchant_registration_status_lookup_failed', expect.objectContaining({
      has_email: true,
      has_phone: false,
    }));
    const loggedMeta = (securityLog.error as jest.Mock).mock.calls[0][1];
    expect(loggedMeta).not.toHaveProperty('email');
    expect(loggedMeta).not.toHaveProperty('phone');
  });
});
