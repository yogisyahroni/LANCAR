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

// auth routes (extracted from routes.ts)
export const authRoutes = Router();

authRoutes.post('/auth/web/login', (req, res) => controllers.loginWeb(req, res));
authRoutes.post('/api/v1/auth/courier/login', (req, res) => controllers.loginCourier(req, res));
authRoutes.post('/api/v1/auth/courier/otp/verify', (req, res) => controllers.verifyCourierLoginOtp(req, res));
authRoutes.post('/api/v1/auth/courier/documents/upload', publicEndpointRateLimiter, ...secureUploadSingle('file', 'courierDocument'), (req, res) => controllers.uploadCourierOnDemandDocument(req, res));
authRoutes.post('/api/v1/auth/merchant/documents/upload', publicEndpointRateLimiter, ...secureUploadSingle('file', 'merchantDocument'), (req, res) => controllers.uploadMerchantPublicDocument(req, res));
authRoutes.get('/api/v1/auth/merchant/registration-status', publicEndpointRateLimiter, (req, res) => controllers.getMerchantRegistrationStatus(req, res));
authRoutes.post('/api/v1/auth/courier/register', (req, res) => controllers.submitOnDemandCourierApplication(req, res));
authRoutes.get('/api/v1/auth/courier/registration-links/:token', (req, res) => controllers.getPublicCourierRegistrationLink(req, res));
authRoutes.post('/api/v1/auth/courier/register/:token', (req, res) => controllers.submitCourierApplicationByRegistrationLink(req, res));
