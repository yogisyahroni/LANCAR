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
import com.tembus.courier.ui.localization.CourierText as Text
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
internal fun MainScreenModalScreens(deps: MainScreenDeps) {
    var routeState by deps.routeState
    var selectedOrder by deps.selectedOrder
    val showPodScreen = deps.showPodScreen
    val showOrderDetail = deps.showOrderDetail
    val showScanScreen = deps.showScanScreen
    val showChatScreen = deps.showChatScreen
    val showCallScreen = deps.showCallScreen
    val showFaceVerifyScreen = deps.showFaceVerifyScreen
    val activeScanType = deps.activeScanType
    val activeProofMode = deps.activeProofMode
    val orderViewModel = deps.orderViewModel
    val snackbarHostState = deps.snackbarHostState
    val scope = deps.scope
    val authSessionManager = deps.authSessionManager
    val onLogout = deps.onLogout
    val courierRole = deps.courierRole
    val context = deps.context
    var pickupScanVerifiedOrderIds by deps.pickupScanVerifiedOrderIds
    var pickupPhotoVerifiedOrderIds by deps.pickupPhotoVerifiedOrderIds
    var faceVerifiedOrderIds by deps.faceVerifiedOrderIds
    var showLogoutDialog by deps.showLogoutDialog
    var pendingDutySecurityTarget by deps.pendingDutySecurityTarget
    var showForegroundLocationPermissionDialog by deps.showForegroundLocationPermissionDialog
    var showBackgroundLocationPermissionDialog by deps.showBackgroundLocationPermissionDialog
    var pendingOnlineAfterForegroundPermission by deps.pendingOnlineAfterForegroundPermission
    var showMissingPhotoWarning by deps.showMissingPhotoWarning
    var inlineErrorMessage by deps.inlineErrorMessage
    val mapsProviderConfig = deps.mapsProviderConfig
    val routePreviews = deps.routePreviews
    val cancelPickupReasons = deps.cancelPickupReasons
    val statusTransitions = deps.statusTransitions
    val activeOnDemandJobCount = deps.activeOnDemandJobCount
    val maxActiveOnDemandJobs = deps.maxActiveOnDemandJobs
    val onDemandOffers = deps.onDemandOffers
    val roleOrders = deps.roleOrders
    val openOrderDetail = deps.openOrderDetail
    val foregroundLocationPermissionLauncher = deps.foregroundLocationPermissionLauncher
    val backgroundLocationPermissionLauncher = deps.backgroundLocationPermissionLauncher
    val openChat = deps.openChat
    val openCall = deps.openCall
    val openScan = deps.openScan
    val openProof = deps.openProof
    val openFaceVerify = deps.openFaceVerify
    val openServiceFaceVerify = deps.openServiceFaceVerify
    val closeRoute = deps.closeRoute
    val backToOrderOrHome = deps.backToOrderOrHome
    val sendSafetyEvent = deps.sendSafetyEvent
    val performDutyToggle = deps.performDutyToggle
    val requestDutyToggle = deps.requestDutyToggle

    selectedOrder?.takeIf { showPodScreen }?.let { order ->
        ProofOfDeliveryScreen(
            order = order,
            proofMode = activeProofMode ?: "",
            onImageConfirmed = { _ ->
                if (CourierProofTypes.isPickupProof(activeProofMode ?: "")) {
                    pickupPhotoVerifiedOrderIds = pickupPhotoVerifiedOrderIds + order.orderId
                    scope.launch {
                        val updatedOrder = orderViewModel.getOrderById(order.orderId)
                            ?: order.copy(pickupPhotoVerified = true)
                        val hasPickupScan = pickupScanVerifiedOrderIds.contains(order.orderId) ||
                            updatedOrder.pickupScanVerified ||
                            updatedOrder.scanType == "pickup" ||
                            updatedOrder.scanType == CourierProofTypes.PICKUP_SCAN
                        selectedOrder = updatedOrder
                        snackbarHostState.currentSnackbarData?.dismiss()
                        snackbarHostState.showSnackbar(
                            if (hasPickupScan) {
                                "Pickup lengkap. Mulai pengantaran."
                            } else {
                                "Foto barang tersimpan. Scan kode paket masih wajib."
                            }
                        )
                    }
                    routeState = CourierRouteReducer.detail(order.orderId)
                } else {
                    orderViewModel.fetchOrdersFromBackend()
                    closeRoute()
                }
            },
            onBack = {
                backToOrderOrHome()
            }
        )
        return
    }

    // ── Face Verification Screen ───────────────────────────────
    selectedOrder?.takeIf { showFaceVerifyScreen }?.let { order ->
        FaceVerificationScreen(
            orderId = order.orderId,
            verificationType = "pickup",
            workContext = routeState.returnToServiceType,
            onVerified = {
                faceVerifiedOrderIds = faceVerifiedOrderIds + order.orderId
                val returnToServiceType = routeState.returnToServiceType
                when (returnToServiceType) {
                    "tambal_ban" -> {
                        orderViewModel.updateOrderStatusAndSync(order.orderId, "inspecting")
                        selectedOrder = selectedOrder?.copy(status = "inspecting")
                        routeState = CourierRouteReducer.tambalBanFlow(order.orderId)
                        scope.launch {
                            snackbarHostState.showSnackbar("Verifikasi wajah berhasil. Lanjutkan inspeksi ban.")
                        }
                    }
                    "towing" -> {
                        orderViewModel.updateOrderStatusAndSync(order.orderId, "inspecting")
                        selectedOrder = selectedOrder?.copy(status = "inspecting")
                        routeState = CourierRouteReducer.towingFlow(order.orderId)
                        scope.launch {
                            snackbarHostState.showSnackbar("Verifikasi wajah berhasil. Lanjutkan inspeksi kendaraan.")
                        }
                    }
                    else -> {
                        routeState = CourierRouteReducer.detail(order.orderId)
                        scope.launch {
                            snackbarHostState.showSnackbar("Verifikasi wajah berhasil. Lanjutkan scan paket.")
                        }
                    }
                }
            },
            onBack = { backToOrderOrHome() }
        )
        return
    }

    // ── Order Detail Screen ────────────────────────────────────
    selectedOrder?.takeIf { showOrderDetail }?.let { order ->
        LaunchedEffect(order.orderId) {
            if (order.normalizedWorkflowRole() == "on_demand") {
                orderViewModel.loadRoutePreview(order.orderId)
            }
            orderViewModel.fetchOrderStatusTransitions(order.normalizedWorkflowRole())
        }
        OrderDetailScreen(
            order = order,
            routePreview = routePreviews[order.orderId],
            mapsProviderConfig = mapsProviderConfig,
            cancelPickupReasons = cancelPickupReasons,
            statusTransitions = statusTransitions,
            pickupScanVerified = pickupScanVerifiedOrderIds.contains(order.orderId) ||
                order.pickupScanVerified ||
                order.scanType == "pickup" ||
                order.scanType == CourierProofTypes.PICKUP_SCAN,
            pickupPhotoVerified = pickupPhotoVerifiedOrderIds.contains(order.orderId) || order.pickupPhotoVerified,
            faceVerifiedForPickup = faceVerifiedOrderIds.contains(order.orderId),
            onBack = {
                closeRoute()
            },
            onUpdateStatus = { newStatus ->
                // Optimistic local update + backend sync
                orderViewModel.updateOrderStatusAndSync(
                    orderId = order.orderId,
                    status = newStatus
                )
                selectedOrder = selectedOrder?.copy(status = newStatus)
            },
            onRetrySync = { orderViewModel.syncPendingOrders() },
            onUseServerVersion = { orderViewModel.resolveConflictUsingServer(order.orderId) },
            onVerifyPickup = {
                openScan(order, CourierProofTypes.PICKUP_SCAN)
            },
            onVerifyFace = {
                openFaceVerify(order)
            },
            onMarkPickupArrived = { arrivedStatus ->
                orderViewModel.updateOrderStatusAndSync(
                    orderId = order.orderId,
                    status = arrivedStatus,
                    notes = "Kurir mengonfirmasi sudah tiba di lokasi pickup."
                )
                selectedOrder = selectedOrder?.copy(status = arrivedStatus)
            },
            onOpenTambalBanFlow = {
                routeState = CourierRouteReducer.tambalBanFlow(order.orderId)
            },
            onOpenTowingFlow = {
                routeState = CourierRouteReducer.towingFlow(order.orderId)
            },
            onCapturePickupProof = {
                openProof(order, CourierProofTypes.PICKUP_PHOTO)
            },
            onCapturePod = {
                openProof(order, CourierProofTypes.DELIVERY_POD_PHOTO)
            },
            onChatClick = {
                openChat(order)
            },
            onCallClick = {
                openCall(order, null)
            },
            onLogLocalSecurity = { actionType, cb ->
                orderViewModel.logLocalSecurityEvent(actionType, onComplete = cb)
            },
            onSosClick = {
                scope.launch {
                    val location = getLastKnownDutyLocation(context)
                    if (location == null) {
                        snackbarHostState.showSnackbar("Gagal memicu SOS: Lokasi GPS tidak tersedia. Pastikan GPS aktif.")
                        return@launch
                    }
                    val result = orderViewModel.triggerSos(
                        latitude = location.latitude,
                        longitude = location.longitude
                    )
                    result.onSuccess { data ->
                        val prefs = context.getSharedPreferences("sos_prefs", android.content.Context.MODE_PRIVATE)
                        prefs.edit()
                            .putBoolean("is_sos_active", true)
                            .putString("active_incident_id", data.incidentId)
                            .apply()
                        snackbarHostState.showSnackbar("Panggilan Darurat (SOS) telah dikirim ke pusat komando.")
                    }.onFailure {
                        snackbarHostState.showSnackbar("Gagal memicu SOS: ${it.message}")
                    }
                }
            },
            onReportIssue = { eventType, severity, message, photoFile ->
                scope.launch {
                    sendSafetyEvent(order, eventType, severity, message, photoFile)
                }
            },
            onCancelPickup = { reasonCode, reasonNote, photoFile ->
                scope.launch {
                    val location = getLastKnownDutyLocation(context)
                    val result = orderViewModel.cancelOnDemandPickup(
                        orderId = order.orderId,
                        reasonCode = reasonCode,
                        reasonNote = reasonNote,
                        latitude = location?.latitude,
                        longitude = location?.longitude,
                        accuracy = location?.accuracy,
                        photoFile = photoFile
                    )
                    result.onSuccess { message ->
                        closeRoute()
                        snackbarHostState.showSnackbar(message)
                    }.onFailure { error ->
                        snackbarHostState.showSnackbar(error.message ?: "Pembatalan pickup belum terkirim. Coba lagi.")
                    }
                }
            }
        )
        return
    }

    // ── Chat Screen ────────────────────────────────────────────
    selectedOrder?.takeIf { showChatScreen }?.let { order ->
        ChatScreen(
            orderId = order.orderId,
            conversationTitle = order.communicationChatTitle(),
            conversationSubtitle = order.communicationChatSubtitle(),
            inputPlaceholder = order.communicationChatPlaceholder(),
            isDeliveryGroup = order.communicationIsDeliveryGroup(),
            onCallClick = {
                openCall(order, null)
            },
            onBackClick = {
                backToOrderOrHome()
            },
            order = order
        )
        return
    }

    // ── In-app Call Screen ─────────────────────────────────────
    selectedOrder?.takeIf { showCallScreen }?.let { order ->
        InAppCallScreen(
            orderId = order.orderId,
            targetName = order.communicationCallTargetLabel(),
            targetType = routeState.callTargetType ?: "",
            initialState = if (routeState.callId.isNullOrBlank()) InAppCallState.OUTGOING else InAppCallState.INCOMING,
            routeCallId = routeState.callId,
            onBackClick = { backToOrderOrHome() },
            onOpenChat = {
                routeState = CourierRouteReducer.chat(order.orderId)
            }
        )
        return
    }

    // ── Scan Screen ────────────────────────────────────────────
    if (showScanScreen) {
        ScanScreen(
            initialOrderId = selectedOrder?.orderId,
            scanType = activeScanType ?: "",
            title = if (activeScanType == CourierProofTypes.PICKUP_SCAN) "Verifikasi Barang" else "Verifikasi Tujuan",
            onScanSuccess = { orderId ->
                scope.launch {
                    // Load real order from DB (may have been added by notification)
                    val order = orderViewModel.getOrderById(orderId)
                    if (order != null) {
                        if (activeScanType == CourierProofTypes.PICKUP_SCAN) {
                            pickupScanVerifiedOrderIds = pickupScanVerifiedOrderIds + orderId
                            val hasPickupPhoto = pickupPhotoVerifiedOrderIds.contains(orderId) || order.pickupPhotoVerified
                            if (hasPickupPhoto) {
                                selectedOrder = order.copy(pickupScanVerified = true)
                                orderViewModel.fetchOrdersFromBackend()
                                snackbarHostState.showSnackbar("Pickup lengkap. Mulai pengantaran.")
                            } else {
                                selectedOrder = order.copy(pickupScanVerified = true)
                                snackbarHostState.showSnackbar("Scan berhasil. Lanjutkan foto barang untuk mulai pengantaran.")
                            }
                        } else {
                            selectedOrder = order
                        }
                        routeState = CourierRouteReducer.detail(orderId)
                    } else {
                        snackbarHostState.showSnackbar("Order $orderId tidak ditemukan")
                    }
                }
            },
            onBack = {
                backToOrderOrHome()
            }
        )
        return
    }

    // ── Inbox Screen ──────────────────────────────────────────
    if (routeState.screen == CourierRouteScreen.SERVICE_UPGRADE) {
        ServiceUpgradeScreen(
            onNavigateBack = { routeState = CourierRouteReducer.home() }
        )
        return
    }

    // ── Tambal Ban Flow Screen ──────────────────────────────
    if (routeState.screen == CourierRouteScreen.TAMBAL_BAN_FLOW) {
        val orderId = routeState.orderId ?: return
        TambalBanFlowScreen(
            orderId = orderId,
            onBackClick = { routeState = CourierRouteReducer.home() },
            onComplete = { routeState = CourierRouteReducer.home() },
            onVerifyFace = { id, serviceType ->
                openServiceFaceVerify(id, serviceType)
            },
            onOpenCompletion = { id, serviceType ->
                routeState = CourierRouteReducer.completion(id, serviceType)
            }
        )
        return
    }

    // ── Towing Flow Screen ──────────────────────────────────
    if (routeState.screen == CourierRouteScreen.TOWING_FLOW) {
        val orderId = routeState.orderId ?: return
        TowingFlowScreen(
            orderId = orderId,
            onBackClick = { routeState = CourierRouteReducer.home() },
            onComplete = { routeState = CourierRouteReducer.home() },
            onVerifyFace = { id, serviceType ->
                openServiceFaceVerify(id, serviceType)
            },
            onOpenCompletion = { id, serviceType ->
                routeState = CourierRouteReducer.completion(id, serviceType)
            }
        )
        return
    }

    // ── Completion Screen ────────────────────────────────────
    if (routeState.screen == CourierRouteScreen.COMPLETION) {
        val orderId = routeState.orderId ?: return
        val serviceType = routeState.serviceType ?: ""
        CompletionScreen(
            serviceType = serviceType,
            onBackClick = { routeState = CourierRouteReducer.home() },
            onComplete = { notes, completionPhoto, signatureBitmap, damageReport ->
                scope.launch {
                    orderViewModel.submitServiceReport(
                        orderId = orderId,
                        serviceType = serviceType,
                        notes = notes,
                        completionPhoto = completionPhoto,
                        signatureBitmap = signatureBitmap,
                        damageReport = damageReport
                    )
                }
                routeState = CourierRouteReducer.home()
            }
        )
        return
    }

    if (routeState.screen == CourierRouteScreen.INBOX) {
        InboxScreen(
            onBackClick = { routeState = CourierRouteReducer.home() }
        )
        return
    }

    // ── Logout Confirmation Dialog ─────────────────────────────
    if (showLogoutDialog) {
        AlertDialog(
            onDismissRequest = { showLogoutDialog = false },
            title = { Text("Keluar Aplikasi") },
            text = { Text("Kamu yakin ingin keluar? Semua data offline akan tetap tersimpan.") },
            confirmButton = {
                TextButton(
                    onClick = {
                        showLogoutDialog = false
                        scope.launch {
                            orderViewModel.clearAllOrders()
                            authSessionManager.clearSession()
                            onLogout()
                        }
                    }
                ) {
                    Text("Keluar", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showLogoutDialog = false }) {
                    Text("Batal")
                }
            }
        )
    }

    if (showForegroundLocationPermissionDialog) {
        AlertDialog(
            onDismissRequest = {
                showForegroundLocationPermissionDialog = false
                pendingOnlineAfterForegroundPermission = false
            },
            title = { Text("Aktifkan Lokasi") },
            text = {
                Text("Lokasi foreground dibutuhkan untuk validasi area kerja, rute pickup, dan bukti pengantaran. TEMBUS hanya memakai lokasi saat kurir On Duty.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showForegroundLocationPermissionDialog = false
                        foregroundLocationPermissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION
                            )
                        )
                    }
                ) {
                    Text("Izinkan lokasi")
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        showForegroundLocationPermissionDialog = false
                        pendingOnlineAfterForegroundPermission = false
                    }
                ) {
                    Text("Batal")
                }
            }
        )
    }

    if (showBackgroundLocationPermissionDialog) {
        AlertDialog(
            onDismissRequest = { showBackgroundLocationPermissionDialog = false },
            title = { Text("Tracking Saat App Ditutup") },
            text = {
                Text("Agar dispatcher dan pelanggan tetap mendapat posisi akurat selama pekerjaan aktif, aktifkan izin lokasi background. Izin ini hanya dipakai saat status On Duty.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showBackgroundLocationPermissionDialog = false
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                data = Uri.parse("package:${context.packageName}")
                            }
                            context.startActivity(intent)
                        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                            backgroundLocationPermissionLauncher.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                        }
                    }
                ) {
                    Text("Buka pengaturan")
                }
            },
            dismissButton = {
                TextButton(onClick = { showBackgroundLocationPermissionDialog = false }) {
                    Text("Nanti")
                }
            }
        )
    }

    pendingDutySecurityTarget?.let { targetOnline ->
        FaceVerificationScreen(
            orderId = null,
            verificationType = if (targetOnline) "on_duty" else "off_duty",
            onVerified = {
                val actionType = if (targetOnline) "on_duty" else "off_duty"
                pendingDutySecurityTarget = null
                orderViewModel.logLocalSecurityEvent(actionType) {
                    scope.launch { performDutyToggle(targetOnline) }
                }
            },
            onBack = { pendingDutySecurityTarget = null }
        )
    }
}
