import { NextFunction, Request, Response } from 'express';
import { db } from '../db';

type AggregatorRateQuoteRow = {
  id: string;
  provider_code: string;
  origin_code: string;
  destination_code: string;
  chargeable_weight_kg: string | number;
  length_cm: string | number;
  width_cm: string | number;
  height_cm: string | number;
  item_value_idr: string | number;
  category: string;
  insurance: boolean;
  cod: boolean;
  service_code: string;
  service_name: string;
  tariff_gross_idr: string | number;
  tariff_net_idr: string | number;
  customer_tariff_idr: string | number;
  eta: string;
  eta_source: string;
  rule_version: string;
  expires_at: Date;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EPSILON = 0.001;

const normalizedText = (value: unknown) => String(value ?? '').trim().toLowerCase();

const positiveNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const nonNegativeNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const boolValue = (value: unknown): boolean => value === true || value === 'true' || value === 1 || value === '1';

const nearlyEqual = (left: number, right: number) => Math.abs(left - right) <= EPSILON;

const requote = (res: Response, message: string) => {
  res.status(409).json({
    success: false,
    code: 'REQUOTE_REQUIRED',
    error: message,
    requires_requote: true,
    request_id: res.locals.requestId,
    correlation_id: res.locals.correlationId,
  });
};

const firstPackage = (body: any) => Array.isArray(body?.packages) ? body.packages[0] : undefined;

const requestDimensions = (body: any) => {
  const packageDetails = body?.package_details ?? {};
  const dimensions = packageDetails?.dimensions ?? {};
  const pkg = firstPackage(body) ?? {};
  return {
    length: nonNegativeNumber(
      dimensions?.length_cm ?? dimensions?.length ?? packageDetails?.length_cm ?? pkg?.length_cm,
    ) ?? 0,
    width: nonNegativeNumber(
      dimensions?.width_cm ?? dimensions?.width ?? packageDetails?.width_cm ?? pkg?.width_cm,
    ) ?? 0,
    height: nonNegativeNumber(
      dimensions?.height_cm ?? dimensions?.height ?? packageDetails?.height_cm ?? pkg?.height_cm,
    ) ?? 0,
  };
};

const chargeableWeightKg = (
  actualWeightKg: number,
  lengthCm: number,
  widthCm: number,
  heightCm: number,
) => {
  if (lengthCm <= 0 || widthCm <= 0 || heightCm <= 0) {
    return actualWeightKg;
  }
  return Math.max(actualWeightKg, (lengthCm * widthCm * heightCm) / 6000);
};

/**
 * Re-validates an immutable carrier-rate snapshot at the order-create boundary.
 * Client-supplied tariff/net values are never trusted: once the snapshot is
 * validated, this middleware replaces them with persisted server values.
 *
 * Provider/service/route/package-weight inputs are always bound. Optional
 * commercial inputs are bound when they were actually present in the quote.
 * This keeps older clients compatible until every quote caller sends those
 * optional inputs, without ever trusting client-supplied monetary amounts.
 */
export const requireAuthoritativeAggregatorQuote = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const provider = normalizedText(req.body?.logistics_provider);
  if (!provider) {
    next();
    return;
  }

  const serviceCode = normalizedText(req.body?.logistics_service_type);
  const quoteId = String(req.body?.aggregator_quote_id ?? '').trim();
  if (!serviceCode || !UUID_PATTERN.test(quoteId)) {
    requote(res, 'Quote carrier valid wajib dipilih ulang sebelum membuat order.');
    return;
  }

  try {
    const result = await db.query<AggregatorRateQuoteRow>(
      `SELECT id::text,
              provider_code,
              origin_code,
              destination_code,
              chargeable_weight_kg,
              length_cm,
              width_cm,
              height_cm,
              item_value_idr,
              category,
              insurance,
              cod,
              service_code,
              service_name,
              tariff_gross_idr,
              tariff_net_idr,
              customer_tariff_idr,
              eta,
              eta_source,
              rule_version,
              expires_at
         FROM aggregator_rate_quotes
        WHERE id = $1::uuid
          AND expires_at > NOW()
        LIMIT 1`,
      [quoteId],
    );

    const quote = result.rows[0];
    if (!quote) {
      requote(res, 'Quote carrier sudah kedaluwarsa atau tidak ditemukan. Hitung ulang tarif.');
      return;
    }

    if (
      normalizedText(quote.provider_code) !== provider ||
      normalizedText(quote.service_code) !== serviceCode
    ) {
      requote(res, 'Provider atau layanan berubah setelah quote dibuat. Hitung ulang tarif.');
      return;
    }

    const submittedOrigin = normalizedText(req.body?.origin_code);
    const submittedDestination = normalizedText(req.body?.destination_code);
    if (submittedOrigin && submittedOrigin !== normalizedText(quote.origin_code)) {
      requote(res, 'Kota asal berubah setelah quote dibuat. Hitung ulang tarif.');
      return;
    }
    if (submittedDestination && submittedDestination !== normalizedText(quote.destination_code)) {
      requote(res, 'Kota tujuan berubah setelah quote dibuat. Hitung ulang tarif.');
      return;
    }

    req.body.origin_code = quote.origin_code;
    req.body.destination_code = quote.destination_code;

    const packageWeight = positiveNumber(
      req.body?.package_details?.weight_kg ?? firstPackage(req.body)?.weight_kg,
    );
    if (!packageWeight) {
      requote(res, 'Berat paket wajib sama dengan input quote. Hitung ulang tarif.');
      return;
    }

    const dimensions = requestDimensions(req.body);
    const quotedLength = Number(quote.length_cm);
    const quotedWidth = Number(quote.width_cm);
    const quotedHeight = Number(quote.height_cm);
    const quotedWeight = Number(quote.chargeable_weight_kg);
    if (
      !Number.isFinite(quotedLength) ||
      !Number.isFinite(quotedWidth) ||
      !Number.isFinite(quotedHeight) ||
      !Number.isFinite(quotedWeight) ||
      quotedWeight <= 0
    ) {
      next(new Error('Persisted aggregator quote contains invalid package dimensions or weight'));
      return;
    }

    if (
      !nearlyEqual(dimensions.length, quotedLength) ||
      !nearlyEqual(dimensions.width, quotedWidth) ||
      !nearlyEqual(dimensions.height, quotedHeight)
    ) {
      requote(res, 'Dimensi paket berubah setelah quote dibuat. Hitung ulang tarif.');
      return;
    }

    const submittedChargeableWeight = chargeableWeightKg(
      packageWeight,
      dimensions.length,
      dimensions.width,
      dimensions.height,
    );
    if (!nearlyEqual(submittedChargeableWeight, quotedWeight)) {
      requote(res, 'Berat hitung paket berubah setelah quote dibuat. Hitung ulang tarif.');
      return;
    }

    const quotedItemValue = Number(quote.item_value_idr);
    if (Number.isFinite(quotedItemValue) && quotedItemValue > 0) {
      const submittedItemValue = nonNegativeNumber(req.body?.item_value);
      if (submittedItemValue === null || submittedItemValue !== quotedItemValue) {
        requote(res, 'Nilai barang berubah setelah quote dibuat. Hitung ulang tarif.');
        return;
      }
    }

    const quotedCategory = normalizedText(quote.category);
    if (quotedCategory) {
      const submittedCategory = normalizedText(
        req.body?.package_details?.category ?? firstPackage(req.body)?.category,
      );
      if (submittedCategory !== quotedCategory) {
        requote(res, 'Kategori barang berubah setelah quote dibuat. Hitung ulang tarif.');
        return;
      }
    }

    if (Boolean(quote.insurance) && !boolValue(req.body?.has_insurance)) {
      requote(res, 'Opsi asuransi berubah setelah quote dibuat. Hitung ulang tarif.');
      return;
    }

    if (Boolean(quote.cod) && normalizedText(req.body?.payment_method) !== 'cod') {
      requote(res, 'Opsi COD berubah setelah quote dibuat. Hitung ulang tarif.');
      return;
    }

    const customerTariff = Number(quote.customer_tariff_idr);
    const netTariff = Number(quote.tariff_net_idr);
    if (!Number.isFinite(customerTariff) || customerTariff <= 0 || !Number.isFinite(netTariff) || netTariff <= 0) {
      next(new Error('Persisted aggregator quote contains invalid monetary values'));
      return;
    }

    req.body.logistics_tariff_idr = customerTariff;
    req.body.logistics_net_cost_idr = netTariff;
    req.body.quote_id = quote.id;
    req.body.quote_total_price_idr = customerTariff;
    req.body.quote_expires_at = quote.expires_at.toISOString();
    req.body.price_breakdown = {
      ...(req.body.price_breakdown || {}),
      quote_id: quote.id,
      total_price_idr: customerTariff,
      provider: quote.provider_code,
      service_type: quote.service_code,
      quote_etd: quote.eta || undefined,
      quote_etd_source: quote.eta_source || undefined,
      quote_rule_version: quote.rule_version,
    };

    res.locals.aggregatorQuote = {
      id: quote.id,
      provider_code: quote.provider_code,
      service_code: quote.service_code,
      customer_tariff_idr: customerTariff,
      tariff_net_idr: netTariff,
      rule_version: quote.rule_version,
      expires_at: quote.expires_at,
    };

    next();
  } catch (error: any) {
    if (error?.code === '42P01') {
      res.status(503).json({
        success: false,
        code: 'AGGREGATOR_QUOTE_STORE_UNAVAILABLE',
        error: 'Penyimpanan quote carrier belum siap. Order aggregator tidak dapat dibuat dengan harga dari client.',
        request_id: res.locals.requestId,
        correlation_id: res.locals.correlationId,
      });
      return;
    }
    next(error);
  }
};
