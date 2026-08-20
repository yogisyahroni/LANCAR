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

private val LogisticsOrange = AccentDark // #C2410C — CTA/ikon oranye dgn teks putih 5.18:1 (WCAG AA)
private val DeepForest = Color(0xFF0A2F20)
private val OnDemandSurface = Color(0xFFF2F5F0)

private fun decodeRoutePolyline(encoded: String?): List<LatLng> {
    if (encoded.isNullOrBlank()) return emptyList()

    val points = mutableListOf<LatLng>()
    var index = 0
    var latitude = 0
    var longitude = 0

    while (index < encoded.length) {
        var result = 0
        var shift = 0
        var byteValue: Int
        do {
            if (index >= encoded.length) return points
            byteValue = encoded[index++].code - 63
            result = result or ((byteValue and 0x1f) shl shift)
            shift += 5
        } while (byteValue >= 0x20)
        val deltaLatitude = if ((result and 1) != 0) (result shr 1).inv() else result shr 1
        latitude += deltaLatitude

        result = 0
        shift = 0
        do {
            if (index >= encoded.length) return points
            byteValue = encoded[index++].code - 63
            result = result or ((byteValue and 0x1f) shl shift)
            shift += 5
        } while (byteValue >= 0x20)
        val deltaLongitude = if ((result and 1) != 0) (result shr 1).inv() else result shr 1
        longitude += deltaLongitude

        points.add(LatLng(latitude / 1E5, longitude / 1E5))
    }

    return points
}

/**
 * Order Detail Screen
 * 
 * Displays detailed information about a specific order.
 * Allows status updates and PoD capture.
 */
@OptIn(ExperimentalMaterial3Api::class)
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
            } else {
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

@Composable
private fun DeliveryMapCard(
    order: Order,
    routePreview: CourierRoutePreview?,
    mapsProviderConfig: MapsProviderConfig
) {
    val context = LocalContext.current
    var pickupLatLng by remember(order.pickupAddress, order.pickupLatitude, order.pickupLongitude) { mutableStateOf<LatLng?>(null) }
    var dropLatLng by remember(order.dropAddress, order.dropLatitude, order.dropLongitude) { mutableStateOf<LatLng?>(null) }

    LaunchedEffect(order.pickupAddress, order.dropAddress, order.pickupLatitude, order.pickupLongitude, order.dropLatitude, order.dropLongitude) {
        pickupLatLng = when {
            order.pickupLatitude != null && order.pickupLongitude != null -> LatLng(order.pickupLatitude, order.pickupLongitude)
            order.pickupAddress.isNotBlank() -> geocodeAddress(context, order.pickupAddress)
            else -> null
        }
        dropLatLng = when {
            order.dropLatitude != null && order.dropLongitude != null -> LatLng(order.dropLatitude, order.dropLongitude)
            order.dropAddress.isNotBlank() -> geocodeAddress(context, order.dropAddress)
            else -> null
        }
    }

    val firstPoint = pickupLatLng ?: dropLatLng
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(firstPoint ?: LatLng(0.0, 0.0), 12f)
    }

    LaunchedEffect(pickupLatLng, dropLatLng) {
        val pickup = pickupLatLng
        val dropoff = dropLatLng
        val center = when {
            pickup != null && dropoff != null -> LatLng(
                (pickup.latitude + dropoff.latitude) / 2,
                (pickup.longitude + dropoff.longitude) / 2
            )
            pickup != null -> pickup
            dropoff != null -> dropoff
            else -> null
        }
        if (center != null) {
            cameraPositionState.position = CameraPosition.fromLatLngZoom(center, if (pickup != null && dropoff != null) 12f else 13.5f)
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.fillMaxWidth().height(230.dp)) {
                if (firstPoint != null) {
                    val markers = buildList {
                        pickupLatLng?.let { add(RuntimeMapMarker("pickup", it, "Pickup", order.pickupAddress)) }
                        dropLatLng?.let { add(RuntimeMapMarker("dropoff", it, "Tujuan", order.dropAddress)) }
                    }
                    val encodedRoutePoints = decodeRoutePolyline(
                        routePreview?.routePolyline ?: routePreview?.routeSnapshot?.routePolyline
                    )
                    val canShowBackendFallbackLine =
                        routePreview?.fallbackReason?.isNotBlank() == true ||
                            routePreview?.routeSnapshot?.fallbackReason?.isNotBlank() == true
                    val legacyFallbackPoints = if (canShowBackendFallbackLine) {
                        routePreview?.polyline
                            ?.map { LatLng(it.latitude, it.longitude) }
                            .orEmpty()
                    } else {
                        emptyList()
                    }
                    val routePoints = when {
                        encodedRoutePoints.isNotEmpty() -> encodedRoutePoints
                        legacyFallbackPoints.isNotEmpty() -> legacyFallbackPoints
                        canShowBackendFallbackLine && pickupLatLng != null && dropLatLng != null -> listOf(pickupLatLng!!, dropLatLng!!)
                        else -> emptyList()
                    }
                    RuntimeMapRenderer(
                        providerConfig = mapsProviderConfig,
                        markers = markers,
                        routePoints = routePoints,
                        mapUiSettings = MapUiSettings(
                            zoomControlsEnabled = false,
                            myLocationButtonEnabled = false,
                            mapToolbarEnabled = false
                        ),
                        routeColor = Primary,
                        fallbackTitle = "Preview rute siap",
                        fallbackMessage = "Koordinat dan ETA mengikuti data operasional terbaru.",
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.LocationOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(36.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Koordinat order sedang disinkronkan", fontWeight = FontWeight.Bold)
                        Text(
                            "Peta tampil otomatis setelah titik pickup atau tujuan valid.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 2.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (order.isMaintenanceService()) {
                    Text("Lokasi Layanan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    DeliveryStop(
                        icon = Icons.Default.Build,
                        label = "Alamat",
                        value = order.pickupAddress.ifBlank { order.dropAddress }.ifBlank { "Alamat lokasi sedang disinkronkan" },
                        color = Primary
                    )
                } else {
                    Text(if (order.normalizedWorkflowRole() == "on_demand") "Rute On Demand" else "Rute Pengantaran", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    DeliveryStop(icon = Icons.Default.Storefront, label = "Pickup", value = order.pickupAddress.ifBlank { "Alamat pickup sedang disinkronkan" }, color = Primary)
                    DeliveryStop(icon = Icons.Default.LocationOn, label = "Tujuan", value = order.dropAddress.ifBlank { "Alamat tujuan sedang disinkronkan" }, color = Secondary)
                }
            }
        }
    }
}

@Composable
private fun OnDemandTaskActions(
    order: Order,
    routePreview: CourierRoutePreview?,
    flowState: CourierFlowState,
    cancelPickupReasons: List<CancelPickupReason>,
    pickupScanVerified: Boolean,
    pickupPhotoVerified: Boolean,
    faceVerifiedForPickup: Boolean,
    onVerifyFace: () -> Unit,
    onVerifyPickup: () -> Unit,
    onCapturePickupProof: () -> Unit,
    onCapturePod: () -> Unit,
    onUpdateStatus: (String) -> Unit,
    onStartDelivery: (String) -> Unit,
    onChatClick: () -> Unit,
    onCallClick: () -> Unit,
    onSosClick: () -> Unit,
    onReportIssue: (eventType: String, severity: String, message: String, photoFile: File?) -> Unit,
    onCancelPickup: (reasonCode: String, reasonNote: String?, photoFile: File) -> Unit
) {
    val context = LocalContext.current
    var showCancelPickupDialog by remember { mutableStateOf(false) }
    var showIssueDialog by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.16f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            OnDemandJobHeader(
                order = order,
                phaseTitle = flowState.title,
                phaseInstruction = flowState.instruction
            )

            OnDemandCurrentStopCard(
                title = flowState.activeAddressLabel,
                address = flowState.activeAddress,
                icon = if (flowState.targetIsPickup) Icons.Default.Storefront else Icons.Default.LocationOn,
                gateLabel = if (flowState.targetIsPickup) "Validasi di titik pickup" else "Validasi di titik penerima"
            )

            CourierNextActionPanel(
                flowState = flowState,
                onClick = {
                    runCourierNextAction(
                        context = context,
                        flowState = flowState,
                        onVerifyFace = onVerifyFace,
                        onVerifyPickup = onVerifyPickup,
                        onCapturePickupProof = onCapturePickupProof,
                        onCapturePod = onCapturePod,
                        onUpdateStatus = onUpdateStatus,
                        onStartDelivery = onStartDelivery,
                        onChatClick = onChatClick,
                        onReportFailedDelivery = {
                            onReportIssue("failed_delivery", "high",
                                "Penerima tidak dapat ditemui. Membutuhkan tindak lanjut operasional.", null)
                        }
                    )
                },
                onSecondaryClick = if (flowState.secondaryAction != null) {
                    {
                        onReportIssue("failed_delivery", "high",
                            "Penerima tidak dapat ditemui. Membutuhkan tindak lanjut operasional.", null)
                    }
                } else null
            )

            RouteStateStrip(routePreview)
            LocationGateStatus(order = order, targetPickup = flowState.targetIsPickup)

            if (!flowState.deliveryDone) {
                ActionButton(
                    icon = Icons.Default.Navigation,
                    label = if (flowState.targetIsPickup) "Navigasi ke pickup" else "Navigasi ke penerima",
                    prominent = false,
                    onClick = { openNavigation(context, flowState.activeAddress) }
                )
            }

            SyncStateNotice(order = order)
            OnDemandProgressTimeline(pickupDone = flowState.pickupDone, deliveryDone = flowState.deliveryDone, isServiceOrder = false)

            if (!flowState.pickupDone) {
                // FB-105: order food tampilkan isi pesanan (snapshot
                // food_order_items) — driver tidak boleh buta terhadap
                // menu yang dijemput. Parcel tetap pakai checklist paket.
                if (order.foodItems.isNotEmpty()) {
                    FoodItemsCard(order = order)
                } else {
                    PackageChecklistCard(order = order, deliveryDone = flowState.deliveryDone)
                }
                MandatoryPickupChecklist(
                    faceDone = faceVerifiedForPickup,
                    scanDone = pickupScanVerified,
                    photoDone = pickupPhotoVerified
                )
                order.itemDescription?.takeIf { it.isNotBlank() }?.let {
                    VerificationNotice("Isi paket: $it. Pastikan foto memperlihatkan kondisi barang sebelum dibawa.")
                }
            } else if (!flowState.deliveryDone) {
                VerificationNotice("Pickup lengkap. Bukti terima wajib diambil saat paket sudah diserahkan ke penerima.")
            } else {
                VerificationNotice("Pengiriman selesai. Tidak ada tindakan lanjutan untuk pekerjaan ini.")
            }

            OnDemandSupportActions(
                pickupDone = flowState.pickupDone,
                onChatClick = onChatClick,
                onCallClick = onCallClick,
                onSosClick = onSosClick,
                onIssueClick = { showIssueDialog = true },
                onCancelPickupClick = { showCancelPickupDialog = true }
            )
        }
    }

    if (showCancelPickupDialog) {
        CancelPickupDialog(
            order = order,
            cancelPickupReasons = cancelPickupReasons,
            onDismiss = { showCancelPickupDialog = false },
            onSubmit = { reasonCode, reasonNote, photoFile ->
                showCancelPickupDialog = false
                onCancelPickup(reasonCode, reasonNote, photoFile)
            }
        )
    }

    if (showIssueDialog) {
        CourierIssueReportDialog(
            order = order,
            pickupDone = flowState.pickupDone,
            onDismiss = { showIssueDialog = false },
            onSubmit = { eventType, severity, message, photoFile ->
                showIssueDialog = false
                onReportIssue(eventType, severity, message, photoFile)
            }
        )
    }
}

@Composable
private fun OnDemandJobHeader(order: Order, phaseTitle: String, phaseInstruction: String) {
    // Di mode DARK: bg = DeepForest (hijau sangat gelap) → teks aksen harus TERANG:
    // DarkAccentLight #FDA66A (9.79:1). Di light: AccentDark #C2410C di bg terang.
    val isDark = isSystemInDarkTheme()
    val accentOnHeader = if (isDark) DarkAccentLight else AccentDark
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = DeepForest,
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(color = LogisticsOrange, shape = RoundedCornerShape(8.dp)) {
                Icon(Icons.Default.Bolt, contentDescription = null, tint = Color.Black, modifier = Modifier.padding(9.dp).size(20.dp))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(phaseTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = Color.White)
                Text(order.displayServiceName(), style = MaterialTheme.typography.labelLarge, color = accentOnHeader, fontWeight = FontWeight.Black)
                Text(phaseInstruction, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.76f))
            }
            Surface(color = Color.White.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                Text(
                    order.estimatedNetEarningsIdr().toRupiahCompact(),
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
private fun OnDemandProgressTimeline(pickupDone: Boolean, deliveryDone: Boolean, isServiceOrder: Boolean = false) {
    if (isServiceOrder) {
        Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
            OnDemandTimelineItem(
                icon = Icons.Default.Build,
                title = "Tiba di lokasi",
                subtitle = "Verifikasi identitas di titik layanan",
                done = pickupDone,
                active = !pickupDone
            )
            OnDemandTimelineItem(
                icon = Icons.Default.Settings,
                title = "Proses perbaikan",
                subtitle = "Kerjakan layanan sesuai pesanan customer",
                done = deliveryDone,
                active = pickupDone && !deliveryDone
            )
            OnDemandTimelineItem(
                icon = Icons.Default.CameraAlt,
                title = "Selesai & Dokumentasi",
                subtitle = "Foto hasil pekerjaan sebagai bukti",
                done = deliveryDone,
                active = false,
                showConnector = false
            )
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
            OnDemandTimelineItem(
                icon = Icons.Default.Storefront,
                title = "Jemput barang",
                subtitle = "Scan kode paket dan foto barang di titik pickup",
                done = pickupDone,
                active = !pickupDone
            )
            OnDemandTimelineItem(
                icon = Icons.Default.Navigation,
                title = "Perjalanan ke penerima",
                subtitle = "Navigasi aktif setelah pickup tervalidasi",
                done = deliveryDone,
                active = pickupDone && !deliveryDone
            )
            OnDemandTimelineItem(
                icon = Icons.Default.CameraAlt,
                title = "Bukti Terima",
                subtitle = "Foto bukti terima di titik penerima",
                done = deliveryDone,
                active = false,
                showConnector = false
            )
        }
    }
}

@Composable
private fun OnDemandTimelineItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    done: Boolean,
    active: Boolean,
    showConnector: Boolean = true
) {
    val color = when {
        done -> Success
        active -> LogisticsOrange
        else -> MaterialTheme.colorScheme.outline
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Surface(
                modifier = Modifier.size(34.dp),
                color = color.copy(alpha = if (done || active) 0.16f else 0.08f),
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(1.dp, color.copy(alpha = 0.34f))
            ) {
                Icon(
                    imageVector = if (done) Icons.Default.CheckCircle else icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.padding(8.dp)
                )
            }
            if (showConnector) {
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(22.dp)
                        .padding(vertical = 2.dp)
                        .then(Modifier)
                ) {
                    Surface(modifier = Modifier.fillMaxSize(), color = color.copy(alpha = 0.28f)) {}
                }
            }
        }
        Column(modifier = Modifier.padding(top = 2.dp).weight(1f)) {
            // done/active: colorScheme.primary (dark=#239158 terang di bg gelap; light=#005C32 di bg terang).
            // JANGAN DeepForest/Primary hardcode — gelap-on-gelap = samar (rasio 1:1 / 1.79).
            Text(title, fontWeight = FontWeight.Bold, color = if (done || active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            Text(subtitle, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun OnDemandCurrentStopCard(
    title: String,
    address: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    gateLabel: String
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = OnDemandSurface,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.16f))
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(color = Color.White, shape = RoundedCornerShape(8.dp)) {
                Icon(icon, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(9.dp).size(20.dp))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black, color = DeepForest)
                Text(address, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 3, overflow = TextOverflow.Ellipsis)
                Text(gateLabel, style = MaterialTheme.typography.labelMedium, color = Primary, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun OnDemandProofPanel(
    title: String,
    subtitle: String,
    primaryIcon: androidx.compose.ui.graphics.vector.ImageVector,
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryIcon: androidx.compose.ui.graphics.vector.ImageVector,
    secondaryLabel: String,
    onSecondary: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.18f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = onPrimary,
                    modifier = Modifier.weight(1f).height(52.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.Black)
                ) {
                    Icon(primaryIcon, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(primaryLabel, fontWeight = FontWeight.Black)
                }
                OutlinedButton(
                    onClick = onSecondary,
                    modifier = Modifier.weight(1f).height(52.dp),
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, Primary.copy(alpha = 0.42f))
                ) {
                    Icon(secondaryIcon, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(secondaryLabel, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun CourierNextActionPanel(
    flowState: CourierFlowState,
    onClick: () -> Unit,
    onSecondaryClick: (() -> Unit)? = null,
    helperTextOverride: String? = null
) {
    val action = flowState.nextAction
    val hasAction = action.type != CourierNextActionType.NONE
    val secondary = flowState.secondaryAction
    // bg adaptif: jangan oranye 12% transparan di bg gelap (jadi brownish — teks samar).
    val isDark = isSystemInDarkTheme()
    val panelBgColor = if (isDark) DarkSurfaceVariant else com.tembus.courier.ui.theme.Surface
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = panelBgColor,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(
            1.dp,
            if (hasAction) LogisticsOrange.copy(alpha = 0.5f) else Success.copy(alpha = 0.5f)
        )
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Surface(color = Color.White, shape = RoundedCornerShape(8.dp)) {
                    Icon(
                        courierActionIcon(action.type),
                        contentDescription = null,
                        tint = if (hasAction) LogisticsOrange else Success,
                        modifier = Modifier.padding(8.dp).size(20.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Aksi berikutnya", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onSurface)
                    Text(
                        helperTextOverride ?: action.helperText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (hasAction) {
                val isSwipeAction = action.type == CourierNextActionType.START_DELIVERY ||
                    action.type == CourierNextActionType.COMPLETE_DELIVERY ||
                    action.type == CourierNextActionType.ACCEPT_OFFER
                if (isSwipeAction) {
                    SwipeToActionTrack(
                        label = "SWIPE UNTUK ${action.label.uppercase()}  →",
                        icon = courierActionIcon(action.type),
                        onAction = onClick
                    )
                } else {
                    Button(
                        onClick = onClick,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.White)
                    ) {
                        Icon(courierActionIcon(action.type), contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(action.label, fontWeight = FontWeight.Black)
                    }
                }
                // S2-OS-03: Secondary action for on-demand failed delivery
                if (secondary != null && onSecondaryClick != null) {
                    OutlinedButton(
                        onClick = onSecondaryClick,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.55f))
                    ) {
                        Icon(courierActionIcon(secondary.type), contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(secondary.label, fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                Text(action.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = Success)
            }
        }
    }
}

@Composable
private fun SwipeToActionTrack(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onAction: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val density = LocalDensity.current
    var trackWidthPx by remember { mutableFloatStateOf(0f) }
    val swipeProgress = remember { Animatable(0f) }
    var hasTriggered by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val thumbSize = 52.dp
    val trackPadding = 4.dp
    val threshold = 0.80f

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(thumbSize + trackPadding * 2)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White)
            .border(BorderStroke(2.dp, LogisticsOrange), RoundedCornerShape(8.dp))
            .onSizeChanged { size -> trackWidthPx = size.width.toFloat() }
    ) {
        val progressWidth by swipeProgress.asState()
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxHeight()
                .width(with(density) { (progressWidth * trackWidthPx).toDp() }.coerceAtMost(
                    with(density) { trackWidthPx.toDp() }
                ))
                .clip(RoundedCornerShape(8.dp))
                .background(LogisticsOrange.copy(alpha = 0.35f))
        )

        if (progressWidth < 0.05f) {
            Text(
                text = label,
                modifier = Modifier.align(Alignment.Center),
                color = DeepForest,
                fontWeight = FontWeight.Black,
                fontSize = 14.sp
            )
        }

        val thumbOffsetPx = swipeProgress.value * (trackWidthPx - with(density) { thumbSize.toPx() })
        Box(
            modifier = Modifier
                .offset { IntOffset(thumbOffsetPx.toInt(), 0) }
                .padding(trackPadding)
                .size(thumbSize - trackPadding * 2)
                .clip(RoundedCornerShape(6.dp))
                .background(LogisticsOrange)
                .pointerInput(Unit) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            scope.launch {
                                if (swipeProgress.value >= threshold && !hasTriggered) {
                                    hasTriggered = true
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    swipeProgress.animateTo(
                                        1f,
                                        animationSpec = tween(150, easing = FastOutSlowInEasing)
                                    )
                                    onAction()
                                } else if (!hasTriggered) {
                                    swipeProgress.animateTo(
                                        0f,
                                        animationSpec = tween(300, easing = FastOutSlowInEasing)
                                    )
                                }
                            }
                        },
                        onHorizontalDrag = { _, dragAmount ->
                            if (!hasTriggered) {
                                scope.launch {
                                    val delta = dragAmount / (trackWidthPx - with(density) { thumbSize.toPx() })
                                    val newValue = (swipeProgress.value + delta).coerceIn(0f, 1f)
                                    swipeProgress.snapTo(newValue)
                                }
                            }
                        }
                    )
                },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = Color.Black,
                modifier = Modifier.size(22.dp)
            )
        }
    }
}

@Composable
private fun SyncStateNotice(order: Order) {
    val (text, color, icon) = when {
        order.needsPodSync -> Triple(
            "Bukti tersimpan di perangkat. Menunggu sinkronisasi otomatis.",
            LogisticsOrange,
            Icons.Default.CloudUpload
        )
        order.needsScanSync -> Triple(
            "Scan tersimpan di perangkat. Menunggu sinkronisasi otomatis.",
            LogisticsOrange,
            Icons.Default.Sync
        )
        order.needsSync -> Triple(
            "Tahap pengiriman tersimpan lokal. Menunggu sinkronisasi status.",
            LogisticsOrange,
            Icons.Default.Sync
        )
        order.proofSyncedAt != null -> Triple(
            "Bukti sudah tersinkron ke server.",
            Success,
            Icons.Default.CloudDone
        )
        else -> Triple(
            "Data tugas tersinkron.",
            Success,
            Icons.Default.CheckCircle
        )
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = color.copy(alpha = 0.10f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, color.copy(alpha = 0.32f))
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = DeepForest, fontWeight = FontWeight.Medium)
        }
    }
}

private fun runCourierNextAction(
    context: android.content.Context,
    flowState: CourierFlowState,
    onVerifyFace: () -> Unit,
    onVerifyPickup: () -> Unit,
    onCapturePickupProof: () -> Unit,
    onCapturePod: () -> Unit,
    onUpdateStatus: (String) -> Unit,
    onStartDelivery: (String) -> Unit,
    onChatClick: () -> Unit,
    onReportFailedDelivery: () -> Unit = {}
) {
    when (flowState.nextAction.type) {
        CourierNextActionType.VERIFY_FACE_PICKUP -> onVerifyFace()
        CourierNextActionType.NAVIGATE_TO_PICKUP,
        CourierNextActionType.NAVIGATE_TO_DROPOFF -> openNavigation(context, flowState.activeAddress)
        CourierNextActionType.SCAN_PICKUP -> onVerifyPickup()
        CourierNextActionType.CAPTURE_PICKUP_PHOTO -> onCapturePickupProof()
        CourierNextActionType.START_DELIVERY -> onStartDelivery(flowState.nextAction.targetStatus ?: "in_transit")
        CourierNextActionType.CAPTURE_DELIVERY_PROOF -> onCapturePod()
        CourierNextActionType.REPORT_FAILED_DELIVERY -> onReportFailedDelivery()
        CourierNextActionType.CONTACT_SUPPORT -> onChatClick()
        CourierNextActionType.ACCEPT_OFFER,
        CourierNextActionType.COMPLETE_DELIVERY,
        CourierNextActionType.NONE -> Unit
    }
}

private fun courierActionIcon(type: CourierNextActionType): androidx.compose.ui.graphics.vector.ImageVector {
    return when (type) {
        CourierNextActionType.VERIFY_FACE_PICKUP -> Icons.Default.Face
        CourierNextActionType.ACCEPT_OFFER -> Icons.Default.AssignmentTurnedIn
        CourierNextActionType.NAVIGATE_TO_PICKUP,
        CourierNextActionType.NAVIGATE_TO_DROPOFF -> Icons.Default.Navigation
        CourierNextActionType.SCAN_PICKUP -> Icons.Default.QrCodeScanner
        CourierNextActionType.CAPTURE_PICKUP_PHOTO,
        CourierNextActionType.CAPTURE_DELIVERY_PROOF -> Icons.Default.CameraAlt
        CourierNextActionType.START_DELIVERY -> Icons.Default.LocalShipping
        CourierNextActionType.COMPLETE_DELIVERY -> Icons.Default.CheckCircle
        CourierNextActionType.REPORT_FAILED_DELIVERY -> Icons.Default.AssignmentLate
        CourierNextActionType.CONTACT_SUPPORT -> Icons.AutoMirrored.Filled.Chat
        CourierNextActionType.NONE -> Icons.Default.CheckCircle
    }
}

@Composable
private fun MandatoryPickupChecklist(
    faceDone: Boolean,
    scanDone: Boolean,
    photoDone: Boolean
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = PrimaryLight.copy(alpha = 0.62f),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.14f))
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "Syarat mulai pengantaran",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Black,
                color = DeepForest
            )
            VerificationRequirementRow(
                done = faceDone,
                label = "Verifikasi Wajah",
                description = "Membuktikan kamu yang mengambil barang, mencegah penyalahgunaan akun."
            )
            VerificationRequirementRow(
                done = scanDone,
                label = "Scan Kode Paket atau input kode paket",
                description = "Mencocokkan paket dengan order aktif."
            )
            VerificationRequirementRow(
                done = photoDone,
                label = "Foto Barang Saat Pickup",
                description = "Bukti kondisi barang sebelum dibawa."
            )
        }
    }
}

// FoodItemsCard — FB-105: daftar isi pesanan food untuk driver
// (snapshot food_order_items dari backend). Menampilkan nama, qty,
// dan catatan per item — driver tahu apa yang dijemput/diantar.
@Composable
private fun FoodItemsCard(order: Order) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.16f))
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Isi Pesanan", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black, color = DeepForest)
                    Text("${order.foodItems.size} item makanan", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                    Text(
                        "FOOD",
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                        color = Primary,
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }

            order.foodItems.forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        "${item.quantity}×",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Black,
                        color = Primary
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(item.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = DeepForest)
                        // FB-108: pilihan varian — driver harus tahu persis isi
                        // pesanan yang diserah terima (mis. "Level Pedas: Extra Pedas").
                        if (item.variants.isNotEmpty()) {
                            Text(
                                item.variants.joinToString(" · ") { v ->
                                    "${v.variantName}${if (v.variantName.isBlank()) "" else ": "}${v.optionName}"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (!item.notes.isNullOrBlank()) {
                            Text(
                                "Catatan: ${item.notes}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                HorizontalDivider(color = Primary.copy(alpha = 0.08f))
            }
        }
    }
}

@Composable
private fun PackageChecklistCard(order: Order, deliveryDone: Boolean) {
    val packageItems = order.packages
    val hasPackageRows = packageItems.isNotEmpty()
    val countLabel = if (hasPackageRows) packageItems.size else order.packageCount.coerceAtLeast(1)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.16f))
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Checklist paket", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black, color = DeepForest)
                    Text("$countLabel paket dalam order ini", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                    Text(
                        if (deliveryDone) "POD" else "Aktif",
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                        color = Primary,
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }

            if (!hasPackageRows) {
                VerificationRequirementRow(
                    done = order.packageCount <= 1 || order.pickupScanVerified || order.pickupPhotoVerified,
                    label = "Paket utama",
                    description = "Detail paket belum tersinkron per item. Backend tetap memvalidasi jumlah paket dan bukti."
                )
                return@Column
            }

            packageItems.forEachIndexed { index, item ->
                val pickupDone = item.pickupScanDone() && item.pickupPhotoDone()
                val podDone = item.podDone()
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = if (podDone) Success.copy(alpha = 0.10f) else PrimaryLight.copy(alpha = 0.42f),
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, if (podDone) Success.copy(alpha = 0.36f) else Primary.copy(alpha = 0.12f))
                ) {
                    Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Surface(
                            modifier = Modifier.size(32.dp),
                            color = if (podDone) Success.copy(alpha = 0.16f) else Color.White,
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Text("${index + 1}", fontWeight = FontWeight.Black, color = if (podDone) Success else DeepForest)
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(item.displayCode(), fontWeight = FontWeight.Bold, color = DeepForest)
                            Text(
                                item.description?.takeIf { it.isNotBlank() } ?: item.sizeTier?.takeIf { it.isNotBlank() } ?: "Paket ${index + 1}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(if (pickupDone) "Pickup OK" else "Pickup", style = MaterialTheme.typography.labelSmall, color = if (pickupDone) Success else LogisticsOrange, fontWeight = FontWeight.Bold)
                            Text(if (podDone) "POD OK" else "POD", style = MaterialTheme.typography.labelSmall, color = if (podDone) Success else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RegularFailedDeliveryPanel(order: Order, onReportFailed: () -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.error.copy(alpha = 0.08f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.28f))
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Default.EventRepeat, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Gagal antar regular", fontWeight = FontWeight.Black, color = DeepForest)
                    Text(
                        "Sistem akan menjadwalkan ulang sampai batas service. Setelah batas tercapai, order masuk return required.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        "Policy: ${order.serviceFailedDeliveryPolicy.replace('_', ' ')}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            OutlinedButton(
                onClick = onReportFailed,
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.55f))
            ) {
                Icon(Icons.Default.AssignmentLate, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Laporkan gagal antar", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun VerificationRequirementRow(
    done: Boolean,
    label: String,
    description: String
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Surface(
            shape = RoundedCornerShape(8.dp),
            color = if (done) Success.copy(alpha = 0.14f) else Color.White,
            border = BorderStroke(1.dp, if (done) Success.copy(alpha = 0.5f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.18f))
        ) {
            Icon(
                imageVector = if (done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (done) Success else if (isSystemInDarkTheme()) DarkAccentLight else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(8.dp).size(18.dp)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(label, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(
            text = if (done) "OK" else "Wajib",
            style = MaterialTheme.typography.labelMedium,
            color = if (done) Success else if (isSystemInDarkTheme()) DarkAccentLight else LogisticsOrange,
            fontWeight = FontWeight.Black
        )
    }
}

@Composable
private fun OnDemandSupportActions(
    pickupDone: Boolean,
    onChatClick: () -> Unit,
    onCallClick: () -> Unit,
    onSosClick: () -> Unit,
    onIssueClick: () -> Unit,
    onCancelPickupClick: () -> Unit,
    showCancelPickup: Boolean = true
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            CompactActionButton(icon = Icons.AutoMirrored.Filled.Chat, label = "Chat", onClick = onChatClick, modifier = Modifier.weight(1f))
            CompactActionButton(icon = Icons.Default.Phone, label = "Telepon", onClick = onCallClick, modifier = Modifier.weight(1f))
        }
        if (showCancelPickup && !pickupDone) {
            OutlinedButton(
                onClick = onCancelPickupClick,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.7f))
            ) {
                Icon(Icons.Default.Cancel, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Batalkan pickup", fontWeight = FontWeight.Bold)
            }
        }
        // Sekunder: outline kecil (bukan full-width 52dp) — kurangi kompetisi dengan CTA utama.
        OutlinedButton(
            onClick = onIssueClick,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary),
            border = BorderStroke(1.dp, Primary.copy(alpha = 0.55f))
        ) {
            Icon(Icons.Default.AssignmentLate, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Laporkan kendala pekerjaan", fontWeight = FontWeight.Bold)
        }
        // SOS: text button merah tegas (ikon + label) — penting, tapi bukan blok merah
        // yang mendominasi & berisiko salah tekan (standar Gojek/Grab).
        TextButton(
            onClick = onSosClick,
            modifier = Modifier.fillMaxWidth().height(44.dp),
            colors = ButtonDefaults.textButtonColors(
                contentColor = MaterialTheme.colorScheme.error,
                disabledContentColor = MaterialTheme.colorScheme.error.copy(alpha = 0.4f)
            )
        ) {
            Icon(Icons.Default.ReportProblem, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(6.dp))
            Text("SOS bantuan operasional", fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CancelPickupDialog(
    order: Order,
    cancelPickupReasons: List<CancelPickupReason>,
    onDismiss: () -> Unit,
    onSubmit: (reasonCode: String, reasonNote: String?, photoFile: File) -> Unit
) {
    val context = LocalContext.current
    val reasonSignature = cancelPickupReasons.joinToString("|") { it.code }
    var selectedReasonCode by rememberSaveable(order.orderId, reasonSignature) {
        mutableStateOf(cancelPickupReasons.firstOrNull()?.code)
    }
    LaunchedEffect(reasonSignature) {
        if (cancelPickupReasons.none { it.code == selectedReasonCode }) {
            selectedReasonCode = cancelPickupReasons.firstOrNull()?.code
        }
    }
    val selectedReason = cancelPickupReasons.firstOrNull { it.code == selectedReasonCode }
    var note by rememberSaveable(order.orderId) { mutableStateOf("") }
    var proofBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var submitAttempted by remember { mutableStateOf(false) }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) proofBitmap = bitmap
    }
    val photoMissing = submitAttempted && proofBitmap == null
    val reasonMissing = submitAttempted && selectedReason == null
    val noteMissing = submitAttempted && selectedReason?.code == "other" && note.isBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Batalkan Pickup", fontWeight = FontWeight.Black) },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 520.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "Gunakan hanya sebelum scan/input kode dan foto pickup selesai. Setelah pickup tervalidasi, paket wajib diantar.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Pilih alasan", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                    if (cancelPickupReasons.isEmpty()) {
                        Text(
                            "Alasan pembatalan sedang disinkronkan.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    } else {
                        cancelPickupReasons.forEach { reason ->
                            FilterChip(
                                selected = selectedReasonCode == reason.code,
                                onClick = { selectedReasonCode = reason.code },
                                label = {
                                    Column(modifier = Modifier.padding(vertical = 4.dp)) {
                                        Text(reason.title, fontWeight = FontWeight.Bold)
                                        Text(reason.description, style = MaterialTheme.typography.labelSmall)
                                    }
                                },
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }
                }
                if (reasonMissing) {
                    Text("Pilih alasan pembatalan dari konfigurasi server.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it.take(300) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text(if (selectedReason?.code == "other") "Catatan wajib" else "Catatan tambahan") },
                    minLines = 2,
                    supportingText = {
                        Text("${note.length}/300")
                    },
                    isError = noteMissing
                )
                if (noteMissing) {
                    Text("Catatan wajib untuk alasan lainnya.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                }
                OutlinedButton(
                    onClick = { cameraLauncher.launch(null) },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = if (proofBitmap == null) MaterialTheme.colorScheme.error else Success),
                    border = BorderStroke(1.dp, if (proofBitmap == null) MaterialTheme.colorScheme.error.copy(alpha = 0.7f) else Success.copy(alpha = 0.7f))
                ) {
                    Icon(if (proofBitmap == null) Icons.Default.CameraAlt else Icons.Default.CheckCircle, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (proofBitmap == null) "Ambil foto bukti" else "Foto bukti siap", fontWeight = FontWeight.Bold)
                }
                if (photoMissing) {
                    Text("Foto bukti wajib untuk pembatalan pickup.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    submitAttempted = true
                    val bitmap = proofBitmap
                    val reason = selectedReason
                    if (bitmap != null && reason != null && !(reason.code == "other" && note.isBlank())) {
                        onSubmit(reason.code, note.takeIf { it.isNotBlank() }, saveCancellationPhoto(context, order.orderId, bitmap))
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
            ) {
                Text("Kirim pembatalan")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Kembali")
            }
        }
    )
}

private fun saveCancellationPhoto(context: android.content.Context, orderId: String, bitmap: Bitmap): File {
    val safeOrderId = orderId.replace(Regex("[^A-Za-z0-9_-]"), "_")
    val file = File(context.cacheDir, "pickup_cancel_${safeOrderId}_${System.currentTimeMillis()}.jpg")
    FileOutputStream(file).use { out ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 88, out)
    }
    return file
}

@Composable
private fun RouteStateStrip(routePreview: CourierRoutePreview?) {
    if (routePreview == null) {
        Surface(
            color = LogisticsOrange.copy(alpha = 0.10f),
            shape = RoundedCornerShape(8.dp),
            border = BorderStroke(1.dp, LogisticsOrange.copy(alpha = 0.34f)),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(10.dp),
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.Route, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(18.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Rute sedang dimuat", fontWeight = FontWeight.Bold, color = DeepForest)
                    Text(
                        "Jika peta belum siap, gunakan tombol navigasi eksternal. Estimasi garis lurus tidak dianggap rute resmi.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
        return
    }

    RoutePreviewStrip(routePreview)
}

@Composable
private fun RoutePreviewStrip(routePreview: CourierRoutePreview) {
    val snapshot = routePreview.routeSnapshot
    val distanceKm = snapshot?.distanceKm?.takeIf { it > 0.0 } ?: routePreview.distanceKm
    val etaMinutes = snapshot?.etaMinutes?.takeIf { it > 0 } ?: routePreview.etaMinutes
    val provider = snapshot?.activeProvider?.takeIf { it.isNotBlank() }
        ?: snapshot?.provider?.takeIf { it.isNotBlank() }
        ?: routePreview.provider
    val hasRouteGeometry = !routePreview.routePolyline.isNullOrBlank() || !snapshot?.routePolyline.isNullOrBlank()
    val fallbackReason = routePreview.fallbackReason?.takeIf { it.isNotBlank() }
        ?: snapshot?.fallbackReason?.takeIf { it.isNotBlank() }
    val hasFallback = fallbackReason != null
    val unavailable = distanceKm <= 0.0 || etaMinutes <= 0
    Surface(
        color = Color.White.copy(alpha = 0.82f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.26f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Icon(
                if (unavailable) Icons.Default.LocationOff else Icons.Default.Route,
                contentDescription = null,
                tint = if (unavailable) LogisticsOrange else Primary,
                modifier = Modifier.size(20.dp)
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    when {
                        unavailable -> "Rute belum tersedia"
                        hasFallback || !hasRouteGeometry -> "Rute estimasi"
                        else -> "Preview rute"
                    },
                    fontWeight = FontWeight.Bold,
                    color = DeepForest
                )
                Text(
                    if (unavailable) {
                        "Gunakan navigasi eksternal sambil menunggu route provider."
                    } else {
                        "${String.format(Locale.US, "%.1f", distanceKm)} km • ETA $etaMinutes menit"
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (!hasRouteGeometry || hasFallback || unavailable) {
                    Text(
                        fallbackReason ?: "Estimasi sementara. Garis fallback bukan rute resmi.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                Text(provider.uppercase(Locale.getDefault()), modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp), style = MaterialTheme.typography.labelSmall, color = Primary, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun LocationGateStatus(order: Order, targetPickup: Boolean) {
    val context = LocalContext.current
    val targetLat = if (targetPickup) order.pickupLatitude else order.dropLatitude
    val targetLng = if (targetPickup) order.pickupLongitude else order.dropLongitude
    val radiusM = order.serviceProofGeofenceRadiusM.coerceIn(1, 100)
    val minAccuracyM = order.serviceProofMinAccuracyM.coerceIn(1, 500)
    var distanceM by remember(order.orderId, targetPickup) { mutableStateOf<Int?>(null) }
    var accuracyM by remember(order.orderId, targetPickup) { mutableStateOf<Int?>(null) }
    var permissionMissing by remember { mutableStateOf(false) }

    LaunchedEffect(order.orderId, targetPickup, targetLat, targetLng) {
        while (true) {
            val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (!hasPermission) {
                permissionMissing = true
                return@LaunchedEffect
            }
            permissionMissing = false

            if (targetLat != null && targetLng != null) {
                val location = withTimeoutOrNull(3_000L) {
                    LocationServices.getFusedLocationProviderClient(context)
                        .getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, CancellationTokenSource().token)
                        .await()
                }
                if (location != null) {
                    val result = FloatArray(1)
                    Location.distanceBetween(location.latitude, location.longitude, targetLat, targetLng, result)
                    distanceM = result[0].toInt()
                    accuracyM = location.accuracy.toInt()
                }
            }
            delay(10_000L)
        }
    }

    val ready = distanceM != null && distanceM!! <= radiusM && (accuracyM == null || accuracyM!! <= minAccuracyM)
    val copy = when {
        permissionMissing -> "GPS belum diizinkan. Aktifkan permission lokasi untuk validasi titik."
        targetLat == null || targetLng == null -> "Koordinat titik belum lengkap. Laporkan kendala lokasi jika titik operasional tidak sesuai."
        distanceM == null -> "Mengecek jarak ke titik ${if (targetPickup) "pickup" else "tujuan"}..."
        ready -> "Lokasi valid: ${distanceM}m dari titik, akurasi ${accuracyM ?: 0}m."
        else -> "Belum di titik ${if (targetPickup) "pickup" else "tujuan"}: ${distanceM}m dari radius ${radiusM}m."
    }
    val color = if (ready) Success else LogisticsOrange

    Surface(
        color = color.copy(alpha = 0.12f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, color.copy(alpha = 0.45f))
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(if (ready) Icons.Default.GpsFixed else Icons.Default.LocationSearching, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(copy, style = MaterialTheme.typography.bodySmall, color = DeepForest, fontWeight = FontWeight.Medium)
                Text(
                    "Aturan bukti: radius maksimal ${radiusM}m dan akurasi maksimal ${minAccuracyM}m. GPS buruk harus retry atau override terkendali dari server.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun OnDemandStepper(pickupDone: Boolean, deliveryDone: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        StepPill("Pickup", active = !pickupDone, done = pickupDone, modifier = Modifier.weight(1f))
        StepPill("Antar", active = pickupDone && !deliveryDone, done = deliveryDone, modifier = Modifier.weight(1f))
        StepPill("Bukti", active = false, done = deliveryDone, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun StepPill(label: String, active: Boolean, done: Boolean, modifier: Modifier = Modifier) {
    val color = when {
        done -> Success
        active -> LogisticsOrange
        else -> Color.White
    }
    Surface(
        modifier = modifier,
        color = color,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.32f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = if (done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (done || active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(label, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = if (done || active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun VerificationNotice(text: String) {
    Surface(
        color = Color.White.copy(alpha = 0.74f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, LogisticsOrange.copy(alpha = 0.45f))
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(Icons.Default.GpsFixed, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(18.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = DeepForest)
        }
    }
}

@Composable
private fun CompactActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    strong: Boolean = false
) {
    // strong = tombol utama hijau: pakai Primary (#005C32, putih 8.15:1 PASS)
    // bukan DeepForest (#0A2F20) yang nyaris menyatu dgn bg gelap (vision 5/10).
    val container = if (strong) Primary else Color.White
    val content = if (strong) Color.White else DeepForest
    Button(
        onClick = onClick,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = content),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.28f)),
        contentPadding = PaddingValues(horizontal = 8.dp)
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun DeliveryStop(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color
) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.padding(8.dp).size(18.dp))
        }
        Column {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2)
        }
    }
}

@Composable
private fun OrderInfoCard(order: Order) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = if (order.isMaintenanceService()) "Detail Layanan" else "Detail Paket",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            if (!order.itemImageUrl.isNullOrBlank()) {
                AsyncImage(
                    model = order.itemImageUrl,
                    contentDescription = "Foto Paket",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .clip(RoundedCornerShape(8.dp)),
                    contentScale = ContentScale.Crop
                )
                Spacer(modifier = Modifier.height(16.dp))
            }

            InfoRow(label = "Order ID", value = shortOrderId(order.orderId))
            InfoRow(label = "Pelanggan", value = order.customerName)

            if (order.isMaintenanceService()) {
                // Service (tambal ban / towing): satu titik lokasi layanan + rincian biaya jasa.
                // Angka harus konsisten dgn OnDemandJobHeader: total = ESTIMASI BERSIH
                // (jasa + travel − komisi platform), bukan gross.
                val pb = order.pricingBreakdown
                InfoRow(label = "Lokasi Layanan", value = order.pickupAddress.ifBlank { order.dropAddress })
                InfoRow(label = "Waktu Pemesanan", value = order.pickupTime)
                InfoRow(label = "Biaya Jasa", value = "Rp${formatRp(pb?.serviceFeeIdr?.toLong() ?: 0L)}")
                InfoRow(label = "Biaya Perjalanan", value = "Rp${formatRp(pb?.travelFeeIdr?.toLong() ?: 0L)}")
                InfoRow(
                    label = "Estimasi Pendapatan Bersih",
                    value = "Rp${formatRp(order.estimatedNetEarningsIdr().toLong())}",
                    valueColor = Color(0xFF7BC043)
                )
            } else {
                InfoRow(label = "Pickup", value = order.pickupAddress)
                InfoRow(label = "Tujuan", value = order.dropAddress)
                InfoRow(label = "Waktu Pickup", value = order.pickupTime)
                InfoRow(label = "Jarak", value = order.distance)

                // FB-115: breakdown pendapatan — ongkir dasar + tip + total.
                val basePayout = order.estimatedNetEarningsIdr()
                val tipAmount = order.tipAmountIdr
                InfoRow(label = "Ongkir Dasar", value = "Rp${formatRp(basePayout.toLong())}")
                if (tipAmount > 0) {
                    InfoRow(
                        label = "Tip Customer",
                        value = "Rp${formatRp(tipAmount)}",
                        valueColor = Color(0xFF7BC043)
                    )
                }
                InfoRow(
                    label = "Total Pendapatan",
                    value = "Rp${formatRp((basePayout + tipAmount).toLong())}",
                    valueColor = Color(0xFF7BC043)
                )
                
                if (order.length != null || order.width != null || order.height != null) {
                    val dims = "${order.length ?: 0} x ${order.width ?: 0} x ${order.height ?: 0} cm"
                    InfoRow(label = "Dimensi", value = dims)
                }
                if (order.weight != null) {
                    InfoRow(label = "Berat", value = "${order.weight} kg")
                }
            }

            InfoRow(label = "Status", value = order.status.replace("_", " ").uppercase())
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String, valueColor: Color = Color.Unspecified) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(0.42f)
        )
        Text(
            text = value.ifBlank { "Data sedang disinkronkan" },
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = if (valueColor == Color.Unspecified) MaterialTheme.colorScheme.onSurface else valueColor,
            textAlign = TextAlign.End,
            modifier = Modifier.weight(0.58f)
        )
    }
    Spacer(modifier = Modifier.height(8.dp))
}

/** Potong UUID jadi 8 karakter pertama untuk tampilan kompak: f779a9c4… */
private fun shortOrderId(orderId: String): String =
    orderId.take(8).ifBlank { orderId }

/** Format angka ke rupiah tanpa desimal: 10000 → "10.000". */
private fun formatRp(value: Long): String {
    val s = value.toString()
    return s.reversed().chunked(3).joinToString(".").reversed()
}

@Composable
private fun ServiceChecklistCard(
    faceDone: Boolean,
    photoDone: Boolean
) {
    // bg adaptif: PrimaryLight di light mode / DarkSurfaceVariant di dark mode
    // (PrimaryLight transparan 0.62 di atas bg gelap = hijau gelap, teks jadi samar)
    val isDark = isSystemInDarkTheme()
    val cardBg = if (isDark) DarkSurfaceVariant else PrimaryLight.copy(alpha = 0.62f)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = cardBg,
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.14f))
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(
                "Syarat mulai layanan",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.onSurface
            )
            VerificationRequirementRow(
                done = faceDone,
                label = "Verifikasi Wajah",
                description = "Membuktikan identitas teknisi di lokasi, mencegah penyalahgunaan akun."
            )
            VerificationRequirementRow(
                done = photoDone,
                label = "Foto Kondisi Kendaraan",
                description = "Dokumentasi kondisi ban/velg sebelum dikerjakan sebagai bukti."
            )
        }
    }
}

private fun serviceTitle(order: Order): String {
    val sc = order.serviceCode.orEmpty().lowercase()
    return when {
        sc.startsWith("towing") -> "Layanan Towing"
        sc.startsWith("tambal_ban") -> "Layanan Tambal Ban"
        else -> "Layanan"
    }
}

private fun serviceNextActionHelper(order: Order): String {
    val sc = order.serviceCode.orEmpty().lowercase()
    return if (sc.startsWith("towing"))
        "Scan wajah untuk membuktikan identitas teknisi di lokasi kendaraan customer."
    else
        "Scan wajah untuk membuktikan identitas teknisi di lokasi layanan."
}

private fun servicePhaseTitle(order: Order): String {
    val sc = order.serviceCode.orEmpty().lowercase()
    return when {
        sc.startsWith("towing") -> "Proses Towing"
        sc.startsWith("tambal_ban") -> "Proses Tambal Ban"
        else -> "Proses Layanan"
    }
}

private fun servicePhaseInstruction(order: Order): String {
    val sc = order.serviceCode.orEmpty().lowercase()
    return when {
        sc.startsWith("towing") -> "Menuju lokasi kendaraan customer untuk layanan towing."
        sc.startsWith("tambal_ban") -> "Menuju lokasi kendaraan customer untuk perbaikan ban."
        else -> "Menuju lokasi layanan."
    }
}

@Composable
private fun OrderActions(
    order: Order,
    flowState: CourierFlowState,
    isServiceOrder: Boolean = false,
    onStatusClick: () -> Unit,
    onUpdateStatus: (String) -> Unit,
    onStartDelivery: (String) -> Unit,
    onVerifyPickup: () -> Unit,
    onCapturePickupProof: () -> Unit,
    onCapturePod: () -> Unit,
    onChatClick: () -> Unit,
    onCallClick: () -> Unit,
    onSosClick: () -> Unit,
    onVerifyFace: () -> Unit = {}
) {
    val context = LocalContext.current
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OnDemandJobHeader(
                order = order,
                phaseTitle = if (isServiceOrder) servicePhaseTitle(order) else flowState.title,
                phaseInstruction = if (isServiceOrder) servicePhaseInstruction(order) else flowState.instruction
            )

            OnDemandCurrentStopCard(
                title = if (isServiceOrder) "Lokasi Layanan" else flowState.activeAddressLabel,
                address = if (isServiceOrder) order.pickupAddress.ifBlank { "Alamat lokasi sedang disinkronkan" } else flowState.activeAddress,
                icon = if (isServiceOrder) Icons.Default.Build else if (flowState.targetIsPickup) Icons.Default.Storefront else Icons.Default.LocationOn,
                gateLabel = if (isServiceOrder) "Validasi di titik lokasi" else if (flowState.targetIsPickup) "Validasi di titik pickup" else "Validasi di titik penerima"
            )

            CourierNextActionPanel(
                flowState = flowState,
                helperTextOverride = if (isServiceOrder) serviceNextActionHelper(order) else null,
                onClick = {
                    runCourierNextAction(
                        context = context,
                        flowState = flowState,
                        onVerifyFace = onVerifyFace,
                        onVerifyPickup = onVerifyPickup,
                        onCapturePickupProof = onCapturePickupProof,
                        onCapturePod = onCapturePod,
                        onUpdateStatus = onUpdateStatus,
                        onStartDelivery = onStartDelivery,
                        onChatClick = onChatClick
                    )
                }
            )

            LocationGateStatus(order = order, targetPickup = flowState.targetIsPickup)

            if (!flowState.deliveryDone) {
                ActionButton(
                    icon = Icons.Default.Navigation,
                    label = if (isServiceOrder) "Navigasi ke lokasi layanan" else if (flowState.targetIsPickup) "Navigasi ke pickup" else "Navigasi ke penerima",
                    prominent = false,
                    onClick = { openNavigation(context, flowState.activeAddress) }
                )
            }

            SyncStateNotice(order = order)
            OnDemandProgressTimeline(pickupDone = flowState.pickupDone, deliveryDone = flowState.deliveryDone, isServiceOrder = isServiceOrder)

            if (isServiceOrder) {
                // Service order (tambal ban / towing): syarat = identitas + dokumentasi kendaraan,
                // BUKAN scan paket / foto barang pickup (itu template pengiriman paket).
                ServiceChecklistCard(
                    faceDone = flowState.pickupScanDone,
                    photoDone = flowState.pickupPhotoDone
                )
            } else if (!flowState.pickupDone) {
                PackageChecklistCard(order = order, deliveryDone = flowState.deliveryDone)
                MandatoryPickupChecklist(
                    faceDone = false,
                    scanDone = flowState.pickupScanDone,
                    photoDone = flowState.pickupPhotoDone
                )
            } else if (!flowState.deliveryDone) {
                PackageChecklistCard(order = order, deliveryDone = flowState.deliveryDone)
                VerificationNotice("Order regular sedang diantar. Ambil bukti terima setelah paket diserahkan.")
            }

            OnDemandSupportActions(
                pickupDone = flowState.pickupDone,
                onChatClick = onChatClick,
                onCallClick = onCallClick,
                onSosClick = onSosClick,
                onIssueClick = onChatClick,
                onCancelPickupClick = {},
                showCancelPickup = false
            )

            if (!flowState.deliveryDone && order.normalizedWorkflowRole() == "regular") {
                RegularFailedDeliveryPanel(order = order, onReportFailed = { onUpdateStatus("failed") })
            }

            TextButton(onClick = onStatusClick, modifier = Modifier.align(Alignment.End)) {
                Icon(Icons.Default.Tune, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Koreksi tahap")
            }
        }
    }
}

private data class CourierIssueReason(
    val code: String,
    val title: String,
    val description: String,
    val severity: String
)

@Composable
private fun CourierIssueReportDialog(
    order: Order,
    pickupDone: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (eventType: String, severity: String, message: String, photoFile: File) -> Unit
) {
    val context = LocalContext.current
    val isOnDemand = order.normalizedWorkflowRole() == "on_demand"
    val reasons = remember(order.orderId, isOnDemand, pickupDone) {
        if (pickupDone && isOnDemand) {
            listOf(
                CourierIssueReason("recipient_unavailable", "Penerima tidak tersedia", "Kurir sudah di tujuan tetapi penerima tidak bisa menerima paket.", "high"),
                CourierIssueReason("address_not_found", "Alamat tidak ditemukan", "Alamat tujuan tidak bisa diverifikasi dari lokasi atau navigasi.", "high"),
                CourierIssueReason("package_issue", "Masalah paket", "Paket rusak, tertukar, atau butuh pemeriksaan operasional.", "high"),
                CourierIssueReason("operational_assist", "Butuh bantuan operasional", "On-demand wajib diselesaikan, minta bantuan tanpa membuat return atau reschedule.", "high")
            )
        } else if (pickupDone) {
            listOf(
                CourierIssueReason("recipient_unavailable", "Penerima tidak tersedia", "Regular dapat dijadwalkan ulang sesuai policy percobaan maksimal.", "high"),
                CourierIssueReason("address_not_found", "Alamat tidak ditemukan", "Alamat tujuan tidak bisa diverifikasi dari lokasi atau navigasi.", "high"),
                CourierIssueReason("package_issue", "Masalah paket", "Paket rusak, tertukar, atau butuh pemeriksaan operasional.", "high"),
                CourierIssueReason("reschedule_required", "Perlu reschedule", "Regular delivery perlu percobaan ulang sesuai policy operasional.", "high")
            )
        } else {
            listOf(
                CourierIssueReason("address_not_found", "Pickup tidak ditemukan", "Alamat pickup tidak bisa diverifikasi dari lokasi atau navigasi.", "medium"),
                CourierIssueReason("package_issue", "Masalah barang pickup", "Barang tidak sesuai, rusak, atau tidak siap diserahkan.", "high"),
                CourierIssueReason("route_issue", "Kendala rute/lokasi", "Rute, titik GPS, atau akses lokasi butuh bantuan operasional.", "medium")
            )
        }
    }
    var selectedCode by rememberSaveable(order.orderId, pickupDone) { mutableStateOf(reasons.first().code) }
    var note by rememberSaveable(order.orderId, pickupDone) { mutableStateOf("") }
    var proofBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var submitAttempted by remember { mutableStateOf(false) }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) proofBitmap = bitmap
    }
    val selectedReason = reasons.firstOrNull { it.code == selectedCode } ?: reasons.first()
    val noteMissing = submitAttempted && note.trim().length < 8
    val photoMissing = submitAttempted && proofBitmap == null

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Laporkan Kendala", fontWeight = FontWeight.Black) },
        text = {
            Column(
                modifier = Modifier
                    .heightIn(max = 520.dp)
                    .verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    "Laporan dikirim ke operasional dengan order, lokasi terakhir, akurasi GPS, dan timestamp server.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                reasons.forEach { reason ->
                    FilterChip(
                        selected = selectedCode == reason.code,
                        onClick = { selectedCode = reason.code },
                        label = {
                            Column(modifier = Modifier.padding(vertical = 4.dp)) {
                                Text(reason.title, fontWeight = FontWeight.Bold)
                                Text(reason.description, style = MaterialTheme.typography.labelSmall)
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it.take(500) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Catatan operasional") },
                    minLines = 3,
                    supportingText = { Text("${note.length}/500") },
                    isError = noteMissing
                )
                if (noteMissing) {
                    Text("Tuliskan catatan minimal 8 karakter agar tim operasional punya konteks.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                }
                OutlinedButton(
                    onClick = { cameraLauncher.launch(null) },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = if (proofBitmap == null) MaterialTheme.colorScheme.error else Success),
                    border = BorderStroke(1.dp, if (proofBitmap == null) MaterialTheme.colorScheme.error.copy(alpha = 0.7f) else Success.copy(alpha = 0.7f))
                ) {
                    Icon(if (proofBitmap == null) Icons.Default.CameraAlt else Icons.Default.CheckCircle, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(if (proofBitmap == null) "Ambil foto bukti" else "Foto bukti siap", fontWeight = FontWeight.Bold)
                }
                if (photoMissing) {
                    Text("Foto bukti wajib untuk laporan kendala lapangan.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelSmall)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    submitAttempted = true
                    val trimmed = note.trim()
                    val bitmap = proofBitmap
                    if (trimmed.length >= 8 && bitmap != null) {
                        onSubmit(
                            selectedReason.code,
                            selectedReason.severity,
                            "${selectedReason.title}: $trimmed",
                            saveIssuePhoto(context, order.orderId, selectedReason.code, bitmap)
                        )
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.Black)
            ) {
                Text("Kirim laporan", fontWeight = FontWeight.Black)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Kembali")
            }
        }
    )
}

private fun saveIssuePhoto(context: android.content.Context, orderId: String, issueCode: String, bitmap: Bitmap): File {
    val safeOrderId = orderId.replace(Regex("[^A-Za-z0-9_-]"), "_")
    val safeIssueCode = issueCode.replace(Regex("[^A-Za-z0-9_-]"), "_")
    val file = File(context.cacheDir, "issue_${safeIssueCode}_${safeOrderId}_${System.currentTimeMillis()}.jpg")
    FileOutputStream(file).use { out ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 88, out)
    }
    return file
}

/**
 * S2-COURIER-02: Turn-by-turn navigation via TomTom SDK (with Google Maps/Waze fallback).
 * Uses coordinates when available for precise routing, falls back to address search.
 */
private fun openNavigation(
    context: android.content.Context,
    address: String,
    lat: Double? = null,
    lng: Double? = null,
    label: String? = null
) {
    if (lat != null && lng != null && lat != 0.0 && lng != 0.0) {
        NavigationHelper.navigateTo(context, lat, lng, label ?: address)
        return
    }

    // Fallback: address-based search via Google Maps intent
    try {
        val gmmIntentUri = Uri.parse("geo:0,0?q=${Uri.encode(address)}")
        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
        mapIntent.setPackage("com.google.android.apps.maps")
        val resolved = mapIntent.resolveActivity(context.packageManager)
        if (resolved != null) {
            context.startActivity(mapIntent)
            return
        }
    } catch (_: Exception) { }

    // Last resort: chooser
    try {
        val geoUri = Uri.parse("geo:0,0?q=${Uri.encode(address)}")
        val chooser = Intent.createChooser(Intent(Intent.ACTION_VIEW, geoUri), "Pilih Aplikasi Navigasi")
        context.startActivity(chooser)
    } catch (e: Exception) {
        android.widget.Toast.makeText(context, "Tidak ada aplikasi navigasi terinstall.", android.widget.Toast.LENGTH_SHORT).show()
    }
}

@Composable
private fun ActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    prominent: Boolean = false,
    containerColor: Color = Secondary,
    contentColor: Color = Color.White,
    onClick: () -> Unit
) {
    val colors = if (prominent) {
        ButtonDefaults.buttonColors(containerColor = containerColor, contentColor = contentColor)
    } else {
        ButtonDefaults.outlinedButtonColors(contentColor = Primary)
    }
    val border = if (prominent) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline)

    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(52.dp),
        shape = RoundedCornerShape(8.dp),
        colors = colors,
        border = border
    ) {
        Icon(icon, contentDescription = null)
        Spacer(modifier = Modifier.width(8.dp))
        Text(label)
    }
    Spacer(modifier = Modifier.height(8.dp))
}

@Composable
private fun OrderStatusOptions(
    currentStatus: String,
    selectedStatus: String,
    transitions: List<OrderStatusTransition>,
    onSelect: (String) -> Unit
) {
    val options = transitions
        .filter { it.fromStatus.equals(currentStatus, ignoreCase = true) && !it.requiresAdmin }
        .sortedWith(compareBy<OrderStatusTransition> { it.displayOrder }.thenBy { it.label })

    Column {
        if (options.isEmpty()) {
            Text(
                text = "Aturan transisi status sedang disinkronkan.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            return@Column
        }

        options.forEach { option ->
            val enabled = !option.requiresProof
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(text = option.label)
                    Text(
                        text = option.description
                            ?: option.toStatus.replace("_", " ").uppercase(),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    if (option.requiresProof) {
                        Text(
                            text = "Wajib lewat bukti pickup atau bukti terima",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
                RadioButton(
                    selected = selectedStatus == option.toStatus,
                    enabled = enabled,
                    onClick = { if (enabled) onSelect(option.toStatus) }
                )
            }
        }
    }
}

private fun isPickupPhotoRequired(order: Order, transitions: List<OrderStatusTransition>): Boolean {
    if (order.normalizedWorkflowRole() == "on_demand") return true
    if (order.pickupPhotoVerified || order.scanType == "pickup_photo") return true

    val currentStatus = order.status.trim()
    return transitions.any { transition ->
        transition.fromStatus.equals(currentStatus, ignoreCase = true) &&
            transition.requiresProof &&
            transition.toStatus.lowercase(Locale.getDefault()) in setOf("picked_up", "pickup_verified", "in_transit")
    }
}

@Suppress("DEPRECATION")
private suspend fun geocodeAddress(context: android.content.Context, address: String): LatLng? {
    if (address.isBlank()) return null

    return withContext(Dispatchers.IO) {
        try {
            val result = Geocoder(context, Locale.getDefault()).getFromLocationName(address, 1)
            result?.firstOrNull()?.let { LatLng(it.latitude, it.longitude) }
        } catch (e: Exception) {
            null
        }
    }
}

@Composable
private fun TambalBanReportCard(report: com.tembus.courier.data.model.TambalBanReport) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.12f))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = "Laporan Kerusakan Ban",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(12.dp))
            val details = mutableListOf<String>()
            if (report.banBocor) details.add("Ban Bocor")
            if (report.banPecah) details.add("Ban Pecah")
            if (report.velgRusak) details.add("Velg Rusak")
            if (report.pentilRusak) details.add("Pentil Rusak")
            
            Text("Kendaraan: ${report.vehicleType ?: "-"}", style = MaterialTheme.typography.bodyMedium)
            Text("Kerusakan: ${if (details.isNotEmpty()) details.joinToString(", ") else "-"}", style = MaterialTheme.typography.bodyMedium)
            if (!report.catatanTeknisi.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text("Catatan: ${report.catatanTeknisi}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun TowingReportCard(report: com.tembus.courier.data.model.TowingReport) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.12f))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = "Permintaan Towing",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text("Kendaraan: ${report.vehicleType ?: "-"}", style = MaterialTheme.typography.bodyMedium)
            Text("Kondisi: ${report.vehicleCondition ?: "-"}", style = MaterialTheme.typography.bodyMedium)
            Text("Tipe Towing: ${report.towingType ?: "-"}", style = MaterialTheme.typography.bodyMedium)
            Text("Posisi Roda Bermasalah: ${report.wheelPosition ?: "-"}", style = MaterialTheme.typography.bodyMedium)
            if (!report.driverNotes.isNullOrBlank()) {
                Spacer(modifier = Modifier.height(4.dp))
                Text("Catatan Driver: ${report.driverNotes}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
