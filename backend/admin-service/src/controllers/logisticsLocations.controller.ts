import { Request, Response } from 'express';
import { readDb } from '../db';

const normalizeProvider = (value: unknown): string => String(value || '').trim().toLowerCase();

/**
 * Return provider area codes from the operational mapping table.
 *
 * The aggregator tariff APIs do not accept generic city abbreviations; they
 * require provider-owned area codes. Keeping this lookup server-backed avoids
 * silently quoting a lane with a stale UI placeholder.
 */
export const listCustomerLogisticsLocations = async (req: Request, res: Response): Promise<void> => {
  const provider = normalizeProvider(req.query.provider);
  if (!provider) {
    res.status(400).json({
      success: false,
      error: 'Provider logistics belum dipilih',
      code: 'LOGISTICS_PROVIDER_REQUIRED',
    });
    return;
  }

  try {
    const { rows } = await readDb.query(
      `SELECT DISTINCT provider_area_code AS code,
              city_name AS name,
              'both'::text AS type
         FROM provider_area_mappings
        WHERE LOWER(provider_code) = $1
          AND provider_area_code IS NOT NULL
          AND BTRIM(provider_area_code) <> ''
        ORDER BY city_name ASC, provider_area_code ASC`,
      [provider],
    );

    if (rows.length === 0) {
      res.status(503).json({
        success: false,
        error: `Data area ${provider.toUpperCase()} belum tersedia. Silakan lengkapi mapping provider terlebih dahulu.`,
        code: 'LOGISTICS_LOCATION_MAPPING_EMPTY',
      });
      return;
    }

    res.json({
      success: true,
      provider,
      source: 'provider_area_mappings',
      data: rows,
    });
  } catch (error: any) {
    const code = error?.code === '42P01' ? 'LOGISTICS_LOCATION_MAPPING_UNAVAILABLE' : 'LOGISTICS_LOCATION_LOOKUP_FAILED';
    res.status(503).json({
      success: false,
      error: 'Data area provider belum dapat dimuat dari server.',
      code,
    });
  }
};
