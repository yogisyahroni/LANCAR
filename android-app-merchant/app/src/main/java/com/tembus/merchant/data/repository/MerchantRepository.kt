package com.tembus.merchant.data.repository

import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.model.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import org.json.JSONObject

/**
 * MerchantRepository — semua endpoint merchant-service (profile, menu, orders, struk).
 * Error handling: parse body JSON {error: message} dari merchant-service.
 */
class MerchantRepository(private val api: TEMBUSApiService) {

    suspend fun getProfile(): Result<Merchant> =
        request { api.getProfile() }

    // FB-109: update minimal order value.
    suspend fun updateProfile(req: UpdateProfileRequest): Result<Merchant> =
        request { api.updateProfile(req) }

    suspend fun registerMerchant(req: RegisterMerchantRequest): Result<Merchant> =
        request { api.registerMerchant(req) }

    suspend fun toggleOpen(isOpen: Boolean): Result<Merchant> =
        request { api.toggleOpen(ToggleOpenRequest(isOpen)) }

    // FB-107: pause sementara + resume.
    suspend fun pause(durationMinutes: Int): Result<Merchant> =
        request { api.pause(PauseRequest(durationMinutes)) }

    suspend fun resume(): Result<Merchant> =
        request { api.resume() }

    suspend fun updateFoodDocs(req: UpdateFoodDocsRequest): Result<Merchant> =
        request { api.updateFoodDocs(req) }

    suspend fun listMenu(page: Int = 1, pageSize: Int = 50): Result<List<MenuItem>> =
        request { api.listMenu(page, pageSize) }.map { it.items }

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
        request {
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

    // ── FB-108: varian menu ────────────────────────────────────────────
    suspend fun getMenuItemVariants(id: String): Result<List<MenuItemVariant>> =
        request { api.getMenuItemVariants(id) }

    suspend fun replaceMenuItemVariants(id: String, req: ReplaceVariantsRequest): Result<List<MenuItemVariant>> =
        request { api.replaceMenuItemVariants(id, req) }

    suspend fun listOrders(status: String? = null, page: Int = 1, pageSize: Int = 20): Result<List<MerchantOrder>> =
        request { api.listOrders(status, page, pageSize) }.map { it.orders }

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

    // FB-114: update rekening bank.
    suspend fun updateBankAccount(req: UpdateBankAccountRequest): Result<Merchant> =
        request { api.updateBankAccount(req) }

    suspend fun getStruk(orderId: String): Result<StrukData> =
        request { api.getStruk(orderId) }

    // ── Laporan penjualan (FB-086) ──
    suspend fun getSalesReport(period: String = "daily"): Result<SalesReportSummary> =
        request { api.getSalesReport(period) }

    // ── Settlement / payout (FB-113) ──
    suspend fun getSettlements(): Result<SettlementSummary> =
        request { api.getSettlements() }

    // M7: ajukan pencairan saldo.
    suspend fun requestWithdrawal(req: MerchantWithdrawalRequest): Result<Long> =
        request { api.requestWithdrawal(req) }.map { (it["available_idr"] as? Number)?.toLong() ?: 0L }

    // M7: riwayat permintaan pencairan.
    suspend fun getWithdrawals(): Result<List<MerchantWithdrawalRecord>> =
        request { api.getWithdrawals() }

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

    // ── M1: Staff Management (CORPORATE ONLY) ──
    suspend fun inviteStaff(merchantId: String, req: InviteStaffRequest): Result<InviteStaffResponse> =
        request { api.inviteStaff(merchantId, req) }

    suspend fun listStaff(merchantId: String): Result<List<MerchantStaff>> =
        request { api.listStaff(merchantId) }.map { it.data }

    suspend fun acceptStaffInvite(token: String): Result<Boolean> =
        request { api.acceptStaffInvite(AcceptStaffInviteRequest(token)) }.map { it.success }

    suspend fun updateStaff(merchantId: String, staffId: String, req: UpdateStaffRequest): Result<List<MerchantStaff>> =
        request { api.updateStaff(merchantId, staffId, req) }.map { it.data }

    private suspend fun <T> request(block: suspend () -> retrofit2.Response<T>): Result<T> {
        return runCatching {
            val resp = block()
            if (!resp.isSuccessful) {
                val body = resp.errorBody()?.string()
                throw Exception(parseErrorMessage(body, "Terjadi kesalahan (${resp.code()})"))
            }
            resp.body() ?: throw Exception("Response kosong")
        }
    }

    private fun parseErrorMessage(body: String?, fallback: String): String {
        if (body.isNullOrBlank()) return fallback
        return try {
            val json = JSONObject(body)
            json.optString("error").takeIf { it.isNotBlank() }
                ?: json.optString("message").takeIf { it.isNotBlank() }
                ?: fallback
        } catch (e: Exception) {
            fallback
        }
    }
}
