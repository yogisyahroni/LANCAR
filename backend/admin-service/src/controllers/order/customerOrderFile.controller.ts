import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';
import { db } from '../../db';
import fs from 'fs';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

export const uploadOrderFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const savedUpload = saveSecureUploadBuffer(req.file, 'orders');
    res.json({ success: true, url: savedUpload.fileUrl });
  } catch (error: any) {
    securityLog.error('Error uploading order file:', error);
    res.status(500).json({ error: error.message });
  }
};

const roadsidePhotoRoles = new Set(['tire_condition', 'vehicle_condition']);
const terminalOrderStatuses = new Set(['cancelled', 'canceled', 'failed', 'rejected', 'completed', 'delivered']);

/**
 * Uploads a customer-supplied roadside photo and atomically associates it with
 * the order's canonical JSONB contract. The generic order upload endpoint is
 * intentionally left untouched because it is also used by disputes.
 */
export const uploadRoadsidePhoto = async (req: Request, res: Response) => {
  let savedUpload: ReturnType<typeof saveSecureUploadBuffer> | null = null;
  const orderId = String(req.params.id || '').trim();
  const customerId = req.user?.id;
  const photoRole = String(req.body?.photo_role || '').trim().toLowerCase();

  if (!customerId) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (!orderId || !roadsidePhotoRoles.has(photoRole)) {
    return res.status(400).json({ success: false, error: 'Order dan photo_role roadside wajib diisi' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT id, service_sub_type, status, package_details
         FROM orders
        WHERE id = $1 AND customer_id = $2
        FOR UPDATE`,
      [orderId, customerId],
    );
    if (orderResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Order roadside tidak ditemukan' });
    }

    const order = orderResult.rows[0];
    const serviceSubType = String(order.service_sub_type || '').trim().toLowerCase();
    const isTambalBan = serviceSubType.startsWith('tambal_ban_');
    const isTowing = serviceSubType.startsWith('towing_');
    if (!isTambalBan && !isTowing) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Foto hanya tersedia untuk order tambal ban atau towing' });
    }
    if ((isTambalBan && photoRole !== 'tire_condition') || (isTowing && photoRole !== 'vehicle_condition')) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'photo_role tidak sesuai dengan layanan order' });
    }
    if (terminalOrderStatuses.has(String(order.status || '').toLowerCase())) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Foto tidak dapat ditambahkan setelah order selesai atau dibatalkan' });
    }

    const packageDetails = order.package_details && typeof order.package_details === 'object'
      ? { ...order.package_details }
      : {};
    const vehicleDetails = packageDetails.vehicle_details && typeof packageDetails.vehicle_details === 'object'
      ? { ...packageDetails.vehicle_details }
      : {};
    const existingItems = Array.isArray(vehicleDetails.photo_items) ? vehicleDetails.photo_items : [];
    const duplicateItem = existingItems.find((item: { checksum_sha256?: unknown }) =>
      String(item?.checksum_sha256 || '') === String(req.file?.checksumSha256 || '')
    );
    if (duplicateItem && typeof duplicateItem === 'object') {
      await client.query('ROLLBACK');
      return res.status(200).json({
        success: true,
        url: String((duplicateItem as { url?: unknown }).url || ''),
        photo_role: photoRole,
        photo_count: existingItems.length,
        deduplicated: true,
      });
    }
    if (existingItems.length >= 3) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Maksimal 3 foto kondisi kendaraan dapat ditambahkan' });
    }

    savedUpload = saveSecureUploadBuffer(req.file, 'orders/roadside');
    const photoItem = {
      role: photoRole,
      url: savedUpload.fileUrl,
      mime_type: req.file.detectedMimeType,
      checksum_sha256: req.file.checksumSha256,
      uploaded_at: new Date().toISOString(),
    };
    vehicleDetails.photo_items = [...existingItems, photoItem];
    vehicleDetails.photo_urls = vehicleDetails.photo_items.map((item: { url?: unknown }) => String(item?.url || '')).filter(Boolean);
    packageDetails.vehicle_details = vehicleDetails;

    await client.query(
      `UPDATE orders
          SET package_details = $1::jsonb,
              updated_at = NOW()
        WHERE id = $2 AND customer_id = $3`,
      [JSON.stringify(packageDetails), orderId, customerId],
    );
    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      url: savedUpload.fileUrl,
      photo_role: photoRole,
      photo_count: vehicleDetails.photo_items.length,
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (savedUpload?.absolutePath) {
      try {
        fs.unlinkSync(savedUpload.absolutePath);
      } catch {
        // Best-effort cleanup; the DB transaction remains authoritative.
      }
    }
    securityLog.error('Error uploading roadside photo:', { error: error?.message, orderId, photoRole });
    return res.status(500).json({ success: false, error: 'Gagal menyimpan foto layanan' });
  } finally {
    client.release();
  }
};


