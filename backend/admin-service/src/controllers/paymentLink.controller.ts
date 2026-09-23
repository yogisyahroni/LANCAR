import { Request, Response } from 'express';
import axios from 'axios';

const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:8083';

export const createLink = async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${ORDER_SERVICE_URL}/api/v1/payment-links`,
      req.body,
      {
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const listLinks = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/payment-links`,
      {
        params: req.query,
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const getLink = async (req: Request, res: Response) => {
  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/payment-links/${req.params.id}`,
      {
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

export const checkoutLink = async (req: Request, res: Response) => {
  try {
    const response = await axios.post(
      `${ORDER_SERVICE_URL}/api/v1/payment-links/${req.params.id}/checkout`,
      req.body,
      {
        headers: {
          'X-User-ID': req.user?.id,
        },
      }
    );
    res.status(response.status).json(response.data);
  } catch (err: any) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: 'Internal Server Error' });
  }
};

import { db, readDb } from '../db';
import { v4 as uuidv4 } from 'uuid';

/**
 * checkTariff — Cek ongkos kirim 3PL (JNE/J&T) sebelum buat pesanan/payment link.
 * Proxy ke order-service /api/v1/logistics/tariff atau kalkulasi via database rate cards.
 * Query params: provider, origin_code, destination_code, weight_kg, length_cm, width_cm, height_cm
 */
export const checkTariff = async (req: Request, res: Response) => {
  const provider = String(req.query.provider || '').trim().toLowerCase();
  const originCode = String(req.query.origin_code || '').trim();
  const destinationCode = String(req.query.destination_code || '').trim();
  const weightInput = parseFloat(String(req.query.weight_kg || ''));
  const lengthCm = parseFloat(String(req.query.length_cm || '')) || 0;
  const widthCm = parseFloat(String(req.query.width_cm || '')) || 0;
  const heightCm = parseFloat(String(req.query.height_cm || '')) || 0;
  const itemValue = parseInt(String(req.query.item_value_idr || ''), 10) || 0;
  const hasInsurance = String(req.query.insurance) === 'true';
  const category = String(req.query.category || '').trim().toLowerCase();

  if (!provider || !originCode || !destinationCode || !Number.isFinite(weightInput) || weightInput <= 0 || !category) {
    res.status(400).json({
      success: false,
      error: 'Provider, area asal/tujuan, berat, dan kategori paket wajib berasal dari pilihan yang valid.',
      code: 'LOGISTICS_TARIFF_INPUT_REQUIRED',
    });
    return;
  }

  try {
    const response = await axios.get(
      `${ORDER_SERVICE_URL}/api/v1/logistics/tariff`,
      {
        params: req.query,
        headers: {
          'X-User-ID': req.user?.id,
          'Authorization': req.headers.authorization || '',
        },
        timeout: 3000,
      }
    );
    if (response.data && response.data.success && response.data.data?.services?.length > 0) {
      try {
        const serviceCodes = response.data.data.services
          .map((service: any) => String(service?.service_code || '').trim())
          .filter(Boolean);
        if (serviceCodes.length > 0) {
          const metadata = await readDb.query(
            `SELECT ps.service_code, ps.customer_badge, ps.customer_description,
                    ps.description, ps.etd_label, ps.min_weight_kg,
                    ps.customer_display_order
               FROM provider_services ps
               JOIN logistics_providers lp ON lp.id = ps.provider_id
              WHERE LOWER(lp.code) = $1 AND ps.service_code = ANY($2::text[])`,
            [provider, serviceCodes]
          );
          const byCode = new Map(metadata.rows.map((row: any) => [String(row.service_code).toLowerCase(), row]));
          response.data.data.services = response.data.data.services.map((service: any) => {
            const row = byCode.get(String(service.service_code || '').toLowerCase());
            if (!row) return service;
            return {
              ...service,
              display_badge: service.display_badge || row.customer_badge || null,
              display_description: service.display_description || row.customer_description || row.description || null,
              etd: service.etd || row.etd_label || '',
              min_weight_kg: service.min_weight_kg || row.min_weight_kg || null,
            };
          }).sort((left: any, right: any) => {
            const leftOrder = Number(byCode.get(String(left.service_code || '').toLowerCase())?.customer_display_order ?? 1000);
            const rightOrder = Number(byCode.get(String(right.service_code || '').toLowerCase())?.customer_display_order ?? 1000);
            return leftOrder - rightOrder;
          });
        }
      } catch (metadataError: any) {
        console.warn('Aggregator service presentation metadata unavailable:', metadataError?.message);
      }
      res.status(response.status).json(response.data);
      return;
    }
  } catch (err: any) {
    // Fallback to authoritative database rates
  }

  try {
    // 1. Ambil list provider services aktif dari DB
    const pRes = await readDb.query(
      `SELECT ps.service_code, ps.service_name, ps.base_rate, ps.description,
              ps.customer_badge, ps.customer_description, ps.etd_label, ps.min_weight_kg,
              ps.customer_display_order
         FROM provider_services ps
         JOIN logistics_providers lp ON lp.id = ps.provider_id
        WHERE LOWER(lp.code) = $1 AND ps.is_active = true
        ORDER BY COALESCE(ps.customer_display_order, 1000) ASC,
                 ps.base_rate ASC,
                 ps.service_name ASC`,
      [provider]
    );

    const dbServices = pRes.rows;
    if (dbServices.length === 0) {
      res.status(503).json({
        success: false,
        error: `Layanan ekspedisi untuk ${provider.toUpperCase()} belum tersedia di database.`,
        code: 'LOGISTICS_SERVICES_UNAVAILABLE'
      });
      return;
    }

    const volumetricWeight = (lengthCm * widthCm * heightCm) / 6000;
    const baseChargeableWeight = Math.max(weightInput, volumetricWeight);
    const expiresAt = new Date(Date.now() + 7200000); // 2 jam

    const tariffServices = [];

    for (const s of dbServices) {
      const code = String(s.service_code || '').trim().toUpperCase();
      const minWeight = Math.max(0, Number(s.min_weight_kg) || 0);
      const ratePerKg = Number(s.base_rate);
      const etd = String(s.etd_label || '').trim();
      if (!code || !Number.isFinite(ratePerKg) || ratePerKg <= 0) continue;

      const effectiveWeight = Math.max(baseChargeableWeight, minWeight);
      const totalTariff = Math.round(effectiveWeight * ratePerKg);
      const quoteId = uuidv4();

      // Simpan quote ke database aggregator_rate_quotes untuk validasi saat create order
      const clientCategory = category;
      await db.query(`
        INSERT INTO aggregator_rate_quotes (
          id, provider_code, origin_code, destination_code, chargeable_weight_kg,
          length_cm, width_cm, height_cm, item_value_idr, category, insurance, cod,
          service_code, service_name, normalized_category, tariff_gross_idr, tariff_net_idr,
          customer_tariff_idr, eta, eta_source, rule_version, expires_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10, $11, false,
          $12, $13, $10, $14, $14,
          $14, $15, 'provider_db', '2026.03', $16, NOW()
        )
      `, [
        quoteId, provider, originCode, destinationCode, baseChargeableWeight,
        lengthCm, widthCm, heightCm, itemValue, clientCategory, hasInsurance,
        code, s.service_name, totalTariff, etd, expiresAt
      ]);

      tariffServices.push({
        service_code: code,
        service_name: s.service_name,
        display_badge: s.customer_badge || null,
        display_description: s.customer_description || s.description || null,
        min_weight_kg: minWeight,
        tariff_gross: totalTariff,
        tariff_net: totalTariff,
        customer_tariff_idr: totalTariff,
        etd: etd,
        etd_source: 'provider_db',
        quote_id: quoteId,
      });
    }

    res.json({
      success: true,
      data: {
        provider,
        origin: originCode,
        destination: destinationCode,
        weight: weightInput,
        chargeable_weight_kg: baseChargeableWeight,
        rule_version: '2026.03',
        expires_at: expiresAt.toISOString(),
        services: tariffServices
      }
    });
  } catch (dbErr: any) {
    console.error('DEBUG_CHECK_TARIFF_ERROR:', dbErr);
    res.status(500).json({
      success: false,
      error: dbErr.message || 'Gagal menghitung tarif ekspedisi dari database.',
      code: 'LOGISTICS_TARIFF_CALCULATION_FAILED'
    });
  }
};
