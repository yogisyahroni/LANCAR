package com.tembus.courier.ui.screens

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.material3.SnackbarHostState
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierEarningsLedger
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierPerformanceSummary
import com.tembus.courier.data.model.CourierPayoutRequestItem
import com.tembus.courier.data.model.CourierPayoutSummaryData
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.data.security.LocalDeviceSecuritySettings
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.ui.screens.call.CallEventsViewModel
import com.tembus.courier.ui.screens.notification.NotificationViewModel
import com.tembus.courier.ui.screens.order.OrderViewModel
import kotlinx.coroutines.CoroutineScope

/**
 * State holder extracted from MainScreen kt on 2026-08-30.
 * Holds all ViewModel-collected states + common derived values.
 * Extracted to reduce MainScreen kt state declaration bloat (target ≤ 300 lines).
 */
@Composable
internal fun rememberMainScreenUiState(
    authSessionManager: AuthSessionManager
): MainScreenUiState {
    val orderViewModel: OrderViewModel = androidx.hilt.navigation.compose.hiltViewModel()
    val callEventsViewModel: CallEventsViewModel = androidx.hilt.navigation.compose.hiltViewModel()
    val notificationViewModel: com.tembus.courier.ui.screens.notification.NotificationViewModel = androidx.hilt.navigation.compose.hiltViewModel()

    return remember(orderViewModel, authSessionManager) {
        MainScreenUiState(orderViewModel, callEventsViewModel, notificationViewModel, authSessionManager)
    }
}

/**
 * Holds all state collected from ViewModels + derived display values.
 * Use as single dependency injected into MainScreenTabContent / MainScreenScaffold.
 */
internal class MainScreenUiState(
    val orderViewModel: OrderViewModel,
    val callEventsViewModel: CallEventsViewModel,
    val notificationViewModel: NotificationViewModel,
    val authSessionManager: AuthSessionManager,
) {
    // ViewModel-backed states — collected at call sites via collectAsState()
    // Keeping them as live flows to preserve Composable lifecycle
    val allOrders = orderViewModel.allOrders
    val pendingOrders = orderViewModel.pendingOrders
    val deliveredToday = orderViewModel.deliveredTodayOrders
    val onDemandOffers = orderViewModel.offers
    val onDemandServices = orderViewModel.onDemandServices
    val onDemandHotspots = orderViewModel.onDemandHotspots
    val performanceSummary = orderViewModel.performanceSummary
    val capabilityProfile = orderViewModel.capabilityProfile
    val earningsLedger = orderViewModel.earningsLedger
    val payoutSummary = orderViewModel.payoutSummary
    val payoutRequests = orderViewModel.payoutRequests
    val isPayoutSubmitting = orderViewModel.isPayoutSubmitting
    val routePreviews = orderViewModel.routePreviews
    val activeRoutePlan = orderViewModel.activeRoutePlan
    val mapsProviderConfig = orderViewModel.mapsProviderConfig
    val isSyncing = orderViewModel.isSyncing
    val lastRemoteSyncAt = orderViewModel.lastRemoteSyncAt
    val courierProfile = orderViewModel.courierProfile
    val unreadNotificationCount = notificationViewModel.unreadCount
    val courierName = authSessionManager.courierName
    val isOnline = authSessionManager.isOnline
}
