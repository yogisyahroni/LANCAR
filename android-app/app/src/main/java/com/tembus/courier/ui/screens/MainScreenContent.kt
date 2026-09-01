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
    scope: CoroutineScope,
    snackbarHostState: SnackbarHostState,
    isOnDemandCourier: Boolean,
    courierRole: String,
    selectedTabState: MutableState<Int>,
    isSyncing: Boolean,
    isOnline: Boolean,
    orderViewModel: OrderViewModel,
    unreadNotificationCount: Int,
    pendingOrders: List<Order>,
    onDemandOffers: List<Order>,
    roleOrders: List<Order>,
    rolePendingOrders: List<Order>,
    roleDeliveredToday: List<Order>,
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
    pendingDutySecurityTargetState: MutableState<Boolean?>,
    routeStateState: MutableState<CourierRouteState>,
    selectedOrderState: MutableState<Order?>,
    onRouteStateChange: (CourierRouteState) -> Unit,
    onSelectedOrderChange: (Order?) -> Unit,
    onOpenOrdersTab: () -> Unit,
    onTabChange: (Int) -> Unit,
    onToggleOnline: (Boolean) -> Unit,
    onOpenOrderDetail: (Order) -> Unit,
    onOpenProof: (Order, String) -> Unit,
    onOpenScan: (Order?, String) -> Unit,
    onOnlineToggleRequested: (Boolean, Boolean) -> Unit,
    requestDutyToggle: (Boolean) -> Unit,
    onPerformDutyToggle: suspend (Boolean) -> Unit,
    pendingOnlineAfterForegroundPermissionState: MutableState<Boolean>,
    showForegroundLocationPermissionDialogState: MutableState<Boolean>,
    showMissingPhotoWarningState: MutableState<Boolean>,
    onDismissInlineError: () -> Unit,
 ) {
    var selectedTab by selectedTabState
    var routeState by routeStateState
    var selectedOrder by selectedOrderState
    var pendingDutySecurityTarget by pendingDutySecurityTargetState
    var pendingOnlineAfterForegroundPermission by pendingOnlineAfterForegroundPermissionState
    var showForegroundLocationPermissionDialog by showForegroundLocationPermissionDialogState
    var showMissingPhotoWarning by showMissingPhotoWarningState
    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            if (!isOnDemandCourier) {
                TopAppBar(
                    title = {
                        Column {
                            Text("TEMBUS Mitra Kurir", fontWeight = FontWeight.Bold)
                            Text(
                                text = if (isOnline) "On duty" else "Off duty",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f)
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Primary,
                        titleContentColor = MaterialTheme.colorScheme.onPrimary,
                        actionIconContentColor = MaterialTheme.colorScheme.onPrimary
                    ),
                    actions = {
                        AnimatedVisibility(visible = isSyncing, enter = fadeIn(), exit = fadeOut()) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp).padding(end = 8.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        }
                        IconButton(onClick = { orderViewModel.fetchOrdersFromBackend() }) {
                            Icon(imageVector = Icons.Default.Refresh, contentDescription = CourierTextCatalog.translate("Muat ulang"))
                        }
                        IconButton(onClick = { routeState = CourierRouteReducer.inbox() }) {
                            BadgedBox(badge = {
                                if (unreadNotificationCount > 0) Badge { Text("$unreadNotificationCount") }
                            }) {
                                Icon(imageVector = Icons.Default.Notifications, contentDescription = CourierTextCatalog.translate("Notifikasi"))
                            }
                        }
                    }
                )
            }
        },
        bottomBar = {
            if (isOnDemandCourier) {
                OnDemandBottomNavigation(
                    selectedTab = selectedTab,
                    offerCount = onDemandOffers.size,
                    onSelectTab = { selectedTab = it }
                )
            } else {
                MainScreenBottomNavBar(
                    selectedTab = selectedTab,
                    pendingOrders = pendingOrders,
                    onTabChange = { selectedTab = it }
                )
            }
        }
    ) { paddingValues ->
        if (isOnDemandCourier && selectedTab == 0) {
            OnDemandMapHome(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
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
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
                    .padding(paddingValues)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
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
                    isOnDemandCourier = isOnDemandCourier,
                    displayCourierName = displayCourierName,
                    courierProfile = courierProfile,
                    roleOrders = roleOrders,
                    rolePendingOrders = rolePendingOrders,
                    roleDeliveredToday = roleDeliveredToday,
                    roleEarningsToday = roleEarningsToday,
                    allOrders = allOrders,
                    onDemandOffers = onDemandOffers,
                    onDemandServices = onDemandServices,
                    capabilityProfile = capabilityProfile,
                    courierVehicleType = courierVehicleType,
                    routePreviews = routePreviews,
                    activeRoutePlan = activeRoutePlan,
                    onDemandHotspots = onDemandHotspots,
                    mapsProviderConfig = mapsProviderConfig,
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
                    inlineErrorMessage = inlineErrorMessage,
                    showLogoutDialog = showLogoutDialog,
                    pendingDutySecurityTarget = pendingDutySecurityTargetState,
                    routeState = routeState,
                    onRouteStateChange = { routeState = it },
                    onSelectedOrderChange = { selectedOrder = it },
                    onOpenOrdersTab = { selectedTab = 1 },
                    onTabChange = { selectedTab = it },
                    onToggleOnline = { requestDutyToggle(it) },
                    onOpenOrderDetail = onOpenOrderDetail,
                    onOpenProof = onOpenProof,
                    onOpenScan = onOpenScan,
                    onOnlineToggleRequested = { online, pending ->
                        if (online && !hasForegroundLocationPermission(context)) {
                            pendingOnlineAfterForegroundPermission = true
                            showForegroundLocationPermissionDialog = true
                        } else if (online && localSecuritySettings.active) {
                            pendingDutySecurityTarget = true
                        } else {
                            scope.launch { onPerformDutyToggle(online) }
                        }
                    }
                )
            }
        }

        MainScreenMissingPhotoWarning(
            show = showMissingPhotoWarning,
            onDismiss = { showMissingPhotoWarning = false }
        )
    }
}
