package com.tembus.merchant.data.repository

import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.api.MerchantErrorMessages
import com.tembus.merchant.data.cache.MerchantOfflineCache
import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.model.*
import com.tembus.merchant.data.session.AuthSessionManager
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject
import java.util.UUID

/**
 * MerchantRepository — semua endpoint merchant-service (profile, menu, orders, struk).
 * Error handling: parse body JSON {error: message} dari merchant-service.
 */
class MerchantRepository(
    private val api: TEMBUSApiService,
    private val offlineCache: MerchantOfflineCache? = null,
    private val sessionManager: AuthSessionManager,
    private val deviceIdentityProvider: DeviceIdentityProvider
) {

    private val accessBootstrapMutex = Mutex()
    @Volatile private var bootstrappedUserId: String? = null

    suspend fun getProfile(): Result<Merchant> {
        return try {
            val context = ensureMerchantAccessContext()
            Result.success(context.merchant ?: throw Exception("Merchant belum terdaftar"))
        } catch (error: Exception) {
            Result.failure(Exception(MerchantErrorMessages.from(error, "Profil merchant belum berhasil dimuat. Coba lagi."), error))
        }
    }

    // MERCH-2026-008: server-owned enforcement/appeal lifecycle.
    suspend fun getEnforcementStatus(): Result<MerchantEnforcementStatus> =
        request { api.getEnforcementStatus() }

    suspend fun submitEnforcementAppeal(actionId: String, reason: String): Result<MerchantEnforcementAppeal> =
        request { api.submitEnforcementAppeal(MerchantEnforcementAppealRequest(actionId, reason)) }

    // FB-109: update minimal order value.
    suspend fun updateProfile(req: UpdateProfileRequest): Result<Merchant> =
        request { api.updateProfile(req) }

    suspend fun getOperatingHours(): Result<MerchantOperatingHoursResponse> =
        request { api.getOperatingHours() }

    suspend fun replaceOperatingHours(hours: List<MerchantOperatingHour>): Result<MerchantOperatingHoursResponse> =
        request { api.replaceOperatingHours(ReplaceOperatingHoursRequest(hours)) }

    suspend fun createSpecialClosure(date: String, label: String): Result<MerchantSpecialClosure> =
        request { api.createSpecialClosure(CreateSpecialClosureRequest(date, label)) }

    suspend fun deleteSpecialClosure(id: String): Result<Boolean> =
        request { api.deleteSpecialClosure(id) }.map { it.success }

    suspend fun registerMerchant(req: RegisterMerchantRequest): Result<Merchant> =
        request(requireMerchantContext = false) { api.registerMerchant(request = req) }

    /**
     * Records both legal consents from the active server policy. The version is
     * deliberately resolved at submit time so a policy rotation cannot be
     * silently accepted against a stale hard-coded contract.
     */
    suspend fun recordIndividualMerchantLegalConsents(
        consentAttemptId: String = UUID.randomUUID().toString()
    ): Result<Unit> {
        val policy = request(requireMerchantContext = false) { api.getCompliancePolicy("id-jk") }
            .getOrElse { return Result.failure(it) }
        val requirements = policy.data?.requirements.orEmpty()
        val required = listOf("merchant_terms", "merchant_privacy_notice")
        val selected = required.map { code ->
            requirements.firstOrNull { it.roleCode == "merchant" && it.requirementCode == code }
                ?: return Result.failure(IllegalStateException("Persyaratan legal merchant belum tersedia"))
        }

        selected.forEach { requirement ->
            val documentType = requirement.documentType
                ?: return Result.failure(IllegalStateException("Dokumen legal merchant belum tersedia"))
            val documentVersion = requirement.documentVersion
                ?: return Result.failure(IllegalStateException("Versi dokumen legal merchant belum tersedia"))
            val consent = request(requireMerchantContext = false) {
                api.recordComplianceConsent(
                    idempotencyKey = "merchant-registration-$consentAttemptId-${requirement.requirementCode}",
                    request = ComplianceConsentRequest(
                        marketCode = "id-jk",
                        requirementCode = requirement.requirementCode,
                        documentType = documentType,
                        documentVersion = documentVersion,
                        locale = requirement.locale,
                        purpose = requirement.purpose,
                        consent = true,
                        metadata = mapOf(
                            "source" to "merchant_android_registration",
                            "business_type" to "perorangan"
                        )
                    )
                )
            }.getOrElse { return Result.failure(it) }
            if (consent.data == null) {
                return Result.failure(IllegalStateException("Persetujuan legal merchant tidak tercatat"))
            }
        }
        return Result.success(Unit)
    }

    suspend fun toggleOpen(isOpen: Boolean): Result<Merchant> =
        request { api.toggleOpen(ToggleOpenRequest(isOpen)) }

    suspend fun setAutoAcceptOrders(enabled: Boolean): Result<Merchant> =
        request { api.setAutoAcceptOrders(AutoAcceptOrdersRequest(enabled)) }

    // FB-107: pause sementara + resume.
    suspend fun pause(durationMinutes: Int): Result<Merchant> =
        request { api.pause(PauseRequest(durationMinutes)) }

    suspend fun resume(): Result<Merchant> =
        request { api.resume() }

    // FOOD-2026-011: tetap menerima order dengan prep tambahan sementara.
    suspend fun busy(until: String, extraPrepMinutes: Int): Result<Merchant> =
        request { api.busy(BusyRequest(until, extraPrepMinutes)) }

    suspend fun updateFoodDocs(req: UpdateFoodDocsRequest): Result<Merchant> =
        request { api.updateFoodDocs(req) }

    suspend fun listMenu(page: Int = 1, pageSize: Int = 50): Result<List<MenuItem>> =
        request { api.listMenu(page, pageSize) }.map { it.items }

    suspend fun listMenuCategories(): Result<List<MenuCategory>> =
        request { api.listMenuCategories() }

    suspend fun createMenuItem(req: MenuItemRequest): Result<MenuItem> =
        request { api.createMenuItem(req) }

    // FB-110: upload foto menu dari galeri → URL publik (buat diisi ke field foto).
    suspend fun uploadMenuPhoto(file: java.io.File): Result<String> =
        request {
            val body = file.asRequestBody("image/jpeg".toMediaType())
            api.uploadMenuPhoto(
                MultipartBody.Part.createFormData("file", file.name, body)
            )
        }.map { it.url ?: throw Exception("Upload gagal: response tanpa URL") }

    // FB-045: upload dokumen registrasi generic (KTP/foto toko/rekening) → URL publik.
    suspend fun uploadPhoto(file: java.io.File): Result<String> =
        request(requireMerchantContext = false) {
            val body = file.asRequestBody("image/jpeg".toMediaType())
            api.uploadDoc(
                MultipartBody.Part.createFormData("file", file.name, body)
            )
        }.map { it.url ?: throw Exception("Upload gagal: response tanpa URL") }

    suspend fun updateMenuItem(id: String, req: MenuItemRequest): Result<MenuItem> =
        request { api.updateMenuItem(id, req) }

    suspend fun deleteMenuItem(id: String): Result<Boolean> =
        request { api.deleteMenuItem(id) }.map { it.success }

    suspend fun setMenuItemAvailability(id: String, available: Boolean): Result<MenuItem> =
        request { api.setMenuItemAvailability(id, AvailabilityRequest(available)) }

    suspend fun updateMenuInventory(id: String, request: MenuInventoryRequest): Result<MenuItem> =
        request { api.updateMenuInventory(id, request) }

    // ── FB-108: varian menu ────────────────────────────────────────────
    suspend fun getMenuItemVariants(id: String): Result<List<MenuItemVariant>> =
        request { api.getMenuItemVariants(id) }

    suspend fun replaceMenuItemVariants(id: String, req: ReplaceVariantsRequest): Result<List<MenuItemVariant>> =
        request { api.replaceMenuItemVariants(id, req) }

    suspend fun listOrders(status: String? = null, page: Int = 1, pageSize: Int = 20): Result<List<MerchantOrder>> {
        return request { api.listOrders(status, page, pageSize) }
            .map { it.orders }
            .onSuccess { orders ->
                if (status == null && page == 1) offlineCache?.saveOrders(orders)
            }
            .recoverCatching { error ->
                val cached = offlineCache?.readOrders().orEmpty()
                if (cached.isEmpty() && offlineCache == null) throw error
                if (cached.isEmpty()) throw error
                cached.filter { status == null || it.status == status }
            }
    }

    suspend fun getOrderCounts(): Result<OrderCounts> =
        request { api.getOrderCounts() }

    suspend fun getPOSIntegrationStatus(): Result<MerchantPOSIntegrationStatus> =
        request { api.getPOSIntegrationStatus() }

    suspend fun acceptOrder(orderId: String): Result<Boolean> =
        request { api.acceptOrder(orderId) }.map { it.success }

    // FB-125: tandai pesanan siap (masak selesai) → mulai cari kurir.
    suspend fun markReady(orderId: String): Result<Boolean> =
        request { api.markReady(orderId) }.map { it.success }

    suspend fun rejectOrder(orderId: String, reason: String, rejectReason: String = "lainnya"): Result<Boolean> =
        request { api.rejectOrder(orderId, RejectOrderRequest(reason, rejectReason)) }.map { it.success }

    // ── FB-087: Edit order items ──
    suspend fun getOrderEdit(orderId: String): Result<OrderEditData> =
        request { api.getOrderEdit(orderId) }

    suspend fun editOrderItems(orderId: String, items: List<EditOrderItemRequest>): Result<EditOrderResult> =
        request { api.editOrderItems(orderId, EditOrderItemsRequest(items)) }

    suspend fun partialRejectOrder(orderId: String, items: List<PartialRejectItemRequest>, reason: String? = null): Result<PartialRejectResult> =
        request { api.partialRejectOrder(orderId, PartialRejectOrderRequest(items, reason)) }

    // FB-114: update rekening bank.
    suspend fun updateBankAccount(req: UpdateBankAccountRequest): Result<Merchant> =
        request { api.updateBankAccount(req) }

    suspend fun getStruk(orderId: String): Result<StrukData> =
        request { api.getStruk(orderId) }

    // ── Laporan penjualan (FB-086) ──
    suspend fun getSalesReport(period: String = "daily"): Result<SalesReportSummary> =
        request { api.getSalesReport(period) }

    suspend fun getCustomerReviews(page: Int = 1, pageSize: Int = 20): Result<MerchantReviewsResponse> =
        request { api.getCustomerReviews(page, pageSize) }

    suspend fun replyToCustomerReview(reviewId: String, body: String): Result<MerchantReviewReply> =
        request { api.replyToCustomerReview(reviewId, MerchantReviewReplyRequest(body)) }

    // ── Settlement / payout (FB-113) ──
    suspend fun getSettlements(): Result<SettlementSummary> =
        request { api.getSettlements() }

    suspend fun getFinanceStatement(limit: Int = 100): Result<MerchantFinanceStatement> =
        request { api.getFinanceStatement(limit) }

    // M7: ajukan pencairan saldo.
    suspend fun requestWithdrawal(req: MerchantWithdrawalRequest): Result<Long> =
        request { api.requestWithdrawal(req) }.map { (it["available_idr"] as? Number)?.toLong() ?: 0L }

    // M7: riwayat permintaan pencairan.
    suspend fun getWithdrawals(): Result<List<MerchantWithdrawalRecord>> =
        request { api.getWithdrawals() }

    suspend fun getNotifications(limit: Int = 50, offset: Int = 0): Result<List<MerchantNotification>> =
        request { api.getNotifications(limit, offset) }.map { it.data }

    suspend fun markNotificationRead(id: String): Result<Boolean> =
        request { api.markNotificationRead(MarkNotificationReadRequest(id)) }.map { it.success }

    suspend fun getNotificationPreferences(): Result<MerchantNotificationPreferences> =
        request { api.getNotificationPreferences() }.map { it.data }

    suspend fun updateNotificationPreferences(prefs: MerchantNotificationPreferences): Result<MerchantNotificationPreferences> =
        request {
            api.updateNotificationPreferences(
                UpdateNotificationPreferencesRequest(
                    newOrderAlerts = prefs.newOrderAlerts,
                    orderCancellations = prefs.orderCancellations,
                    dailySummaryReports = prefs.dailySummaryReports,
                    promotionalUpdates = prefs.promotionalUpdates
                )
            )
        }.map { it.data }

    // ── Promo merchant (FB-099/100) ──
    suspend fun listPromos(page: Int = 1, pageSize: Int = 50): Result<List<MerchantPromo>> =
        request { api.listPromos(page, pageSize) }.map { it.items }

    suspend fun createPromo(req: MerchantPromoRequest): Result<MerchantPromo> =
        request { api.createPromo(req) }

    suspend fun updatePromo(id: String, req: MerchantPromoRequest): Result<MerchantPromo> =
        request { api.updatePromo(id, req) }

    suspend fun deletePromo(id: String): Result<Boolean> =
        request { api.deletePromo(id) }.map { it.success }

    suspend fun setPromoActive(id: String, active: Boolean): Result<Boolean> =
        request { api.setPromoActive(id, PromoActiveRequest(active)) }.map { it.success }

    // ── MERCH-2026-007: Iklan merchant ──
    suspend fun listMerchantAds(page: Int = 1, pageSize: Int = 50): Result<List<MerchantAd>> =
        request { api.listMerchantAds(page, pageSize) }.map { it.items }

    suspend fun createMerchantAd(idempotencyKey: String, adRequest: MerchantAdRequest): Result<MerchantAd> =
        request { api.createMerchantAd(idempotencyKey, adRequest) }

    suspend fun setMerchantAdActive(id: String, active: Boolean): Result<Boolean> =
        request { api.setMerchantAdActive(id, PromoActiveRequest(active)) }.map { it.success }

    suspend fun transitionMerchantAd(id: String, to: String, reason: String = ""): Result<MerchantAd> =
        request { api.transitionMerchantAd(id, AdsLifecycleRequest(to, reason)) }

    suspend fun cloneMerchantAd(id: String): Result<MerchantAd> =
        request { api.cloneMerchantAd(id, "ads-clone-${java.util.UUID.randomUUID()}") }

    suspend fun getMerchantMarketingPerformance(period: String): Result<MerchantMarketingPerformance> =
        request { api.getMerchantMarketingPerformance(period) }

    // ── M1: Staff Management (CORPORATE ONLY) ──
    suspend fun inviteStaff(merchantId: String, req: InviteStaffRequest): Result<InviteStaffResponse> =
        request { api.inviteStaff(merchantId, req) }

    suspend fun listStaff(merchantId: String): Result<StaffListResponse> =
        request { api.listStaff(merchantId) }

    suspend fun acceptStaffInvite(token: String): Result<Boolean> =
        request { api.acceptStaffInvite(AcceptStaffInviteRequest(token)) }.map { it.success }

    suspend fun updateStaff(merchantId: String, staffId: String, req: UpdateStaffRequest): Result<List<MerchantStaff>> =
        request { api.updateStaff(merchantId, staffId, req) }.map { it.data }

    private suspend fun ensureMerchantAccessContext(): MerchantPortalContext =
        accessBootstrapMutex.withLock {
            val userId = sessionManager.getUserIdSync()
                ?: throw Exception("Sesi merchant tidak ditemukan")
            if (bootstrappedUserId == userId) {
                val cached = sessionManager.getMerchantBranchIdSync()
                if (cached != null || sessionManager.getMerchantAccessSessionSync() != null) {
                    return@withLock fetchPortalContext()
                }
            }

            var context = fetchPortalContext(clearScopeOnFailure = true)
            val merchant = context.merchant ?: throw Exception("Akun belum terdaftar sebagai mitra")
            if (context.deviceSessionRequired) {
                val branchId = context.currentBranchId
                    ?: context.branches.firstOrNull { it.isActive }?.id
                    ?: throw Exception("Akun staff belum memiliki outlet aktif")
                val deviceId = deviceIdentityProvider.deviceId()
                val existing = sessionManager.getMerchantAccessSessionSync()
                if (existing == null || existing.branchId != branchId || existing.deviceId != deviceId) {
                    sessionManager.clearMerchantAccessSession()
                    val response = api.createDeviceSession(
                        merchant.id,
                        CreateMerchantDeviceSessionRequest(
                            branchId = branchId,
                            deviceId = deviceId,
                            deviceLabel = "TEMBUS Merchant Android"
                        )
                    )
                    if (!response.isSuccessful) {
                        throw Exception(parseErrorMessage(response.errorBody()?.string(), "Sesi outlet belum dapat dibuat"))
                    }
                    val session = response.body()?.data
                    val token = session?.sessionToken?.takeIf { it.isNotBlank() }
                        ?: throw Exception("Sesi outlet belum dapat dibuat")
                    sessionManager.saveMerchantAccessSession(
                        sessionToken = token,
                        branchId = session.branchId.ifBlank { branchId },
                        deviceId = session.deviceId.ifBlank { deviceId }
                    )
                }
                context = fetchPortalContext()
            } else {
                sessionManager.clearMerchantAccessSession()
            }
            sessionManager.saveMerchantBranchId(context.currentBranchId)
            bootstrappedUserId = userId
            context
        }

    private suspend fun fetchPortalContext(clearScopeOnFailure: Boolean = false): MerchantPortalContext {
        var response = api.getPortalContext()
        if (!response.isSuccessful && clearScopeOnFailure) {
            sessionManager.clearMerchantAccessSession()
            sessionManager.saveMerchantBranchId(null)
            response = api.getPortalContext()
        }
        if (!response.isSuccessful) {
            throw Exception(parseErrorMessage(response.errorBody()?.string(), "Konteks merchant belum berhasil dimuat"))
        }
        return response.body()?.data?.takeIf { it.merchant != null }
            ?: throw Exception("Konteks merchant belum lengkap")
    }

    private suspend fun <T> request(
        requireMerchantContext: Boolean = true,
        block: suspend () -> retrofit2.Response<T>
    ): Result<T> {
        return try {
            if (requireMerchantContext) ensureMerchantAccessContext()
            val resp = block()
            if (!resp.isSuccessful) {
                val body = resp.errorBody()?.string()
                throw Exception(parseErrorMessage(body, "Terjadi kesalahan (${resp.code()})"))
            }
            Result.success(resp.body() ?: throw Exception("Response kosong"))
        } catch (error: Exception) {
            Result.failure(Exception(MerchantErrorMessages.from(error, "Permintaan belum berhasil. Coba lagi."), error))
        }
    }

    private fun parseErrorMessage(body: String?, fallback: String): String {
        if (body.isNullOrBlank()) return fallback
        return try {
            val json = JSONObject(body)
            MerchantErrorMessages.from(
                Exception(json.optString("error").takeIf { it.isNotBlank() } ?: json.optString("message")),
                fallback
            )
        } catch (e: Exception) {
            fallback
        }
    }
}
