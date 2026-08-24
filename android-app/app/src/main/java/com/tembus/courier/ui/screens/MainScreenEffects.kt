package com.tembus.courier.ui.screens
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import coil.request.ImageRequest
import android.Manifest
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.ui.draw.clip
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.Priority
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.CancellationTokenSource
import com.tembus.courier.ui.components.maps.CameraPosition
import com.tembus.courier.ui.components.maps.LatLng
import com.tembus.courier.ui.components.maps.RuntimeMap
import com.tembus.courier.ui.components.maps.MapUiSettings
import com.tembus.courier.ui.components.maps.MapMarker
import com.tembus.courier.ui.components.maps.MarkerState
import com.tembus.courier.ui.components.maps.MapPolyline
import com.tembus.courier.ui.components.maps.rememberCameraPositionState
import com.tembus.courier.ui.components.BatteryOptimizationCard
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierServiceCapability
import com.tembus.courier.data.model.CourierEarningsLedger
import com.tembus.courier.data.model.CourierEarningsTransaction
import com.tembus.courier.data.model.CourierPerformanceSummary
import com.tembus.courier.data.model.CourierPayoutRequestItem
import com.tembus.courier.data.model.CourierPayoutSummaryData
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.displayServiceName
import com.tembus.courier.data.model.estimatedNetEarningsIdr
import com.tembus.courier.data.model.isMaintenanceService
import com.tembus.courier.data.model.normalizedWorkflowRole
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.domain.CourierProofTypes
import com.tembus.courier.domain.CourierRouteReducer
import com.tembus.courier.domain.CourierRouteScreen
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.service.LocationTrackerService
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import com.tembus.courier.ui.screens.call.CallEventsViewModel
import com.tembus.courier.ui.screens.call.InAppCallScreen
import com.tembus.courier.ui.screens.call.InAppCallState
import com.tembus.courier.ui.screens.order.OrderDetailScreen
import com.tembus.courier.ui.screens.order.OrderScreen
import com.tembus.courier.ui.screens.order.OrderViewModel
import com.tembus.courier.ui.screens.notification.InboxScreen
import com.tembus.courier.ui.screens.service.ServiceUpgradeScreen
import com.tembus.courier.ui.screens.service.TambalBanFlowScreen
import com.tembus.courier.ui.screens.service.TowingFlowScreen
import com.tembus.courier.ui.screens.service.CompletionScreen
import com.tembus.courier.ui.screens.pod.ProofOfDeliveryScreen
import com.tembus.courier.ui.screens.profile.resolvePayoutActionState
import com.tembus.courier.ui.screens.scan.ScanScreen
import com.tembus.courier.ui.screens.chat.ChatScreen
import com.tembus.courier.ui.screens.face.FaceVerificationScreen
import com.tembus.courier.ui.security.LocalSecurityChallengeDialog
import com.tembus.courier.ui.security.LocalSecuritySettingsPanel
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.components.BidirectionalSwipeSlider
import com.tembus.courier.ui.theme.Accent
import com.tembus.courier.ui.theme.AccentDark
import com.tembus.courier.ui.theme.AccentLight
import com.tembus.courier.ui.theme.Background
import com.tembus.courier.ui.theme.CourierMapBase
import com.tembus.courier.ui.theme.CourierPanel
import com.tembus.courier.ui.theme.Outline
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryDark
import com.tembus.courier.ui.theme.PrimaryLight
import com.tembus.courier.ui.theme.Secondary
import com.tembus.courier.ui.theme.SecondaryLight
import com.tembus.courier.ui.theme.Success
import com.tembus.courier.ui.theme.Info
import com.tembus.courier.ui.theme.Warning
import com.tembus.courier.util.OrderSyncSignalBus
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import kotlin.math.min
import com.tembus.courier.ui.screens.*
import com.tembus.courier.ui.screens.*

// Extracted from MainScreen.kt (Faza 2b refactor 2026-08)
@androidx.compose.runtime.Composable
internal fun MainScreenEffects(deps: MainScreenDeps) {
    var routeState by deps.routeState
    var selectedOrder by deps.selectedOrder
    val roleOrders = deps.roleOrders
    val onDemandOffers = deps.onDemandOffers
    val orderViewModel = deps.orderViewModel
    val callEventsViewModel = deps.callEventsViewModel
    val courierRole = deps.courierRole
    val snackbarHostState = deps.snackbarHostState
    val scope = deps.scope
    val isOnline = deps.isOnline
    val syncIntervalMs = deps.syncIntervalMs
    val lifecycleOwner = deps.lifecycleOwner
    val initialOrderId = deps.initialOrderId
    val initialChatOrderId = deps.initialChatOrderId
    val onConsumedDeepLink = deps.onConsumedDeepLink
    val mapsProviderConfig = deps.mapsProviderConfig
    val activeOnDemandJobCount = deps.activeOnDemandJobCount
    val maxActiveOnDemandJobs = deps.maxActiveOnDemandJobs
    val openOrderDetail = deps.openOrderDetail
    val openChat = deps.openChat
    val error by orderViewModel.error.collectAsState()
    var inlineErrorMessage: String? by deps.inlineErrorMessage

    LaunchedEffect(routeState.orderId, routeState.screen, roleOrders, onDemandOffers) {
        val orderId = routeState.orderId ?: return@LaunchedEffect
        if (selectedOrder?.orderId == orderId) return@LaunchedEffect
        val cachedOrder = roleOrders.firstOrNull { it.orderId == orderId }
            ?: onDemandOffers.firstOrNull { it.orderId == orderId }
            ?: orderViewModel.getOrderById(orderId)
        if (cachedOrder != null) {
            selectedOrder = cachedOrder
        }
    }

    LaunchedEffect(Unit) {
        callEventsViewModel.incomingCallInvites.collect { invite ->
            val order = orderViewModel.getOrderById(invite.orderId)
                ?: roleOrders.firstOrNull { it.orderId == invite.orderId }
                ?: onDemandOffers.firstOrNull { it.orderId == invite.orderId }
            if (order != null) {
                selectedOrder = order
                routeState = CourierRouteReducer.call(invite.orderId, invite.callId, order.communicationCallTargetType())
            } else {
                snackbarHostState.showSnackbar("Panggilan masuk diterima, tetapi order belum tersinkron.")
            }
        }
    }

    if (courierRole == "on_demand" && onDemandOffers.isNotEmpty()) {
        val capacityBlocked = activeOnDemandJobCount >= maxActiveOnDemandJobs
        OnDemandOfferQueueDialog(
            offers = onDemandOffers,
            mapsProviderConfig = mapsProviderConfig,
            activeJobCount = activeOnDemandJobCount,
            maxActiveJobs = maxActiveOnDemandJobs,
            acceptBlocked = capacityBlocked,
            onAccept = { offer ->
                orderViewModel.acceptOffer(offer) { accepted ->
                    openOrderDetail(accepted)
                }
            },
            onReject = { offer -> orderViewModel.rejectOffer(offer) },
            onExpired = { offer -> orderViewModel.rejectOffer(offer, "ttl_expired") }
        )
    }

    // Navigate to order detail if app was opened from notification
    LaunchedEffect(initialOrderId) {
        if (initialOrderId != null) {
            val order = orderViewModel.getOrderById(initialOrderId)
            if (order != null) {
                openOrderDetail(order)
                onConsumedDeepLink()
            }
        }
    }

    // Navigate to Chat Screen directly if app was opened from a Chat notification
    LaunchedEffect(initialChatOrderId) {
        if (initialChatOrderId != null) {
            val order = orderViewModel.getOrderById(initialChatOrderId)
            if (order != null) {
                openChat(order)
                onConsumedDeepLink()
            }
        }
    }

    // Show error as Snackbar and persistent inline retry state.
    LaunchedEffect(error) {
        error?.let { msg ->
            inlineErrorMessage = msg
            snackbarHostState.showSnackbar(
                message = msg,
                duration = SnackbarDuration.Short
            )
            orderViewModel.clearError()
        }
    }

    // Main synchronization loop (App Foreground)
    LaunchedEffect(isOnline, courierRole, syncIntervalMs, lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            if (!isOnline) return@repeatOnLifecycle

            val baseIntervalMs = if (courierRole == "on_demand") {
                ON_DEMAND_FOREGROUND_SYNC_INTERVAL_MS
            } else {
                syncIntervalMs
            }
            val minIntervalMs = if (courierRole == "on_demand") {
                ON_DEMAND_FOREGROUND_SYNC_MIN_INTERVAL_MS
            } else {
                (syncIntervalMs * 0.66).toLong()
            }
            var intervalMs = baseIntervalMs
            while (isActive) {
                val result = orderViewModel.refreshOrdersFromBackend(
                    showUserErrors = false,
                    showLoading = false,
                    minIntervalMs = minIntervalMs
                )
                intervalMs = if (result.isSuccess) {
                    baseIntervalMs
                } else {
                    min(intervalMs * 2, FOREGROUND_SYNC_MAX_BACKOFF_MS)
                }
                delay(intervalMs)
            }
        }
    }

    LaunchedEffect(isOnline, lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            OrderSyncSignalBus.events.collect {
                if (isOnline) {
                    orderViewModel.refreshOrdersFromBackend(
                        showUserErrors = false,
                        showLoading = false,
                        minIntervalMs = PUSH_SYNC_MIN_INTERVAL_MS
                    )
                }
            }
        }
    }
}
