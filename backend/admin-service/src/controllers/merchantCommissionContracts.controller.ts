import { Request, Response } from 'express';
import { db, readDb } from '../db';
import { securityLog } from '../security/logRedaction';

const CONTRACT_SERVICE = 'food_delivery';

const actorId = (req: Request) => {
  const id = (req as Request & { user?: { id?: string } }).user?.id;
  if (!id) throw Object.assign(new Error('Authenticated admin actor is required'), { statusCode: 401 });
  return id;
};

const requireUUID = (value: unknown, field: string) => {
  const normalized = String(value || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw Object.assign(new Error(`${field} harus berupa UUID valid`), { statusCode: 400 });
  }
  return normalized;
};

const audit = async (client: { query: Function }, actor: string, action: string, targetId: string, payload: unknown) => {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [actor, action, targetId, JSON.stringify(payload)],
  );
};

export const listMerchantCommissionContracts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { merchant_id, market_code, status } = req.query;
    const result = await readDb.query(
      `SELECT id, merchant_id, market_code, service_code, contract_version,
              commission_basis, commission_percent, fixed_fee_idr,
              effective_from, effective_to, status, approval_reference,
              approved_by, approved_at, created_by, metadata, created_at, updated_at
         FROM merchant_commission_contracts
        WHERE ($1::uuid IS NULL OR merchant_id = $1::uuid)
          AND ($2::text IS NULL OR market_code = UPPER($2::text))
          AND ($3::text IS NULL OR status = $3::text)
        ORDER BY merchant_id, market_code, service_code, effective_from DESC`,
      [merchant_id ? String(merchant_id) : null, market_code ? String(market_code) : null, status ? String(status) : null],
    );
    res.json({ success: true, data: result.rows });
  } catch (error: any) {
    securityLog.error('Error listing merchant commission contracts:', error);
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};

// Creation always starts as draft. An approved contract can only be produced
// by the separate maker/checker approval endpoint with a reference.
export const createMerchantCommissionContract = async (req: Request, res: Response): Promise<void> => {
  const body = req.body || {};
  let actor: string;
  try {
    actor = actorId(req);
    const merchantId = requireUUID(body.merchant_id, 'merchant_id');
    const marketCode = String(body.market_code || 'ID-JK').trim().toUpperCase();
    const serviceCode = String(body.service_code || CONTRACT_SERVICE).trim().toLowerCase();
    const version = String(body.contract_version || '').trim();
    const basis = String(body.commission_basis || 'item_subtotal').trim().toLowerCase();
    const percent = Number(body.commission_percent);
    const fixedFee = Number(body.fixed_fee_idr || 0);
    const effectiveFrom = new Date(body.effective_from);
    const effectiveTo = body.effective_to ? new Date(body.effective_to) : null;
    if (!marketCode || marketCode.length > 32 || !version || version.length > 100) throw Object.assign(new Error('market_code dan contract_version wajib valid'), { statusCode: 400 });
    if (serviceCode !== CONTRACT_SERVICE) throw Object.assign(new Error('contract service saat ini harus food_delivery'), { statusCode: 400 });
    if (!['item_subtotal', 'gross_item'].includes(basis)) throw Object.assign(new Error('commission_basis tidak valid'), { statusCode: 400 });
    if (!Number.isFinite(percent) || percent < 0 || percent > 100 || !Number.isFinite(fixedFee) || fixedFee < 0) throw Object.assign(new Error('nilai komisi tidak valid'), { statusCode: 400 });
    if (Number.isNaN(effectiveFrom.getTime()) || (effectiveTo && Number.isNaN(effectiveTo.getTime())) || (effectiveTo && effectiveTo <= effectiveFrom)) throw Object.assign(new Error('effective date tidak valid'), { statusCode: 400 });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO merchant_commission_contracts
          (merchant_id, market_code, service_code, contract_version,
           commission_basis, commission_percent, fixed_fee_idr,
           effective_from, effective_to, status, created_by, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10, $11::jsonb)
         RETURNING *`,
        [merchantId, marketCode, serviceCode, version, basis, percent, Math.trunc(fixedFee), effectiveFrom, effectiveTo, actor, JSON.stringify(body.metadata || {})],
      );
      await audit(client, actor, 'merchant_commission_contract.created', result.rows[0].id, { after: result.rows[0] });
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    securityLog.error('Error creating merchant commission contract:', error);
    res.status(error.statusCode || (error.code === '23505' ? 409 : 500)).json({ success: false, error: error.message });
  }
};

export const approveMerchantCommissionContract = async (req: Request, res: Response): Promise<void> => {
  let actor: string;
  try {
    actor = actorId(req);
    const id = requireUUID(req.params.id, 'contract id');
    const reference = String(req.body?.approval_reference || '').trim();
    if (!reference || reference.length > 160) throw Object.assign(new Error('approval_reference wajib diisi'), { statusCode: 400 });

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query('SELECT * FROM merchant_commission_contracts WHERE id = $1 FOR UPDATE', [id]);
      if (!before.rows[0]) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: 'merchant commission contract tidak ditemukan' });
        return;
      }
      if (before.rows[0].status !== 'draft') {
        await client.query('ROLLBACK');
        res.status(409).json({ success: false, error: 'hanya contract draft yang dapat di-approve' });
        return;
      }
      const result = await client.query(
        `UPDATE merchant_commission_contracts
            SET status = 'approved', approval_reference = $1,
                approved_by = $2, approved_at = NOW(), updated_at = NOW()
          WHERE id = $3
          RETURNING *`,
        [reference, actor, id],
      );
      await audit(client, actor, 'merchant_commission_contract.approved', id, { before: before.rows[0], after: result.rows[0], approval_reference: reference });
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    securityLog.error('Error approving merchant commission contract:', error);
    res.status(error.statusCode || (error.code === '23P01' ? 409 : 500)).json({ success: false, error: error.message });
  }
};

export const retireMerchantCommissionContract = async (req: Request, res: Response): Promise<void> => {
  let actor: string;
  try {
    actor = actorId(req);
    const id = requireUUID(req.params.id, 'contract id');
    const reference = String(req.body?.change_reference || '').trim();
    if (!reference || reference.length > 160) throw Object.assign(new Error('change_reference wajib diisi untuk retire contract'), { statusCode: 400 });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query('SELECT * FROM merchant_commission_contracts WHERE id = $1 FOR UPDATE', [id]);
      if (!before.rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: 'merchant commission contract tidak ditemukan' }); return; }
      const result = await client.query(`UPDATE merchant_commission_contracts SET status = 'retired', updated_at = NOW(), metadata = metadata || jsonb_build_object('retirement_reference', $2::text) WHERE id = $1 RETURNING *`, [id, reference]);
      await audit(client, actor, 'merchant_commission_contract.retired', id, { before: before.rows[0], after: result.rows[0], change_reference: reference });
      await client.query('COMMIT');
      res.json({ success: true, data: result.rows[0] });
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  } catch (error: any) {
    securityLog.error('Error retiring merchant commission contract:', error);
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
};
