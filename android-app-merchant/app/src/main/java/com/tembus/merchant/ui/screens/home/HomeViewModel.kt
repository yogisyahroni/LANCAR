package com.tembus.merchant.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.data.model.UpdateProfileRequest
import com.tembus.merchant.data.notifications.OrderAlertNotifier
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.async

enum class OrderFilter(val label: String, val status: String?) {
    ALL("Semua", null),
    NEW("Baru", "pending_merchant"),
    ACTIVE("Aktif", null), // prepared special: preparing|searching|accepted|picking_up|picked_up|delivering
    DONE("Selesai", "delivered"),
    // Backend menyimpan reject merchant sebagai cancelled + reject_reason.
    REJECTED("Ditolak", "cancelled")
}

data class HomeUiState(
    val merchant: Merchant? = null,
    val report: com.tembus.merchant.data.model.SalesReportSummary? = null,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val orders: List<MerchantOrder> = emptyList(),
    val selectedFilter: OrderFilter = OrderFilter.NEW,
    val isToggleOpenLoading: Boolean = false,
    // FB-107: pause sementara — loading + sisa menit countdown (0 = tidak pause)
    val isPauseLoading: Boolean = false,
    val pauseRemainingMinutes: Long = 0L,
    val actionOrderId: String? = null,
    val actionError: String? = null,
    val needsRegistration: Boolean = false
)

class HomeViewModel(
    private val merchantRepository: MerchantRepository,
    private val alertNotifier: OrderAlertNotifier? = null
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            val reportDeferred = async {
                merchantRepository.getSalesReport("daily").getOrNull()
            }
            merchantRepository.getProfile()
                .onSuccess { profile ->
                    val report = reportDeferred.await()
                    _uiState.value = _uiState.value.copy(
                        merchant = profile,
                        report = report,
                        needsRegistration = false,
                        isLoading = false
                    )
                    loadOrders()
                }
                .onFailure { e ->
                    if (e.message?.contains("belum terdaftar") == true || e.message?.contains("404") == true) {
                        _uiState.value = _uiState.value.copy(
                            needsRegistration = true,
                            isLoading = false
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            errorMessage = e.message ?: "Gagal memuat profil",
                            isLoading = false
                        )
                    }
                }
        }
    }

    fun selectFilter(filter: OrderFilter) {
        _uiState.value = _uiState.value.copy(selectedFilter = filter)
        loadOrders(filter)
    }

    private fun loadOrders(filter: OrderFilter = _uiState.value.selectedFilter) {
        val status = when (filter) {
            OrderFilter.NEW -> "pending_merchant"
            OrderFilter.ALL -> null
            OrderFilter.DONE -> "delivered"
            // Filter status dilakukan server-side, lalu dibatasi lagi ke order
            // yang punya reject_reason agar pembatalan customer tidak ikut.
            OrderFilter.REJECTED -> "cancelled"
            OrderFilter.ACTIVE -> null // filter manual di sisi client untuk status aktif
        }
        viewModelScope.launch {
            merchantRepository.listOrders(status = status, pageSize = 50)
                .onSuccess { orders ->
                    var loaded = orders
                    // AUDIT-FIX #2: di tab "Baru", sertakan order terjadwal
                    // (status scheduled) supaya section "Pesanan Terjadwal Hari
                    // Ini" tampil — sebelumnya state.orders cuma berisi
                    // pending_merchant → section selalu kosong di tab default.
                    if (filter == OrderFilter.NEW) {
                        val scheduled = merchantRepository.listOrders(status = "scheduled", pageSize = 50)
                            .getOrElse { emptyList() }
                        loaded = orders + scheduled
                    }
                    val filtered = when (filter) {
                        OrderFilter.ACTIVE -> loaded.filter { it.status in activeStatuses }
                        OrderFilter.REJECTED -> loaded.filter { it.isMerchantRejected() }
                        else -> loaded
                    }
                    _uiState.value = _uiState.value.copy(orders = filtered, isLoading = false)

                    // FB-106: alert suara/getar untuk order baru (pending_merchant)
                    // yang belum pernah terlihat. Baseline seen diperbarui dengan
                    // SEMUA order yang baru saja dimuat (order lama tidak boleh
                    // re-alert setiap refresh).
                    alertNotifier?.let { notifier ->
                        val merchantName = _uiState.value.merchant?.namaToko
                        val pendingIds = orders.filter { it.status == "pending_merchant" }
                            .mapNotNull { it.id }.toSet()
                        val alerted = notifier.alertNewOrders(pendingIds, merchantName)
                        if (alerted.isNotEmpty()) {
                            notifier.markOrdersSeen(pendingIds)
                        }
                    }
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        errorMessage = e.message ?: "Gagal memuat order",
                        isLoading = false
                    )
                }
        }
    }

    fun toggleOpen() {
        val current = _uiState.value.merchant?.isOpen ?: return
        _uiState.value = _uiState.value.copy(isToggleOpenLoading = true)
        viewModelScope.launch {
            merchantRepository.toggleOpen(!current)
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isToggleOpenLoading = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isToggleOpenLoading = false,
                        actionError = e.message ?: "Gagal ubah status toko"
                    )
                }
        }
    }

    // M5: update jam operasional (buka/tutup)
    fun updateOperatingHours(jamBuka: String, jamTutup: String) {
        _uiState.value = _uiState.value.copy(isToggleOpenLoading = true, actionError = null)
        viewModelScope.launch {
            merchantRepository.updateProfile(UpdateProfileRequest(jamBuka = jamBuka, jamTutup = jamTutup))
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(merchant = updated, isToggleOpenLoading = false)
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isToggleOpenLoading = false,
                        actionError = e.message ?: "Gagal menyimpan jam operasional"
                    )
                }
        }
    }

    // FB-107: pause sementara (menit 1-180). Tidak mengubah is_open.
    fun pause(durationMinutes: Int) {
        _uiState.value = _uiState.value.copy(isPauseLoading = true, actionError = null)
        viewModelScope.launch {
            merchantRepository.pause(durationMinutes)
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isPauseLoading = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isPauseLoading = false,
                        actionError = e.message ?: "Gagal pause toko"
                    )
                }
        }
    }

    // FB-107: batalkan pause lebih awal.
    fun resume() {
        _uiState.value = _uiState.value.copy(isPauseLoading = true, actionError = null)
        viewModelScope.launch {
            merchantRepository.resume()
                .onSuccess { updated ->
                    _uiState.value = _uiState.value.copy(
                        merchant = updated,
                        isPauseLoading = false
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isPauseLoading = false,
                        actionError = e.message ?: "Gagal resume toko"
                    )
                }
        }
    }

    fun acceptOrder(orderId: String) {
        _uiState.value = _uiState.value.copy(actionOrderId = orderId, actionError = null)
        viewModelScope.launch {
            merchantRepository.acceptOrder(orderId)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(actionOrderId = null)
                    loadOrders()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionOrderId = null,
                        actionError = e.message ?: "Gagal terima order"
                    )
                }
        }
    }

    // FB-125: tandai pesanan siap (masak selesai) → mulai cari kurir.
    fun markReady(orderId: String) {
        _uiState.value = _uiState.value.copy(actionOrderId = orderId, actionError = null)
        viewModelScope.launch {
            merchantRepository.markReady(orderId)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(actionOrderId = null)
                    loadOrders()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionOrderId = null,
                        actionError = e.message ?: "Gagal tandai pesanan siap"
                    )
                }
        }
    }

    fun rejectOrder(orderId: String, reason: String, rejectReason: String) {
        _uiState.value = _uiState.value.copy(actionOrderId = orderId, actionError = null)
        viewModelScope.launch {
            merchantRepository.rejectOrder(orderId, reason, rejectReason)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(actionOrderId = null)
                    loadOrders()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionOrderId = null,
                        actionError = e.message ?: "Gagal tolak order"
                    )
                }
        }
    }

    fun partialRejectOrder(orderId: String, items: List<com.tembus.merchant.data.model.PartialRejectItemRequest>, reason: String) {
        _uiState.value = _uiState.value.copy(actionOrderId = orderId, actionError = null)
        viewModelScope.launch {
            merchantRepository.partialRejectOrder(orderId, items, reason)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(actionOrderId = null)
                    loadOrders()
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        actionOrderId = null,
                        actionError = e.message ?: "Gagal memproses item tidak tersedia"
                    )
                }
        }
    }

    fun clearActionError() {
        _uiState.value = _uiState.value.copy(actionError = null)
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    companion object {
        val activeStatuses = setOf(
            "preparing", "searching", "accepted", "picking_up", "picked_up", "delivering"
        )
    }
}

private fun MerchantOrder.isMerchantRejected(): Boolean =
    status == "cancelled_by_merchant" || !rejectReason.isNullOrBlank()
