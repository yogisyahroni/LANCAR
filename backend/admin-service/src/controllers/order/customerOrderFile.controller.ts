import { Request, Response } from 'express';
import { securityLog } from '../../security/logRedaction';

import type { PoolClient } from 'pg';
import { db } from '../../db';

import { createNotification } from '../../notifications';
import { createSnapTransaction, getMidtransClientKey, getMidtransSnapJsUrl } from '../../midtrans';

import { isExpiredOrFailedTransaction, isSuccessfulTransaction } from '../../midtrans';
import { calculateServiceSettlement, customerFacingService, DeliveryServiceProduct, findDeliveryServiceByCode, listEnabledDeliveryServicesForCustomer } from '../deliveryServices.controller';

import { advanceOnDemandDispatchQueue, dispatchToPreferredCourier, notifyOnDemandOffers } from '../courierAuth.controller';
import { redis } from '../../redis';

import { ON_DEMAND_REALTIME_EVENTS, emitOnDemandRealtime } from '../../services/onDemandRealtime';
import { buildOnDemandTrackingSnapshot, evaluateLocationQuality, writeLocationSafetyEvent } from '../../services/onDemandTracking';

import { evaluateOnDemandRealtimeAlerts } from '../../services/realtimeObservability';
import { buildMapsRouteEtaSnapshot, RouteEtaSnapshot } from '../../services/mapsProviderConfig';

import { enqueueOutboxEvent } from '../../services/eventOutbox';
import {
  createOrderCallSession,
  endOrderCallSession,
  errorStatusCode,
  joinOrderCallSession,
  listConversationChats,
  markConversationRead,
  revokeReceiverLocationInvite,
  sendConversationChat,
} from '../../services/orderCommunication';

import crypto from 'crypto';
import { saveSecureUploadBuffer } from '../../security/uploadSecurity';

import { releasePromoReservation, validatePromoForCheckout } from '../../services/promoEngine';
import {
  insertWebhookAuditEvent,
  resolveRawBody,
  updateWebhookAuditEvent,
  verifyMidtransSignature,
} from '../../security/webhookSecurity';




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


