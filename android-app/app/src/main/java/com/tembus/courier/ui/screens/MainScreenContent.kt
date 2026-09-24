package com.tembus.courier.ui.screens

import android.content.Context
import androidx.compose.animation.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.courier.data.model.*
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.data.security.LocalDeviceSecuritySettings
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.data.repository.ExperienceConfigRepository
import com.tembus.courier.ui.components.CourierExperienceSlot
import com.tembus.courier.domain.CourierProofTypes
import com.tembus.courier.domain.CourierRouteReducer
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.ui.screens.order.OrderViewModel
import com.tembus.courier.ui.theme.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MainScreenContent(
    context: Context,
    experienceConfigRepository: ExperienceConfigRepository,
    scope: CoroutineScope,
    snackbarHostState: SnackbarHostState,
    courierRole: String,
    selectedTabState: MutableState<Int>,
    isSyncing: Boolean,
    isOnline: Boolean,
    orderViewModel: OrderViewModel,
    onDemandOffers: List<Order>,
    roleOrders: List<Order>,
    rolePendingOrders: List<Order>,
    roleEarningsToday: Int,
    allOrders: List<Order>,
    onDemandServices: List<CourierServiceProduct>,
    capabilityProfile: CourierCapabilityProfile?,
    courierVehicleType: String,
    routePreviews: Map<String, CourierRoutePreview>,
    activeRoutePlan: CourierActiveRoutePlan?,
    onDemandHotspots: List<CourierHotspot>,
    mapsProviderConfig: MapsProviderConfig,
    lastRemoteSyncAt: Long?,
    displayCourierName: String,
    courierProfile: CourierProfile?,
    presenceState: String = "offline",
    localSecurityManager: LocalDeviceSecurityManager,
    localSecuritySettings: LocalDeviceSecuritySettings,
    authSessionManager: AuthSessionManager,
    earningsLedger: CourierEarningsLedger?,
    payoutSummary: CourierPayoutSummaryData?,
    payoutRequests: List<CourierPayoutRequestItem>,
    isPayoutSubmitting: Boolean,
    performanceSummary: CourierPerformanceSummary?,
    inlineErrorMessage: String?,
    showLogoutDialog: MutableState<Boolean>,
    routeStateState: MutableState<CourierRouteState>,
    onOpenOrderDetail: (Order) -> Unit,
    requestDutyToggle: (Boolean) -> Unit,
    showMissingPhotoWarningState: MutableState<Boolean>,
    onDismissInlineError: () -> Unit,
 ) {
    var selectedTab by selectedTabState
    var routeState by routeStateState
    var showMissingPhotoWarning by showMissingPhotoWarningState
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = {
            OnDemandBottomNavigation(
                selectedTab = selectedTab,
                offerCount = onDemandOffers.size,
                onSelectTab = { selectedTab = it }
            )
        }
    ) { paddingValues ->
        if (selectedTab == 0) {
            Column(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
                CourierExperienceSlot(experienceConfigRepository, Modifier.padding(bottom = 8.dp))
                OnDemandMapHome(
                    modifier = Modifier.weight(1f),
                    orders = roleOrders,
                    offers = onDemandOffers,
                    services = onDemandServices,
                    capabilityProfile = capabilityProfile,
                    courierVehicleType = courierVehicleType,
                    routePreviews = routePreviews,
                    activeRoutePlan = activeRoutePlan,
                    hotspots = onDemandHotspots,
                    mapsProviderConfig = mapsProviderConfig,
                    isOnline = isOnline,
                    presenceState = presenceState,
                    onOnlineToggle = { online -> requestDutyToggle(online) },
                    onOpenDelivery = { order ->
                        if (order.isMaintenanceService()) {
                            routeState = if (order.serviceCode?.startsWith("towing") == true) {
                                CourierRouteReducer.towingFlow(order.orderId)
                            } else {
                                CourierRouteReducer.tambalBanFlow(order.orderId)
                            }
                        } else {
                            onOpenOrderDetail(order)
                        }
                    },
                    onViewOrders = { selectedTab = 1 }
                )
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(paddingValues)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                CourierExperienceSlot(experienceConfigRepository)
                MainScreenInlineError(
                    message = inlineErrorMessage,
                    onRetry = { orderViewModel.fetchOrdersFromBackend() },
                    onDismiss = onDismissInlineError
                )

                MainScreenTabContent(
                    paddingValues = paddingValues,
                    context = context,
                    scope = scope,
                    snackbarHostState = snackbarHostState,
                    selectedTab = selectedTab,
                    courierRole = courierRole,
                    displayCourierName = displayCourierName,
                    courierProfile = courierProfile,
                    roleOrders = roleOrders,
                    rolePendingOrders = rolePendingOrders,
                    roleEarningsToday = roleEarningsToday,
                    allOrders = allOrders,
                    capabilityProfile = capabilityProfile,
                    isOnline = isOnline,
                    isSyncing = isSyncing,
                    lastRemoteSyncAt = lastRemoteSyncAt,
                    localSecurityManager = localSecurityManager,
                    localSecuritySettings = localSecuritySettings,
                    authSessionManager = authSessionManager,
                    orderViewModel = orderViewModel,
                    earningsLedger = earningsLedger,
                    payoutSummary = payoutSummary,
                    payoutRequests = payoutRequests,
                    isPayoutSubmitting = isPayoutSubmitting,
                    performanceSummary = performanceSummary,
                    showLogoutDialog = showLogoutDialog,
                    onRouteStateChange = { routeState = it },
                    onOpenOrderDetail = onOpenOrderDetail,
                )
            }
        }

        MainScreenMissingPhotoWarning(
            show = showMissingPhotoWarning,
            onDismiss = { showMissingPhotoWarning = false }
        )
    }
}
