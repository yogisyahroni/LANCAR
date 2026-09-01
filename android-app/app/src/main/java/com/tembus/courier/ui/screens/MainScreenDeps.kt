package com.tembus.courier.ui.screens

import androidx.activity.result.ActivityResultLauncher
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.MutableState
import androidx.lifecycle.LifecycleOwner
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.ui.screens.order.OrderViewModel
import com.tembus.courier.ui.screens.call.CallEventsViewModel
import kotlinx.coroutines.CoroutineScope

// State holder for extracted MainScreen sub-composables (Faza 2b refactor 2026-08)
internal data class MainScreenDeps(
    val context: android.content.Context,
    val scope: CoroutineScope,
    val snackbarHostState: SnackbarHostState,
    val orderViewModel: OrderViewModel,
    val callEventsViewModel: CallEventsViewModel,
    val routeState: MutableState<CourierRouteState>,
    val selectedOrder: MutableState<Order?>,
    val selectedTab: MutableState<Int>,
    val courierRole: String,
    val isOnline: Boolean,
    val lifecycleOwner: LifecycleOwner,
    val syncIntervalMs: Long,
    val onDemandOffers: List<Order>,
    val roleOrders: List<Order>,
    val capabilityProfile: CourierCapabilityProfile?,
    val mapsProviderConfig: MapsProviderConfig,
    val routePreviews: Map<String, com.tembus.courier.data.model.CourierRoutePreview>,
    val cancelPickupReasons: List<com.tembus.courier.data.model.CancelPickupReason>,
    val statusTransitions: List<com.tembus.courier.data.model.OrderStatusTransition>,
    val activeOnDemandJobCount: Int,
    val maxActiveOnDemandJobs: Int,
    val initialOrderId: String?,
    val initialChatOrderId: String?,
    val onConsumedDeepLink: () -> Unit,
    val authSessionManager: AuthSessionManager,
    val onLogout: () -> Unit,
    val showPodScreen: Boolean,
    val showOrderDetail: Boolean,
    val showScanScreen: Boolean,
    val showChatScreen: Boolean,
    val showCallScreen: Boolean,
    val showFaceVerifyScreen: Boolean,
    val activeScanType: String?,
    val activeProofMode: String?,
    val pickupScanVerifiedOrderIds: MutableState<Set<String>>,
    val pickupPhotoVerifiedOrderIds: MutableState<Set<String>>,
    val faceVerifiedOrderIds: MutableState<Set<String>>,
    val showLogoutDialog: MutableState<Boolean>,
    val pendingDutySecurityTarget: MutableState<Boolean?>,
    val showMissingPhotoWarning: MutableState<Boolean>,
    val pendingOnlineAfterForegroundPermission: MutableState<Boolean>,
    val showForegroundLocationPermissionDialog: MutableState<Boolean>,
    val showBackgroundLocationPermissionDialog: MutableState<Boolean>,
    val inlineErrorMessage: MutableState<String?>,
    val foregroundLocationPermissionLauncher: ActivityResultLauncher<Array<String>>,
    val backgroundLocationPermissionLauncher: ActivityResultLauncher<String>,
    val openOrderDetail: (Order) -> Unit,
    val openChat: (Order) -> Unit,
    val openCall: (Order, String?) -> Unit,
    val openScan: (Order?, String) -> Unit,
    val openProof: (Order, String) -> Unit,
    val openFaceVerify: (Order) -> Unit,
    val openServiceFaceVerify: (String, String) -> Unit,
    val closeRoute: () -> Unit,
    val backToOrderOrHome: () -> Unit,
    val sendSafetyEvent: suspend (Order?, String, String, String, java.io.File?) -> Unit,
    val performDutyToggle: suspend (Boolean) -> Unit,
    val requestDutyToggle: (Boolean) -> Unit
)
