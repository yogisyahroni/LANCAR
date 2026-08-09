package com.tembus.merchant.data.repository

import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.model.*
import org.json.JSONObject

/**
 * MerchantRepository — semua endpoint merchant-service (profile, menu, orders, struk).
 * Error handling: parse body JSON {error: message} dari merchant-service.
 */
class MerchantRepository(private val api: TEMBUSApiService) {

    suspend fun getProfile(): Result<Merchant> =
        request { api.getProfile() }

    suspend fun registerMerchant(req: RegisterMerchantRequest): Result<Merchant> =
        request { api.registerMerchant(req) }

    suspend fun toggleOpen(isOpen: Boolean): Result<Merchant> =
        request { api.toggleOpen(ToggleOpenRequest(isOpen)) }

    suspend fun updateFoodDocs(req: UpdateFoodDocsRequest): Result<Merchant> =
        request { api.updateFoodDocs(req) }

    suspend fun listMenu(page: Int = 1, pageSize: Int = 50): Result<List<MenuItem>> =
        request { api.listMenu(page, pageSize) }.map { it.items }

    suspend fun createMenuItem(req: MenuItemRequest): Result<MenuItem> =
        request { api.createMenuItem(req) }

    suspend fun updateMenuItem(id: String, req: MenuItemRequest): Result<MenuItem> =
        request { api.updateMenuItem(id, req) }

    suspend fun deleteMenuItem(id: String): Result<Boolean> =
        request { api.deleteMenuItem(id) }.map { it.success }

    suspend fun setMenuItemAvailability(id: String, available: Boolean): Result<MenuItem> =
        request { api.setMenuItemAvailability(id, AvailabilityRequest(available)) }

    suspend fun listOrders(status: String? = null, page: Int = 1, pageSize: Int = 20): Result<List<MerchantOrder>> =
        request { api.listOrders(status, page, pageSize) }.map { it.orders }

    suspend fun acceptOrder(orderId: String): Result<Boolean> =
        request { api.acceptOrder(orderId) }.map { it.success }

    suspend fun rejectOrder(orderId: String, reason: String, rejectReason: String = "lainnya"): Result<Boolean> =
        request { api.rejectOrder(orderId, RejectOrderRequest(reason, rejectReason)) }.map { it.success }

    suspend fun getStruk(orderId: String): Result<StrukData> =
        request { api.getStruk(orderId) }

    // ── Laporan penjualan (FB-086) ──
    suspend fun getSalesReport(period: String = "daily"): Result<SalesReportSummary> =
        request { api.getSalesReport(period) }

    // ── Settlement / payout (FB-113) ──
    suspend fun getSettlements(): Result<SettlementSummary> =
        request { api.getSettlements() }

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
