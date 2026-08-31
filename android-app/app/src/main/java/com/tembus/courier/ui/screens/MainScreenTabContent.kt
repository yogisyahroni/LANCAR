package com.tembus.courier.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.isMaintenanceService
import com.tembus.courier.data.security.LocalDeviceSecuritySettings
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.domain.CourierProofTypes
import com.tembus.courier.domain.CourierRouteReducer
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.ui.screens.order.OrderViewModel
import kotlinx.coroutines.CoroutineScope

/**
 * Tab content rendering extracted from MainScreen.kt on 2026-08-30.
 * Handles HomeContent (tab 0), OrdersContent (tab 1), WalletContent (tab 2 on-demand),
 * and ProfileContent (tab 2 on-demand, tab 3).
 *
 * Extracted to reduce MainScreen kt gorbly 250 lines target.
 * All params pass-through — zero internal state.
 */
@Composable
internal fun MainScreenTabContent(
    paddingValues: PaddingValues,
    context: android.content.Context,
    scope: CoroutineScope,
    snackbarHostState: androidx.compose.material3.SnackbarHostState,
    selectedTab: Int,
    courierRole: String,
    isOnDemandCourier: Boolean,
    displayCourierName: String,
    courierProfile: com.tembus.courier.data.model.CourierProfile?,
    roleOrders: List<Order>,
    rolePendingOrders: List<Order>,
    roleDeliveredToday: List<Order>,
    roleEarningsToday: Int,
    allOrders: List<Order>,
    onDemandOffers: List<Order>,
    onDemandServices: List<CourierServiceProduct>,
    capabilityProfile: com.tembus.courier.data.model.CourierCapabilityProfile?,
    courierVehicleType: String,
    routePreviews: Map<String, com.tembus.courier.data.model.CourierRoutePreview>,
    activeRoutePlan: com.tembus.courier.data.model.CourierActiveRoutePlan?,
    onDemandHotspots: List<com.tembus.courier.data.model.CourierHotspot>,
    mapsProviderConfig: com.tembus.courier.data.model.MapsProviderConfig,
    isOnline: Boolean,
    isSyncing: Boolean,
    lastRemoteSyncAt: Long?,
    localSecurityManager: LocalDeviceSecurityManager,
    localSecuritySettings: LocalDeviceSecuritySettings,
    authSessionManager: AuthSessionManager,
    orderViewModel: OrderViewModel,
    earningsLedger: com.tembus.courier.data.model.CourierEarningsLedger?,
    payoutSummary: com.tembus.courier.data.model.CourierPayoutSummaryData?,
    payoutRequests: List<com.tembus.courier.data.model.CourierPayoutRequestItem>,
    isPayoutSubmitting: Boolean,
    performanceSummary: com.tembus.courier.data.model.CourierPerformanceSummary?,
    inlineErrorMessage: String?,
    showLogoutDialog: MutableState<Boolean>,
    pendingDutySecurityTarget: MutableState<Boolean?>,
    routeState: CourierRouteState,
    onRouteStateChange: (CourierRouteState) -> Unit,
    onSelectedOrderChange: (Order?) -> Unit,
    onOpenOrdersTab: () -> Unit,
    onTabChange: (Int) -> Unit,
    onToggleOnline: (Boolean) -> Unit,
    onOpenOrderDetail: (Order) -> Unit,
    onOpenProof: (Order, String) -> Unit,
    onOpenScan: (Order?, String) -> Unit,
    onOnlineToggleRequested: (Boolean, Boolean) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(paddingValues)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        when (selectedTab) {
            0 -> HomeContent(
                courierName = displayCourierName,
                courierRole = courierRole,
                totalOrders = roleOrders.size,
                pendingCount = rolePendingOrders.size,
                deliveredCount = roleDeliveredToday.size,
                todayEarningsIdr = roleEarningsToday,
                orders = roleOrders,
                offers = if (courierRole == "on_demand") onDemandOffers else emptyList(),
                services = onDemandServices,
                capabilityProfile = capabilityProfile,
                courierVehicleType = courierVehicleType,
                routePreviews = routePreviews,
                activeRoutePlan = activeRoutePlan,
                hotspots = onDemandHotspots,
                mapsProviderConfig = mapsProviderConfig,
                isOnline = isOnline,
                onOnlineToggle = { online -> onToggleOnline(online) },
                onCapturePod = { order -> onOpenProof(order, CourierProofTypes.DELIVERY_POD_PHOTO) },
                onOpenDelivery = { order ->
                    if (order.isMaintenanceService()) {
                        onRouteStateChange(if (order.serviceCode?.startsWith("towing") == true) {
                            CourierRouteReducer.towingFlow(order.orderId)
                        } else {
                            CourierRouteReducer.tambalBanFlow(order.orderId)
                        })
                    } else {
                        onOpenOrderDetail(order)
                    }
                },
                onViewOrders = { onTabChange(1) },
                onScanPackage = { onOpenScan(null, CourierProofTypes.PICKUP_SCAN) }
            )
            1 -> OrdersContent(
                orders = roleOrders,
                courierRole = courierRole,
                isSyncing = isSyncing,
                isOnline = isOnline,
                lastRemoteSyncAt = lastRemoteSyncAt,
                onOrderClick = { order -> onOpenOrderDetail(order) },
                onSync = { orderViewModel.syncPendingOrders() },
                onRefresh = { orderViewModel.fetchOrdersFromBackend() }
            )
            2 -> if (isOnDemandCourier) {
                WalletContent(
                    courierName = displayCourierName,
                    todayEarningsIdr = roleEarningsToday,
                    totalEarningsIdr = courierProfile?.totalEarningsIdr ?: allOrders.sumOf { it.cleanPayoutIdr() },
                    localSecurityManager = localSecurityManager,
                    earningsLedger = earningsLedger,
                    payoutSummary = payoutSummary,
                    payoutRequests = payoutRequests,
                    isPayoutSubmitting = isPayoutSubmitting,
                    onRefreshPayout = { orderViewModel.fetchPayoutState() },
                    onRequestPayout = { amountIdr, pin -> orderViewModel.submitPayoutRequest(amountIdr, pin) }
                )
            } else {
                val profileParams = buildProfileContentParams(
                    context = context,
                    scope = scope,
                    snackbarHostState = snackbarHostState,
                    courierName = displayCourierName,
                    courierRole = courierRole,
                    courierProfile = courierProfile,
                    localSecurityManager = localSecurityManager,
                    roleOrders = rolePendingOrders,
                    allOrders = allOrders,
                    roleEarningsToday = roleEarningsToday,
                    performanceSummary = performanceSummary,
                    capabilityProfile = capabilityProfile,
                    authSessionManager = authSessionManager,
                    orderViewModel = orderViewModel,
                    localSecuritySettings = localSecuritySettings,
                    showLogoutDialog = showLogoutDialog,
                    onRouteStateChange = onRouteStateChange,
                )
                ProfileContent(
                    courierProfile = profileParams.courierProfile,
                    courierName = profileParams.courierName,
                    courierRole = profileParams.courierRole,
                    localSecurityManager = profileParams.localSecurityManager,
                    pendingSyncCount = profileParams.pendingSyncCount,
                    todayEarningsIdr = profileParams.todayEarningsIdr,
                    totalEarningsIdr = profileParams.totalEarningsIdr,
                    performanceSummary = profileParams.performanceSummary,
                    capabilityProfile = profileParams.capabilityProfile,
                    authToken = profileParams.authToken,
                    onCompleteTraining = profileParams.onCompleteTraining,
                    onLogout = profileParams.onLogout,
                    onSyncNow = profileParams.onSyncNow,
                    onOptimizeBattery = profileParams.onOptimizeBattery,
                    onClearCache = profileParams.onClearCache,
                    onUpdateCapacity = profileParams.onUpdateCapacity,
                    onRequestServiceUpgrade = profileParams.onRequestServiceUpgrade,
                    onUpdateRadius = profileParams.onUpdateRadius
                )
            }
            3 -> {
                val profileParams = buildProfileContentParams(
                    context = context,
                    scope = scope,
                    snackbarHostState = snackbarHostState,
                    courierName = displayCourierName,
                    courierRole = courierRole,
                    courierProfile = courierProfile,
                    localSecurityManager = localSecurityManager,
                    roleOrders = rolePendingOrders,
                    allOrders = allOrders,
                    roleEarningsToday = roleEarningsToday,
                    performanceSummary = performanceSummary,
                    capabilityProfile = capabilityProfile,
                    authSessionManager = authSessionManager,
                    orderViewModel = orderViewModel,
                    localSecuritySettings = localSecuritySettings,
                    showLogoutDialog = showLogoutDialog,
                    onRouteStateChange = onRouteStateChange,
                )
                ProfileContent(
                    courierProfile = profileParams.courierProfile,
                    courierName = profileParams.courierName,
                    courierRole = profileParams.courierRole,
                    localSecurityManager = profileParams.localSecurityManager,
                    pendingSyncCount = profileParams.pendingSyncCount,
                    todayEarningsIdr = profileParams.todayEarningsIdr,
                    totalEarningsIdr = profileParams.totalEarningsIdr,
                    performanceSummary = profileParams.performanceSummary,
                    capabilityProfile = profileParams.capabilityProfile,
                    authToken = profileParams.authToken,
                    onCompleteTraining = profileParams.onCompleteTraining,
                    onLogout = profileParams.onLogout,
                    onSyncNow = profileParams.onSyncNow,
                    onOptimizeBattery = profileParams.onOptimizeBattery,
                    onClearCache = profileParams.onClearCache,
                    onUpdateCapacity = profileParams.onUpdateCapacity,
                    onRequestServiceUpgrade = profileParams.onRequestServiceUpgrade,
                    onUpdateRadius = profileParams.onUpdateRadius
                )
            }
        }
    }
}