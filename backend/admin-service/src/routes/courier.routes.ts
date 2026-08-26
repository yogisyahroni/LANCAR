import { Router } from 'express';
import * as controllers from '../controllers';
import { requireAuth, requireRole, requireTotp, verifyWebSession, verifySession, requireMobileOrWebAuth } from '../middlewares';
import {
  communicationCallRateLimiter, communicationMessageRateLimiter, communicationReadRateLimiter,
  courierFaceRateLimiter, courierOfferRateLimiter, courierProofRateLimiter,
  promoMutationRateLimiter, promoReadRateLimiter, toggleRateLimiter, publicEndpointRateLimiter,
} from '../rateLimit';
import { requireIdempotencyKey } from '../middleware/idempotencyRequirement';
import { secureUploadSingle } from '../security/uploadSecurity';

// courier routes (extracted from routes.ts)
export const courierRoutes = Router();

courierRoutes.get('/api/v1/courier/profile', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierProfile(req, res));
courierRoutes.put('/api/v1/courier/profile/capacity', requireMobileOrWebAuth, (req, res) => controllers.updateMobileCourierCapacity(req, res));
courierRoutes.get('/api/v1/courier/on-demand/services', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOnDemandServices(req, res));
courierRoutes.get('/api/v1/courier/on-demand/hotspots', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierHotspots(req, res));
courierRoutes.get('/api/v1/courier/on-demand/pickup-cancellation-reasons', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPickupCancellationReasons(req, res));
courierRoutes.get('/api/v1/courier/order-status-transitions', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierStatusTransitions(req, res));
courierRoutes.get('/api/v1/courier/performance', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPerformance(req, res));
courierRoutes.get('/api/v1/courier/earnings-ledger', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierEarningsLedger(req, res));
courierRoutes.get('/api/v1/courier/payout/summary', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPayoutSummary(req, res));
courierRoutes.get('/api/v1/courier/payout/requests', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierPayoutRequests(req, res));
courierRoutes.post('/api/v1/courier/payout/requests', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierPayoutRequest(req, res));
courierRoutes.get('/api/v1/courier/capabilities', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierCapabilities(req, res));
courierRoutes.post('/api/v1/courier/capabilities/request', requireMobileOrWebAuth, (req, res) => controllers.requestMobileCourierCapabilityUpgrade(req, res));
courierRoutes.post('/api/v1/courier/training/complete', requireMobileOrWebAuth, (req, res) => controllers.completeMobileCourierTraining(req, res));
courierRoutes.get('/api/v1/courier/orders', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOrders(req, res));
courierRoutes.get('/api/v1/courier/offers', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierOffers(req, res));
courierRoutes.post('/api/v1/courier/offers/:id/accept', requireMobileOrWebAuth, courierOfferRateLimiter, requireIdempotencyKey('courier.offer.accept'), (req, res) => controllers.acceptMobileCourierOffer(req, res));
courierRoutes.post('/api/v1/courier/offers/:id/reject', requireMobileOrWebAuth, courierOfferRateLimiter, requireIdempotencyKey('courier.offer.reject'), (req, res) => controllers.rejectMobileCourierOffer(req, res));
courierRoutes.patch('/api/v1/courier/duty', requireMobileOrWebAuth, (req, res) => controllers.updateMobileCourierDuty(req, res));
courierRoutes.post('/api/v1/courier/face/verify', requireMobileOrWebAuth, courierFaceRateLimiter, requireIdempotencyKey('courier.face.verify'), ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.verifyMobileCourierFace(req, res));
courierRoutes.post('/api/v1/courier/safety-events', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierSafetyEvent(req, res));
courierRoutes.post('/api/v1/courier/safety-events/photo', requireMobileOrWebAuth, ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.createMobileCourierSafetyEvent(req, res));
courierRoutes.post('/api/v1/courier/trip-share', requireMobileOrWebAuth, (req, res) => controllers.createMobileCourierTripShare(req, res));
courierRoutes.get('/api/v1/courier/routes/active-plan', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierActiveRoutePlan(req, res));
courierRoutes.get('/api/v1/courier/orders/:orderId/route', requireMobileOrWebAuth, (req, res) => controllers.getMobileCourierRoutePreview(req, res));
courierRoutes.post('/api/v1/courier/orders/:orderId/cancel-pickup', requireMobileOrWebAuth, ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.cancelMobileCourierOnDemandPickup(req, res));
courierRoutes.post('/api/v1/courier/service-report/proof', requireMobileOrWebAuth, courierProofRateLimiter, requireIdempotencyKey('courier.service-report.proof'), ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.uploadMobileCourierServiceReportProof(req, res));
courierRoutes.post('/api/v1/courier/fcm/register', requireMobileOrWebAuth, (req, res) => controllers.registerDeviceToken(req, res));
courierRoutes.post('/api/v1/courier/fcm/unregister', requireMobileOrWebAuth, (req, res) => controllers.unregisterDeviceToken(req, res));
