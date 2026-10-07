import { Request, Response } from 'express';
import { db } from '../../db';
import { securityLog } from '../../security/logRedaction';

const clean = (value: unknown) => String(value ?? '').trim();

const errorResponse = (res: Response, status: number, message: string, code: string) => {
  res.status(status).json({ success: false, data: null, message, code });
};

export const updateMobileCourierServicePreference = async (req: Request, res: Response): Promise<void> => {
  if (!req.user?.id) {
    errorResponse(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    return;
  }

  const serviceCode = clean(req.params.serviceCode).toLowerCase();
  const isEnabled = req.body?.is_enabled ?? req.body?.isEnabled;
  if (!/^[a-z0-9_:-]{2,60}$/.test(serviceCode) || typeof isEnabled !== 'boolean') {
    errorResponse(res, 400, 'Kode layanan dan status aktif harus valid.', 'ERR_INVALID_SERVICE_PREFERENCE');
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const capability = await client.query(
      `SELECT cp.id AS courier_profile_id,
              csc.id,
              csc.service_code,
              csc.status,
              csc.courier_enabled,
              cce.is_eligible,
              cce.availability_reason,
              dsp.name AS service_name
         FROM courier_profiles cp
         JOIN courier_service_capabilities csc
           ON csc.courier_profile_id = cp.id
          AND csc.service_code = $2
         JOIN delivery_service_products dsp
           ON dsp.code = csc.service_code
          AND dsp.service_category = 'on_demand'
          AND dsp.is_enabled = TRUE
         JOIN courier_capability_eligibility cce ON cce.id = csc.id
        WHERE cp.user_id = $1
        FOR UPDATE OF csc` ,
      [req.user.id, serviceCode],
    );

    const row = capability.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      errorResponse(res, 404, 'Layanan belum tersedia untuk akun kurir ini.', 'ERR_SERVICE_NOT_FOUND');
      return;
    }

    if (isEnabled && row.status !== 'enabled') {
      await client.query('ROLLBACK');
      errorResponse(res, 422, 'Layanan belum disetujui admin sehingga belum dapat diaktifkan.', 'ERR_SERVICE_NOT_APPROVED');
      return;
    }

    const updated = await client.query(
      `UPDATE courier_service_capabilities
          SET courier_enabled = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING service_code, courier_enabled AS is_enabled, updated_at`,
      [row.id, isEnabled],
    );

    if (isEnabled) {
      const eligibility = await client.query(
        `SELECT courier_capability_is_eligible($1, $2, cp.market_code) AS is_eligible
           FROM courier_profiles cp
          WHERE cp.id = $3`,
        [row.courier_profile_id, serviceCode, row.courier_profile_id],
      );
      if (!eligibility.rows[0]?.is_eligible) {
        await client.query('ROLLBACK');
        errorResponse(
          res,
          422,
          row.availability_reason || 'Layanan belum memenuhi syarat operasional untuk diaktifkan.',
          'ERR_SERVICE_NOT_ELIGIBLE',
        );
        return;
      }
    }

    await client.query('COMMIT');
    res.json({
      success: true,
      data: {
        ...updated.rows[0],
        service_name: row.service_name,
        status: row.status,
      },
      message: isEnabled ? `${row.service_name} diaktifkan.` : `${row.service_name} dinonaktifkan.`,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    securityLog.error('Update courier service preference error:', error);
    errorResponse(res, 500, 'Status layanan belum berhasil diperbarui.', 'ERR_SERVICE_PREFERENCE_UPDATE');
  } finally {
    client.release();
  }
};
