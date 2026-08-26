package com.tembus.courier.ui.screens.order
import android.app.Activity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.location.Geocoder
import android.location.Location
import android.net.Uri
import android.view.WindowManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.tembus.courier.ui.components.maps.CameraPosition
import com.tembus.courier.ui.components.maps.LatLng
import com.tembus.courier.ui.components.maps.RuntimeMap
import com.tembus.courier.ui.components.maps.MapUiSettings
import com.tembus.courier.ui.components.maps.MapMarker
import com.tembus.courier.ui.components.maps.MarkerState
import com.tembus.courier.ui.components.maps.MapPolyline
import com.tembus.courier.ui.components.maps.rememberCameraPositionState
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.CancelPickupReason
import com.tembus.courier.data.model.OrderStatusTransition
import com.tembus.courier.data.model.isMaintenanceService
import com.tembus.courier.BuildConfig
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.estimatedNetEarningsIdr
import com.tembus.courier.data.model.displayServiceName
import com.tembus.courier.data.model.normalizedWorkflowRole
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.domain.CourierFlowResolver
import com.tembus.courier.domain.CourierFlowState
import com.tembus.courier.domain.CourierNextActionType
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import com.tembus.courier.ui.theme.AccentDark
import com.tembus.courier.ui.theme.DarkAccentLight
import com.tembus.courier.ui.theme.DarkSurface
import com.tembus.courier.ui.theme.DarkSurfaceVariant
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryLight
import com.tembus.courier.ui.theme.Secondary
import com.tembus.courier.ui.theme.Success
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import java.io.File
import java.io.FileOutputStream
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.draw.clip
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.ui.screens.face.FaceVerificationScreen
import com.tembus.courier.util.NavigationHelper

@Composable
fun OrderDetailScreen(
    order: Order,
    onBack: () -> Unit,
    onUpdateStatus: (String) -> Unit,
    onVerifyPickup: () -> Unit,
    onCapturePickupProof: () -> Unit,
    onCapturePod: () -> Unit,
    onChatClick: () -> Unit,
    onCallClick: () -> Unit,
    routePreview: CourierRoutePreview? = null,
    mapsProviderConfig: MapsProviderConfig = MapsProviderConfig(),
    cancelPickupReasons: List<CancelPickupReason> = emptyList(),
    statusTransitions: List<OrderStatusTransition> = emptyList(),
    pickupScanVerified: Boolean = false,
    pickupPhotoVerified: Boolean = false,
    faceVerifiedForPickup: Boolean = false,
    onVerifyFace: () -> Unit = {},
    onOpenTambalBanFlow: () -> Unit = {},
    onOpenTowingFlow: () -> Unit = {},
    onSosClick: () -> Unit = {},
    onReportIssue: (eventType: String, severity: String, message: String, photoFile: File?) -> Unit = { _, _, _, _ -> },
    onCancelPickup: (reasonCode: String, reasonNote: String?, photoFile: File) -> Unit = { _, _, _ -> },
    onLogLocalSecurity: (String, () -> Unit) -> Unit = { _, cb -> cb() }
) {
    val context = LocalContext.current
    
    // 🛡️ SECURITY: Prevent customer PII screenshots and background system captures.
    // Debug build dibuka (pola sama dengan SecureScreenEffect) agar UAT/QA bisa
    // screencap — release build tetap FLAG_SECURE penuh.
    val activity = remember(context) { context as? Activity }
    DisposableEffect(activity) {
        if (!BuildConfig.DEBUG) {
            activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    var showStatusDialog by remember { mutableStateOf(false) }
    var newStatus by remember { mutableStateOf(order.status) }
    val pickupPhotoRequired = remember(order.orderId, order.status, order.workflowRole, statusTransitions) {
        isPickupPhotoRequired(order, statusTransitions)
    }
    val courierFlow = remember(order, faceVerifiedForPickup, pickupScanVerified, pickupPhotoVerified, pickupPhotoRequired) {
        CourierFlowResolver.resolve(
            order = order,
            faceVerifiedForPickup = faceVerifiedForPickup,
            pickupScanVerified = pickupScanVerified,
            pickupPhotoVerified = pickupPhotoVerified,
            pickupPhotoRequired = pickupPhotoRequired
        )
    }

    val localSecurityManager = remember { LocalDeviceSecurityManager(context.applicationContext) }
    var showStartDeliverySecurityChallenge by remember { mutableStateOf<String?>(null) }
    
    if (showStartDeliverySecurityChallenge != null) {
        FaceVerificationScreen(
            orderId = order.orderId,
            verificationType = "start_delivery",
            onVerified = {
                val targetStatus = showStartDeliverySecurityChallenge!!
                showStartDeliverySecurityChallenge = null
                onLogLocalSecurity("mulai_antar") {
                    onUpdateStatus(targetStatus)
                }
            },
            onBack = { showStartDeliverySecurityChallenge = null }
        )
    }

    if (showStatusDialog) {
        val selectableStatuses = statusTransitions
            .filter {
                it.fromStatus.equals(order.status, ignoreCase = true) &&
                    !it.requiresAdmin &&
                    !it.requiresProof
            }
            .map { it.toStatus }
            .toSet()
        val canSubmitStatus = newStatus != order.status && selectableStatuses.contains(newStatus)

        AlertDialog(
            onDismissRequest = { showStatusDialog = false },
            title = { Text("Koreksi Tahap Pengiriman") },
            text = {
                Column {
                    OrderStatusOptions(
                        currentStatus = order.status,
                        selectedStatus = newStatus,
                        transitions = statusTransitions
                    ) { status ->
                        newStatus = status
                    }
                }
            },
            confirmButton = {
                TextButton(
                    enabled = canSubmitStatus,
                    onClick = {
                        onUpdateStatus(newStatus)
                        showStatusDialog = false
                    }
                ) {
                    Text("Simpan")
                }
            },
            dismissButton = {
                TextButton(onClick = { showStatusDialog = false }) {
                    Text("Batal")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(if (order.isMaintenanceService()) serviceTitle(order) else "Pengantaran", fontWeight = FontWeight.Bold)
                        Text(
                            shortOrderId(order.orderId.ifBlank { "Order aktif" }),
                            style = MaterialTheme.typography.labelMedium,
                            color = Color.White.copy(alpha = 0.72f)
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            DeliveryMapCard(order = order, routePreview = routePreview, mapsProviderConfig = mapsProviderConfig)
            OrderInfoCard(order = order)
            
            if (order.tambalBanReport != null) {
                TambalBanReportCard(report = order.tambalBanReport!!)
            }
            if (order.towingReport != null) {
                TowingReportCard(report = order.towingReport!!)
            }

            // Tambal Ban / Towing Service Flow button (per service type)
            val serviceCode = order.serviceCode?.lowercase() ?: ""
            val isServiceOrder = serviceCode.startsWith("tambal_ban") || serviceCode.startsWith("towing")
            if (isServiceOrder) {
                val isTambalBan = serviceCode.startsWith("tambal_ban")
                val isTowing = serviceCode.startsWith("towing")
                if (isTambalBan && order.tambalBanReport == null) {
                    OutlinedButton(
                        onClick = onOpenTambalBanFlow,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Icon(Icons.Default.Build, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Buka Alur Tambal Ban", fontWeight = FontWeight.Bold)
                    }
                }
                if (isTowing && order.towingReport == null) {
                    OutlinedButton(
                        onClick = onOpenTowingFlow,
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Icon(Icons.Default.LocalShipping, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Buka Alur Towing", fontWeight = FontWeight.Bold)
                    }
                }
            }

            // Only show delivery actions for non-service orders
            if (!isServiceOrder && order.normalizedWorkflowRole() == "on_demand") {
                OnDemandTaskActions(
                    order = order,
                    routePreview = routePreview,
                    flowState = courierFlow,
                    cancelPickupReasons = cancelPickupReasons,
                    pickupScanVerified = pickupScanVerified,
                    pickupPhotoVerified = pickupPhotoVerified,
                    faceVerifiedForPickup = faceVerifiedForPickup,
                    onVerifyFace = onVerifyFace,
                    onVerifyPickup = onVerifyPickup,
                    onCapturePickupProof = onCapturePickupProof,
                    onCapturePod = onCapturePod,
                    onUpdateStatus = onUpdateStatus,
                    onStartDelivery = { targetStatus ->
                        showStartDeliverySecurityChallenge = targetStatus
                    },
                    onChatClick = onChatClick,
                    onCallClick = onCallClick,
                    onSosClick = onSosClick,
                    onReportIssue = onReportIssue,
                    onCancelPickup = onCancelPickup
                )
            } else if (!isServiceOrder) {
                OrderActions(
                    order = order,
                    flowState = courierFlow,
                    isServiceOrder = isServiceOrder,
                    onStatusClick = { showStatusDialog = true },
                    onUpdateStatus = onUpdateStatus,
                    onStartDelivery = { targetStatus ->
                        showStartDeliverySecurityChallenge = targetStatus
                    },
                    onVerifyPickup = onVerifyPickup,
                    onCapturePickupProof = onCapturePickupProof,
                    onCapturePod = onCapturePod,
                    onChatClick = onChatClick,
                    onCallClick = onCallClick,
                    onSosClick = onSosClick
                )
            }
        }
    }
}
