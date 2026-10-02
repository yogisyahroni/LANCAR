package com.tembus.merchant.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.MerchantOrder
import com.tembus.merchant.data.model.MerchantReview
import com.tembus.merchant.data.model.MenuItem
import com.tembus.merchant.data.model.SalesReportSummary
import com.tembus.merchant.data.model.SettlementSummary
import com.tembus.merchant.data.model.UpdateProfileRequest
import com.tembus.merchant.data.repository.MerchantRepository
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant

enum class HomeDataSection { PROFILE, REPORT, ORDERS, MENU, SETTLEMENT, REVIEWS }

data class MerchantHomeUiState(
    val merchant: Merchant? = null,
    val report: SalesReportSummary? = null,
    val orders: List<MerchantOrder> = emptyList(),
    val menuItems: List<MenuItem> = emptyList(),
    val settlement: SettlementSummary? = null,
    val reviews: List<MerchantReview> = emptyList(),
    val unreadNotificationCount: Int = 0,
    val isLoading: Boolean = false,
    val actionLoading: Boolean = false,
    val errorMessage: String? = null,
    val sectionErrors: Map<HomeDataSection, String> = emptyMap()
)

/**
 * Data loader for the Figma Merchant Beranda surface.
 *
 * Every value displayed by the screen is hydrated from an existing backend
 * contract. A failed optional section is kept visibly unavailable instead of
 * being replaced with a sample value from the design file.
 */
class MerchantHomeViewModel(
    private val repository: MerchantRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(MerchantHomeUiState())
    val uiState: StateFlow<MerchantHomeUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
        viewModelScope.launch {
            val profile = async { repository.getProfile() }
            val report = async { repository.getSalesReport("daily") }
            val orders = async { repository.listOrders(status = null, pageSize = 50) }
            val menu = async { repository.listMenu(pageSize = 100) }
            val settlement = async { repository.getSettlements() }
            val reviews = async { repository.getCustomerReviews(pageSize = 5) }
            val notifications = async { repository.getNotifications(limit = 50) }

            val profileResult = profile.await()
            val reportResult = report.await()
            val ordersResult = orders.await()
            val menuResult = menu.await()
            val settlementResult = settlement.await()
            val reviewsResult = reviews.await()
            val notificationsResult = notifications.await()

            val errors = buildMap {
                profileResult.exceptionOrNull()?.message?.let { put(HomeDataSection.PROFILE, it) }
                reportResult.exceptionOrNull()?.message?.let { put(HomeDataSection.REPORT, it) }
                ordersResult.exceptionOrNull()?.message?.let { put(HomeDataSection.ORDERS, it) }
                menuResult.exceptionOrNull()?.message?.let { put(HomeDataSection.MENU, it) }
                settlementResult.exceptionOrNull()?.message?.let { put(HomeDataSection.SETTLEMENT, it) }
                reviewsResult.exceptionOrNull()?.message?.let { put(HomeDataSection.REVIEWS, it) }
            }

            _uiState.value = _uiState.value.copy(
                merchant = profileResult.getOrNull(),
                report = reportResult.getOrNull(),
                orders = ordersResult.getOrElse { emptyList() },
                menuItems = menuResult.getOrElse { emptyList() },
                settlement = settlementResult.getOrNull(),
                reviews = reviewsResult.getOrNull()?.reviews.orEmpty(),
                unreadNotificationCount = notificationsResult.getOrNull()?.count { !it.isRead } ?: 0,
                isLoading = false,
                errorMessage = profileResult.exceptionOrNull()?.message,
                sectionErrors = errors
            )
        }
    }

    fun toggleOpen() {
        val merchant = _uiState.value.merchant ?: return
        runAction { repository.toggleOpen(!merchant.isOpen) }
    }

    fun toggleAutoAccept(enabled: Boolean) {
        runAction { repository.setAutoAcceptOrders(enabled) }
    }

    fun pause(durationMinutes: Int) {
        runAction { repository.pause(durationMinutes) }
    }

    fun resume() {
        runAction { repository.resume() }
    }

    fun busy(durationMinutes: Int, extraPrepMinutes: Int) {
        val until = Instant.now().plusSeconds(durationMinutes * 60L).toString()
        runAction { repository.busy(until, extraPrepMinutes) }
    }

    fun updateOperatingHours(open: String, close: String) {
        runAction { repository.updateProfile(UpdateProfileRequest(jamBuka = open, jamTutup = close)) }
    }

    private fun runAction(action: suspend () -> Result<Merchant>) {
        _uiState.value = _uiState.value.copy(actionLoading = true, errorMessage = null)
        viewModelScope.launch {
            action()
                .onSuccess { merchant ->
                    _uiState.value = _uiState.value.copy(merchant = merchant, actionLoading = false)
                }
                .onFailure { error ->
                    _uiState.value = _uiState.value.copy(
                        actionLoading = false,
                        errorMessage = error.message ?: "Perubahan status toko gagal disimpan"
                    )
                }
        }
    }
}
