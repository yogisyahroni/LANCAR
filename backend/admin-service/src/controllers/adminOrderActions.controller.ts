import { Request, Response } from 'express';
import { z } from 'zod';
import { securityLog } from '../security/logRedaction';
import { forceCancelOrder } from '../services/adminOrderActions.service';
import { updateDisputeStatus } from './disputes.controller';

const forceCancelSchema = z.object({
  reason: z.string().trim().min(10, 'Alasan wajib minimal 10 karakter'),
  refund_mode: z.enum(['none', 'full', 'partial']),
  refund_items: z
    .array(
      z.object({
        item_id: z.string().trim().min(1),
        qty: z.number().int().positive(),
      }),
    )
    .max(100)
    .optional(),
  restock: z.boolean().optional(),
});

export const forceCancelAdminOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = forceCancelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Payload tidak valid',
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
      return;
    }

    const actorId = req.user?.id;
    if (!actorId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await forceCancelOrder({
      orderId: String(req.params.id),
      actorId,
      reason: parsed.data.reason,
      refund_mode: parsed.data.refund_mode,
      refund_items: parsed.data.refund_items,
      restock: parsed.data.restock,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.statusCode === 409) {
      res.status(error.statusCode).json({ success: false, error: error.message });
      return;
    }
    securityLog.error('[ForceCancel] unexpected failure:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Thin wrapper untuk PATCH /admin/disputes/:id/resolve:
// menormalkan status menjadi 'resolved' lalu mendelegasikan seluruh alur
// (resolution memihak customer/merchant/both, refund_items[], include_delivery_fee,
// chargeback merchant, notifikasi) ke updateDisputeStatus yang sudah ada —
// disputes.controller.ts tidak diubah.
export const resolveAdminDispute = async (req: Request, res: Response): Promise<void> => {
  req.body = { ...(req.body || {}), status: req.body?.status || 'resolved' };
  await updateDisputeStatus(req, res);
};
