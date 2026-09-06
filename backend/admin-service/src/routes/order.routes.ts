import { Router } from 'express';
import * as controllers from '../controllers';
import { requireAuth, requireRole, requireTotp, verifyWebSession, verifySession, requireMobileOrWebAuth } from '../middlewares';
import {
  communicationCallRateLimiter, communicationMessageRateLimiter, communicationReadRateLimiter,
  courierFaceRateLimiter, courierOfferRateLimiter, courierProofRateLimiter,
  promoMutationRateLimiter, promoReadRateLimiter, toggleRateLimiter, publicEndpointRateLimiter,
} from '../rateLimit';
import { requireIdempotencyKey } from '../middleware/idempotencyRequirement';
import { requireAuthoritativeAggregatorQuote } from '../middleware/aggregatorQuoteRequirement';
import { validatePreferredCourierForCreate } from '../middleware/preferredCourierValidation';
import { secureUploadSingle } from '../security/uploadSecurity';

// order routes (extracted from routes.ts)
export const orderRoutes = Router();

// Keep the operational order surface behind the same admin identity and role
// boundary as the rest of the dashboard. This is especially important because
// the order-detail response contains provider raw payloads for operators.
orderRoutes.use('/admin/orders', requireAuth, requireRole(['super_admin', 'ops_security', 'ops_admin', 'finance_admin', 'finance', 'cs_agent', 'zone_manager']));

orderRoutes.post('/api/v1/tracking/sync', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.syncCourierTracking(req, res));
orderRoutes.get('/api/v1/tracking', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderTracking(req, res));
orderRoutes.get('/api/v1/tracking/public', (req, res, next) => controllers.publicTracking.publicTrackingRateLimiter(req, res, next), (req, res) => controllers.publicTracking.getPublicTrackingByResi(req, res));
orderRoutes.post('/api/v1/orders/status', requireMobileOrWebAuth, requireIdempotencyKey('courier.status.update'), (req, res) => controllers.updateMobileCourierOrderStatus(req, res));
orderRoutes.post('/api/v1/orders/scan', requireMobileOrWebAuth, courierProofRateLimiter, requireIdempotencyKey('courier.proof.scan'), (req, res) => controllers.scanMobileCourierOrder(req, res));
orderRoutes.post('/api/v1/orders/pod/upload', requireMobileOrWebAuth, courierProofRateLimiter, requireIdempotencyKey('courier.pod.upload'), ...secureUploadSingle('photo', 'evidenceImage'), (req, res) => controllers.uploadMobileCourierPod(req, res));
orderRoutes.post('/auth/web/orders/calculate', verifyWebSession, (req, res) => controllers.customerOrder.calculatePrice(req, res));
orderRoutes.post('/auth/web/orders', verifyWebSession, requireIdempotencyKey('web.order.create'), requireAuthoritativeAggregatorQuote, validatePreferredCourierForCreate, (req, res) => controllers.customerOrder.createCustomerOrder(req, res));
orderRoutes.get('/auth/web/orders', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrders(req, res));
orderRoutes.post('/auth/web/orders/:id/payment/session', verifyWebSession, requireIdempotencyKey('web.payment.init'), (req, res) => controllers.customerOrder.createCustomerOrderPaymentSession(req, res));
orderRoutes.get('/auth/web/orders/:id/payment/status', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrderPaymentStatus(req, res));
orderRoutes.post('/auth/web/orders/:id/payment/check', verifyWebSession, requireIdempotencyKey('web.payment.confirm'), (req, res) => controllers.customerOrder.confirmCustomerOrderPayment(req, res));
orderRoutes.get('/auth/web/orders/:id', verifyWebSession, (req, res) => controllers.customerOrder.getCustomerOrderById(req, res));
orderRoutes.post('/auth/web/orders/:id/public-tracking-link', verifyWebSession, (req, res) => controllers.customerOrder.createCustomerPublicTrackingLink(req, res));
orderRoutes.post('/auth/web/orders/:id/cancel', verifyWebSession, (req, res) => controllers.customerOrder.cancelCustomerOrder(req, res));
orderRoutes.post('/auth/web/orders/:id/retry-matching', verifyWebSession, (req, res) => controllers.customerOrder.retryCustomerOrderMatching(req, res));
orderRoutes.get('/auth/web/orders/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderChats(req, res));
orderRoutes.post('/auth/web/orders/:id/chats', requireMobileOrWebAuth, communicationMessageRateLimiter, (req, res) => controllers.customerOrder.sendOrderChat(req, res));
orderRoutes.get('/api/v1/mobile/chats/orders/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getOrderChats(req, res));
orderRoutes.post('/api/v1/mobile/chats/orders/:id/chats', requireMobileOrWebAuth, communicationMessageRateLimiter, (req, res) => controllers.customerOrder.sendOrderChat(req, res));
orderRoutes.post('/auth/web/orders/:id/upload', verifyWebSession, ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.customerOrder.uploadOrderFile(req, res));
orderRoutes.get('/auth/web/disputes', verifyWebSession, (req, res) => controllers.getCustomerDisputes(req, res));
orderRoutes.post('/auth/web/disputes', verifyWebSession, (req, res) => controllers.createDispute(req, res));
orderRoutes.get('/auth/web/disputes/:id/chats', verifyWebSession, (req, res) => controllers.getDisputeChats(req, res));
orderRoutes.post('/auth/web/disputes/:id/chats', verifyWebSession, (req, res) => controllers.sendDisputeChat(req, res));
orderRoutes.post('/auth/web/disputes/:id/upload', verifyWebSession, ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.uploadDisputeFile(req, res));
orderRoutes.get('/api/v1/customer/orders', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerOrders(req, res));
orderRoutes.get('/api/v1/customer/orders/:id/tracking-detail', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerOrderTrackingDetail(req, res));
orderRoutes.get('/api/v1/customer/tambal-ban/materials', requireMobileOrWebAuth, (req, res) => controllers.tambalBanMaterials.listTambalBanMaterials(req, res));
orderRoutes.post('/api/v1/customer/orders/calculate', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.calculatePrice(req, res));
orderRoutes.post('/api/v1/customer/orders/calculate-all', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.calculatePrices(req, res));
orderRoutes.post('/api/v1/customer/orders', requireMobileOrWebAuth, requireIdempotencyKey('customer.order.create'), requireAuthoritativeAggregatorQuote, validatePreferredCourierForCreate, (req, res) => controllers.customerOrder.createCustomerOrder(req, res));
orderRoutes.post('/api/v1/customer/orders/:id/payment', requireMobileOrWebAuth, requireIdempotencyKey('customer.payment.init'), (req, res) => controllers.customerOrder.createCustomerOrderPaymentSession(req, res));
orderRoutes.get('/api/v1/customer/orders/:id/payment/status', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getCustomerOrderPaymentStatus(req, res));
orderRoutes.post('/api/v1/customer/orders/:id/payment/check', requireMobileOrWebAuth, requireIdempotencyKey('customer.payment.confirm'), (req, res) => controllers.customerOrder.confirmCustomerOrderPayment(req, res));
orderRoutes.get('/api/v1/customer/orders/:id', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.getMobileCustomerOrder(req, res));
orderRoutes.post('/api/v1/customer/orders/:id/upload', requireMobileOrWebAuth, ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.customerOrder.uploadOrderFile(req, res));
orderRoutes.post('/api/v1/customer/orders/:id/cancel', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.cancelCustomerOrder(req, res));
orderRoutes.post('/api/v1/customer/orders/:id/retry-matching', requireMobileOrWebAuth, (req, res) => controllers.customerOrder.retryCustomerOrderMatching(req, res));
orderRoutes.get('/api/v1/customer/disputes', requireMobileOrWebAuth, (req, res) => controllers.getCustomerDisputes(req, res));
orderRoutes.post('/api/v1/customer/disputes', requireMobileOrWebAuth, (req, res) => controllers.createDispute(req, res));
orderRoutes.get('/api/v1/customer/disputes/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.getDisputeChats(req, res));
orderRoutes.post('/api/v1/customer/disputes/:id/chats', requireMobileOrWebAuth, (req, res) => controllers.sendDisputeChat(req, res));
orderRoutes.post('/api/v1/customer/disputes/:id/upload', requireMobileOrWebAuth, ...secureUploadSingle('file', 'customerAttachment'), (req, res) => controllers.uploadDisputeFile(req, res));
orderRoutes.post('/auth/web/orders/bulk/upload', verifyWebSession, ...secureUploadSingle('file', 'bulkCsv'), (req, res) => controllers.bulkOrder.uploadBulkExcel(req, res));
orderRoutes.get('/auth/web/orders/bulk/status/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.getBulkJobStatus(req, res));
orderRoutes.post('/auth/web/orders/bulk/validate/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.validateBulkRow(req, res));
orderRoutes.put('/auth/web/orders/bulk/row/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.validateBulkRow(req, res));
orderRoutes.delete('/auth/web/orders/bulk/rows/:job_id', verifyWebSession, (req, res) => controllers.bulkOrder.deleteBulkRows(req, res));
orderRoutes.post('/auth/web/orders/bulk/process', verifyWebSession, requireIdempotencyKey('web.bulk.process'), (req, res) => controllers.bulkOrder.processBulkPayment(req, res));
orderRoutes.post('/auth/web/orders/bulk/pay', verifyWebSession, requireIdempotencyKey('web.bulk.process'), (req, res) => controllers.bulkOrder.processBulkPayment(req, res));
orderRoutes.get('/admin/orders', (req, res) => controllers.getAllOrders(req, res));
orderRoutes.get('/admin/orders/stats', (req, res) => controllers.getOrderStats(req, res));
orderRoutes.get('/admin/orders/:id', (req, res) => controllers.getOrderById(req, res));
orderRoutes.post('/admin/orders/:id/reassign', (req, res) => controllers.reassignOrder(req, res));
orderRoutes.post('/admin/orders/:id/flag', (req, res) => controllers.flagOrderIssue(req, res));
orderRoutes.post('/admin/orders/:id/force-cancel', requireRole(['super_admin', 'ops_admin']), requireTotp, (req, res) => controllers.adminOrderActions.forceCancelAdminOrder(req, res));
orderRoutes.post('/admin/orders', (req, res) => controllers.createOrder(req, res));
orderRoutes.get('/admin/orders/export', (req, res) => controllers.exportOrders(req, res));