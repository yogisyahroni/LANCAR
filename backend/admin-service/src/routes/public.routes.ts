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

// public routes (extracted from routes.ts)
export const publicRoutes = Router();

publicRoutes.post('/auth/web/session/exchange', (req, res) => controllers.exchangeCustomerJwtForWebSession(req, res));
publicRoutes.post('/auth/web/logout', (req, res) => controllers.logoutWeb(req, res));
publicRoutes.post('/auth/web/refresh-token', (req, res) => controllers.refreshToken(req, res));
publicRoutes.get('/auth/web/me', verifySession, (req, res) => controllers.me(req, res));
publicRoutes.get('/auth/web/sessions', verifyWebSession, (req, res) => controllers.getCustomerSessions(req, res));
publicRoutes.post('/auth/web/sessions/logout-others', verifyWebSession, (req, res) => controllers.logoutOtherCustomerSessions(req, res));
publicRoutes.post('/api/v1/customer/security/pin', requireMobileOrWebAuth, (req, res) => controllers.changeCustomerPin(req, res));
publicRoutes.get('/auth/web/wallet/balance', verifyWebSession, (req, res) => controllers.getWalletBalance(req, res));
publicRoutes.post('/auth/web/wallet/topup', verifyWebSession, (req, res) => controllers.createTopUp(req, res));
publicRoutes.post('/auth/web/wallet/withdraw', verifyWebSession, (req, res) => controllers.requestWithdrawal(req, res));
publicRoutes.get('/auth/web/delivery-services', (req, res) => controllers.deliveryServices.listCustomerDeliveryServices(req, res));
publicRoutes.get('/auth/web/dashboard/stats', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerDashboardStats(req, res));
publicRoutes.get('/auth/web/reports/umkm', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerUmkmReport(req, res));
publicRoutes.post('/auth/web/promos/validate', verifyWebSession, promoReadRateLimiter, (req, res) => controllers.validateCustomerPromo(req, res));
publicRoutes.get('/auth/web/feature-flags', verifyWebSession, (req, res) => controllers.featureFlagsPublic.getWebFeatureFlags(req, res));
publicRoutes.get('/api/v1/mobile/feature-flags', requireMobileOrWebAuth, (req, res) => controllers.featureFlagsPublic.getMobileFeatureFlags(req, res));
publicRoutes.get('/api/v1/mobile/orders/:id/conversation', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderChats(req, res));
publicRoutes.patch('/api/v1/mobile/orders/:id/conversation/read', requireMobileOrWebAuth, communicationReadRateLimiter, (req, res) => controllers.customerOrder.markOrderChatRead(req, res));
publicRoutes.post('/api/v1/mobile/orders/:id/calls', requireMobileOrWebAuth, communicationCallRateLimiter, (req, res) => controllers.customerOrder.createOrderCall(req, res));
publicRoutes.post('/api/v1/mobile/orders/:id/calls/:callId/join', requireMobileOrWebAuth, communicationCallRateLimiter, (req, res) => controllers.customerOrder.joinOrderCall(req, res));
publicRoutes.post('/api/v1/mobile/orders/:id/calls/:callId/end', requireMobileOrWebAuth, communicationCallRateLimiter, (req, res) => controllers.customerOrder.endOrderCall(req, res));
publicRoutes.get('/api/v1/customer/profile', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerProfile(req, res));
publicRoutes.put('/api/v1/customer/profile', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.updateMobileCustomerProfile(req, res));
publicRoutes.post('/api/v1/customer/profile/photo', requireMobileOrWebAuth, ...secureUploadSingle('photo', 'profileImage'), (req, res) => controllers.customerOrder.uploadMobileCustomerProfilePhoto(req, res));
publicRoutes.get('/api/v1/customer/dashboard/stats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getCustomerDashboardStats(req, res));
publicRoutes.get('/api/v1/customer/incoming-packages', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerIncomingPackages(req, res));
publicRoutes.get('/api/v1/customer/delivery-services', requireMobileOrWebAuth, (req, res) => controllers.deliveryServices.listCustomerDeliveryServices(req, res));
publicRoutes.get('/api/v1/customer/addresses', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.listCustomerAddresses(req, res));
publicRoutes.post('/api/v1/customer/addresses', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.createCustomerAddress(req, res));
publicRoutes.patch('/api/v1/customer/addresses/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.updateCustomerAddress(req, res));
publicRoutes.delete('/api/v1/customer/addresses/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.deleteCustomerAddress(req, res));
publicRoutes.post('/api/v1/customer/location-requests', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.createReceiverLocationRequest(req, res));
publicRoutes.get('/api/v1/customer/location-requests/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getReceiverLocationRequestForCustomer(req, res));
publicRoutes.delete('/api/v1/customer/location-requests/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.revokeReceiverLocationRequest(req, res));
publicRoutes.get('/api/v1/customer/referral', requireMobileOrWebAuth, (req, res) => controllers.referral.getReferralInfo(req, res));
publicRoutes.post('/api/v1/customer/referral/apply', requireMobileOrWebAuth, (req, res) => controllers.referral.applyReferralCode(req, res));
publicRoutes.get('/api/v1/customer/banners', requireMobileOrWebAuth, (req, res) => controllers.listCustomerBanners(req, res));
publicRoutes.get('/api/v1/customer/loyalty', requireMobileOrWebAuth, (req, res) => controllers.loyalty.getLoyaltyInfo(req, res));
publicRoutes.get('/api/v1/customer/promos/eligible', requireMobileOrWebAuth, promoReadRateLimiter, (req, res) => controllers.listCustomerEligiblePromos(req, res));
publicRoutes.post('/api/v1/customer/promos/validate', requireMobileOrWebAuth, promoReadRateLimiter, (req, res) => controllers.validateCustomerPromo(req, res));
publicRoutes.post('/api/v1/customer/promos/reserve', requireMobileOrWebAuth, promoMutationRateLimiter, requireIdempotencyKey('customer.promo.reserve'), (req, res) => controllers.reserveCustomerPromo(req, res));
publicRoutes.post('/api/v1/customer/promos/redeem', requireMobileOrWebAuth, promoMutationRateLimiter, requireIdempotencyKey('customer.promo.redeem'), (req, res) => controllers.redeemCustomerPromo(req, res));
publicRoutes.post('/api/v1/customer/promos/release', requireMobileOrWebAuth, promoMutationRateLimiter, requireIdempotencyKey('customer.promo.release'), (req, res) => controllers.releaseCustomerPromoReservation(req, res));
publicRoutes.get('/api/v1/payment-links', requireMobileOrWebAuth, (req, res) => controllers.paymentLink.listLinks(req, res));
publicRoutes.post('/api/v1/payment-links', requireMobileOrWebAuth, requireIdempotencyKey('payment_link.create'), (req, res) => controllers.paymentLink.createLink(req, res));
// Gateway already routes /api/v1/payment-links to admin-service. Keep this
// tariff alias ahead of /:id so existing gateway policy can serve authoritative
// aggregator quotes without widening a high-blast proxy rule.
publicRoutes.get('/api/v1/payment-links/tariff', requireMobileOrWebAuth, (req, res) => controllers.paymentLink.checkTariff(req, res));
publicRoutes.get('/api/v1/payment-links/:id', requireMobileOrWebAuth, (req, res) => controllers.paymentLink.getLink(req, res));
publicRoutes.post('/api/v1/payment-links/:id/checkout', requireMobileOrWebAuth, requireIdempotencyKey('payment_link.checkout'), (req, res) => controllers.paymentLink.checkoutLink(req, res));
publicRoutes.get('/api/v1/products', requireMobileOrWebAuth, (req, res) => controllers.productCatalog.listProducts(req, res));
publicRoutes.post('/api/v1/products', requireMobileOrWebAuth, (req, res) => controllers.productCatalog.createProduct(req, res));
publicRoutes.get('/api/v1/products/:id', requireMobileOrWebAuth, (req, res) => controllers.productCatalog.getProduct(req, res));
publicRoutes.put('/api/v1/products/:id', requireMobileOrWebAuth, (req, res) => controllers.productCatalog.updateProduct(req, res));
publicRoutes.delete('/api/v1/products/:id', requireMobileOrWebAuth, (req, res) => controllers.productCatalog.deleteProduct(req, res));
publicRoutes.post('/api/v1/products/bulk', requireMobileOrWebAuth, ...secureUploadSingle('file', 'bulkCsv'), (req, res) => controllers.productCatalog.bulkUpload(req, res));
publicRoutes.get('/api/v1/logistics/check-tariff', requireMobileOrWebAuth, (req, res) => controllers.paymentLink.checkTariff(req, res));
publicRoutes.get('/api/v1/logistics/locations', requireMobileOrWebAuth, (req, res) => controllers.logisticsLocations.listCustomerLogisticsLocations(req, res));
publicRoutes.get('/api/v1/logistics/providers', requireMobileOrWebAuth, (req, res) => controllers.listCustomerLogisticsProviders(req, res));
publicRoutes.get('/api/v1/public/jobs', (req, res) => controllers.hr.getPublicJobs(req, res));
publicRoutes.post('/api/v1/public/jobs/:id/apply', publicEndpointRateLimiter, (req, res) => controllers.hr.applyForJob(req, res));
publicRoutes.get('/api/v1/public/news', (req, res) => controllers.news.getPublicNews(req, res));
publicRoutes.get('/api/v1/public/news/:slug', (req, res) => controllers.news.getPublicNewsBySlug(req, res));
publicRoutes.get('/health', (req, res) => controllers.getSystemHealth(req, res));
publicRoutes.get('/api/v1/system/latest-version', (req, res) => controllers.getLatestVersion(req, res));
publicRoutes.get('/api/v1/system/on-demand-readiness', (req, res) => controllers.getOnDemandReadiness(req, res));
publicRoutes.get('/api/v1/config/runtime', (req, res) => controllers.getPublicRuntimeConfigs(req, res));
publicRoutes.get('/api/v1/maps/config', (req, res) => controllers.getPublicMapsProviderRuntimeConfig(req, res));
publicRoutes.get('/api/v1/maps/tiles/:z/:x/:y.png', (req, res) => controllers.getPublicOpenStreetMapTile(req, res));
publicRoutes.get('/api/v1/maps/route', (req, res) => controllers.getPublicMapsRoutePreview(req, res));
publicRoutes.get('/api/v1/maps/geocode', (req, res) => controllers.getPublicMapsGeocode(req, res));
publicRoutes.get('/api/v1/maps/reverse-geocode', (req, res) => controllers.getPublicMapsReverseGeocode(req, res));
publicRoutes.get('/track/:token', (req, res) => controllers.getPublicTripShare(req, res));
publicRoutes.get('/api/v1/public/location-requests/:token', (req, res) => controllers.customerOrder.getReceiverLocationRequestPublic(req, res));
