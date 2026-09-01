import { Request, Response } from 'express';
import { db } from '../db';

const TAMBAL_BAN_SERVICES = new Set(['tambal_ban_motor', 'tambal_ban_mobil']);

/**
 * Read-only customer catalog. Prices are loaded from the database so an
 * operator can change the catalog through a migration/admin workflow without
 * shipping a new mobile client.
 */
export const listTambalBanMaterials = async (req: Request, res: Response): Promise<void> => {
  const serviceCode = String(req.query.service_code || '').trim().toLowerCase();
  if (!TAMBAL_BAN_SERVICES.has(serviceCode)) {
    res.status(400).json({
      code: 'ERR_INVALID_SERVICE',
      message: 'service_code harus tambal_ban_motor atau tambal_ban_mobil',
    });
    return;
  }

  try {
    const result = await db.query(
      `SELECT code, name, description, service_code, vehicle_type, price_idr, updated_at
         FROM tambal_ban_materials
        WHERE service_code = $1 AND is_active = TRUE
        ORDER BY name ASC`,
      [serviceCode],
    );

    res.json({
      success: true,
      service_code: serviceCode,
      data: result.rows,
      catalog_updated_at: result.rows.reduce<string | null>((latest, row) => {
        const current = row.updated_at ? new Date(row.updated_at).toISOString() : null;
        return !latest || (current && current > latest) ? current : latest;
      }, null),
    });
  } catch (error) {
    res.status(500).json({
      code: 'ERR_MATERIAL_CATALOG_UNAVAILABLE',
      message: 'Katalog material belum tersedia. Silakan coba lagi.',
    });
  }
};
