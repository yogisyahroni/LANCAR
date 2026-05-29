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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.CancelPickupReason
import com.tembus.courier.data.model.OrderStatusTransition
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.displayServiceName
import com.tembus.courier.data.model.normalizedWorkflowRole
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryLight
import com.tembus.courier.ui.theme.Secondary
import com.tembus.courier.ui.theme.Success
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import java.io.File
import java.io.FileOutputStream

private val LogisticsOrange = Color(0xFFFF6D00)
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
    routePreview: CourierRoutePreview? = null,
    mapsProviderConfig: MapsProviderConfig = MapsProviderConfig(),
    cancelPickupReasons: List<CancelPickupReason> = emptyList(),
    statusTransitions: List<OrderStatusTransition> = emptyList(),
    pickupScanVerified: Boolean = false,
    pickupPhotoVerified: Boolean = false,
    onSosClick: () -> Unit = {},
    onCancelPickup: (reasonCode: String, reasonNote: String?, photoFile: File) -> Unit = { _, _, _ -> }
) {
    val context = LocalContext.current
    
    // 🛡️ SECURITY: Prevent customer PII screenshots and background system captures
    val activity = remember(context) { context as? Activity }
    DisposableEffect(activity) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    var showStatusDialog by remember { mutableStateOf(false) }
    var newStatus by remember { mutableStateOf(order.status) }

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
            title = { Text("Update Status") },
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
                    Text("Update")
                }
            },
            dismissButton = {
                TextButton(onClick = { showStatusDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Pengantaran", fontWeight = FontWeight.Bold)
                        Text(
                            order.orderId.ifBlank { "Order aktif" },
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
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
            if (order.normalizedWorkflowRole() == "on_demand") {
                OnDemandTaskActions(
                    order = order,
                    routePreview = routePreview,
                    cancelPickupReasons = cancelPickupReasons,
                    pickupScanVerified = pickupScanVerified,
                    pickupPhotoVerified = pickupPhotoVerified,
                    onVerifyPickup = onVerifyPickup,
                    onCapturePickupProof = onCapturePickupProof,
                    onCapturePod = onCapturePod,
                    onChatClick = onChatClick,
                    onSosClick = onSosClick,
                    onCancelPickup = onCancelPickup
                )
            } else {
                OrderActions(
                    order = order,
                    onStatusClick = { showStatusDialog = true },
                    onCapturePod = onCapturePod,
                    onChatClick = onChatClick
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
                        dropLatLng?.let { add(RuntimeMapMarker("dropoff", it, "Dropoff", order.dropAddress)) }
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
                        googleUiSettings = MapUiSettings(
                            zoomControlsEnabled = false,
                            myLocationButtonEnabled = false,
                            mapToolbarEnabled = false
                        ),
                        routeColor = Primary,
                        fallbackTitle = "Preview rute siap",
                        fallbackMessage = "Koordinat dan ETA tetap dipakai dari backend. Provider peta dapat diganti dari admin.",
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
                        Text("Koordinat order belum tersedia", fontWeight = FontWeight.Bold)
                        Text(
                            "Map akan muncul setelah backend mengirim titik pickup/dropoff atau alamat valid.",
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
                Text(if (order.normalizedWorkflowRole() == "on_demand") "Rute On Demand" else "Rute Pengantaran", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                DeliveryStop(icon = Icons.Default.Storefront, label = "Pickup", value = order.pickupAddress.ifBlank { "Alamat pickup belum tersedia" }, color = Primary)
                DeliveryStop(icon = Icons.Default.LocationOn, label = "Dropoff", value = order.dropAddress.ifBlank { "Alamat tujuan belum tersedia" }, color = Secondary)
            }
        }
    }
}

@Composable
private fun OnDemandTaskActions(
    order: Order,
    routePreview: CourierRoutePreview?,
    cancelPickupReasons: List<CancelPickupReason>,
    pickupScanVerified: Boolean,
    pickupPhotoVerified: Boolean,
    onVerifyPickup: () -> Unit,
    onCapturePickupProof: () -> Unit,
    onCapturePod: () -> Unit,
    onChatClick: () -> Unit,
    onSosClick: () -> Unit,
    onCancelPickup: (reasonCode: String, reasonNote: String?, photoFile: File) -> Unit
) {
    val context = LocalContext.current
    var showCancelPickupDialog by remember { mutableStateOf(false) }
    val status = order.status.lowercase()
    val pickupEvidenceComplete = pickupScanVerified && pickupPhotoVerified
    val pickupDone = status in setOf("picked_up", "in_transit", "delivered", "completed") || pickupEvidenceComplete
    val deliveryDone = status in setOf("delivered", "completed")
    val activeAddress = if (pickupDone) order.dropAddress else order.pickupAddress
    val phaseTitle = when {
        deliveryDone -> "Pekerjaan selesai"
        pickupDone -> "Menuju penerima"
        else -> "Menuju pickup"
    }
    val phaseInstruction = when {
        deliveryDone -> "Bukti selesai sudah tercatat."
        pickupDone -> "Antarkan paket ke penerima, lalu ambil bukti selesai di titik tujuan."
        else -> "Datang ke titik pickup, verifikasi barang dengan scan atau foto."
    }

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
                phaseTitle = phaseTitle,
                phaseInstruction = phaseInstruction
            )
            routePreview?.let { RoutePreviewStrip(it) }
            OnDemandProgressTimeline(pickupDone = pickupDone, deliveryDone = deliveryDone)
            LocationGateStatus(order = order, targetPickup = !pickupDone)

            OnDemandCurrentStopCard(
                title = if (pickupDone) "Lokasi penerima" else "Lokasi pickup",
                address = activeAddress.ifBlank { "Alamat belum tersedia" },
                icon = if (pickupDone) Icons.Default.LocationOn else Icons.Default.Storefront,
                gateLabel = if (pickupDone) "Validasi di titik penerima" else "Validasi di titik pickup"
            )

            ActionButton(
                icon = Icons.Default.Navigation,
                label = if (pickupDone) "Navigasi ke penerima" else "Navigasi ke pickup",
                prominent = true,
                containerColor = DeepForest,
                contentColor = Color.White,
                onClick = { openNavigation(context, activeAddress) }
            )

            if (!pickupDone) {
                OnDemandProofPanel(
                    title = "Verifikasi barang",
                    subtitle = "Scan/kode paket dan foto barang wajib lengkap sebelum mulai pengantaran.",
                    primaryIcon = Icons.Default.QrCodeScanner,
                    primaryLabel = if (pickupScanVerified) "Scan selesai" else "Scan barcode",
                    onPrimary = onVerifyPickup,
                    secondaryIcon = Icons.Default.CameraAlt,
                    secondaryLabel = if (pickupPhotoVerified) "Foto selesai" else "Foto barang",
                    onSecondary = onCapturePickupProof
                )
                MandatoryPickupChecklist(
                    scanDone = pickupScanVerified,
                    photoDone = pickupPhotoVerified
                )
                order.itemDescription?.takeIf { it.isNotBlank() }?.let {
                    VerificationNotice("Isi paket: $it. Pastikan foto memperlihatkan kondisi barang sebelum dibawa.")
                }
            } else if (!deliveryDone) {
                OnDemandProofPanel(
                    title = "Bukti serah terima",
                    subtitle = "Ambil foto POD hanya saat sudah berada di titik penerima.",
                    primaryIcon = Icons.Default.CameraAlt,
                    primaryLabel = "Ambil foto POD",
                    onPrimary = onCapturePod,
                    secondaryIcon = Icons.Default.CheckCircle,
                    secondaryLabel = "GPS divalidasi",
                    onSecondary = {}
                )
            } else {
                VerificationNotice("Pengiriman selesai. Tidak ada tindakan lanjutan untuk pekerjaan ini.")
            }

            OnDemandSupportActions(
                order = order,
                pickupDone = pickupDone,
                onChatClick = onChatClick,
                onSosClick = onSosClick,
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
}

@Composable
private fun OnDemandJobHeader(order: Order, phaseTitle: String, phaseInstruction: String) {
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
                Text(order.displayServiceName(), style = MaterialTheme.typography.labelLarge, color = LogisticsOrange, fontWeight = FontWeight.Black)
                Text(phaseInstruction, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.76f))
            }
            Surface(color = Color.White.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                Text(
                    order.cleanPayoutIdr().toRupiahCompact(),
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
private fun OnDemandProgressTimeline(pickupDone: Boolean, deliveryDone: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
        OnDemandTimelineItem(
            icon = Icons.Default.Storefront,
            title = "Jemput barang",
            subtitle = "Scan atau foto barang di titik pickup",
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
            title = "Bukti selesai",
            subtitle = "Foto POD di titik penerima",
            done = deliveryDone,
            active = false,
            showConnector = false
        )
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
            Text(title, fontWeight = FontWeight.Bold, color = if (done || active) DeepForest else MaterialTheme.colorScheme.onSurfaceVariant)
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
private fun MandatoryPickupChecklist(
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
                done = scanDone,
                label = "Scan barcode atau input kode paket",
                description = "Mencocokkan paket dengan order aktif."
            )
            VerificationRequirementRow(
                done = photoDone,
                label = "Foto barang pickup",
                description = "Bukti kondisi barang sebelum dibawa."
            )
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
                tint = if (done) Success else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(8.dp).size(18.dp)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(label, fontWeight = FontWeight.Bold, color = DeepForest)
            Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(
            text = if (done) "OK" else "Wajib",
            style = MaterialTheme.typography.labelMedium,
            color = if (done) Success else LogisticsOrange,
            fontWeight = FontWeight.Black
        )
    }
}

@Composable
private fun OnDemandSupportActions(
    order: Order,
    pickupDone: Boolean,
    onChatClick: () -> Unit,
    onSosClick: () -> Unit,
    onCancelPickupClick: () -> Unit
) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                CompactActionButton(icon = Icons.AutoMirrored.Filled.Chat, label = "Chat", onClick = onChatClick, modifier = Modifier.weight(1f))
            CompactActionButton(icon = Icons.Default.Phone, label = "Telepon", onClick = {
                val phone = order.phoneNumber.orEmpty()
                if (phone.isNotBlank()) {
                    context.startActivity(Intent(Intent.ACTION_DIAL).apply { data = Uri.parse("tel:$phone") })
                }
            }, modifier = Modifier.weight(1f))
        }
        if (!pickupDone) {
            OutlinedButton(
                onClick = onCancelPickupClick,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.7f))
            ) {
                Icon(Icons.Default.Cancel, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Batalkan pickup", fontWeight = FontWeight.Bold)
            }
        }
        OutlinedButton(
            onClick = onSosClick,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.7f))
        ) {
            Icon(Icons.Default.ReportProblem, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
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
                            "Alasan pembatalan belum tersedia dari server.",
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
private fun RoutePreviewStrip(routePreview: CourierRoutePreview) {
    val snapshot = routePreview.routeSnapshot
    val distanceKm = snapshot?.distanceKm?.takeIf { it > 0.0 } ?: routePreview.distanceKm
    val etaMinutes = snapshot?.etaMinutes?.takeIf { it > 0 } ?: routePreview.etaMinutes
    val provider = snapshot?.activeProvider?.takeIf { it.isNotBlank() }
        ?: snapshot?.provider?.takeIf { it.isNotBlank() }
        ?: routePreview.provider
    val hasRouteGeometry = !routePreview.routePolyline.isNullOrBlank() || !snapshot?.routePolyline.isNullOrBlank()
    val hasFallback = !routePreview.fallbackReason.isNullOrBlank() || !snapshot?.fallbackReason.isNullOrBlank()
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
            Icon(Icons.Default.Route, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Preview rute", fontWeight = FontWeight.Bold, color = DeepForest)
                Text(
                    "${String.format(Locale.US, "%.1f", distanceKm)} km • ETA $etaMinutes menit",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                if (!hasRouteGeometry || hasFallback) {
                    Text(
                        "Estimasi sementara. Rute sedang diperbarui.",
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

    val ready = distanceM != null && distanceM!! <= 150 && (accuracyM == null || accuracyM!! <= 100)
    val copy = when {
        permissionMissing -> "GPS belum diizinkan. Aktifkan permission lokasi untuk validasi titik."
        targetLat == null || targetLng == null -> "Koordinat titik belum lengkap. Backend tetap akan memvalidasi saat bukti dikirim."
        distanceM == null -> "Mengecek jarak ke titik ${if (targetPickup) "pickup" else "tujuan"}..."
        ready -> "Lokasi valid: ${distanceM}m dari titik, akurasi ${accuracyM ?: 0}m."
        else -> "Belum di titik ${if (targetPickup) "pickup" else "tujuan"}: ${distanceM}m dari radius 150m."
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
            Text(copy, style = MaterialTheme.typography.bodySmall, color = DeepForest, fontWeight = FontWeight.Medium)
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
        StepPill("POD", active = false, done = deliveryDone, modifier = Modifier.weight(1f))
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
        border = BorderStroke(1.dp, Color.Black)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = if (done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (done || active) Color.Black else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(14.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(label, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelMedium, color = if (done || active) Color.Black else MaterialTheme.colorScheme.onSurfaceVariant)
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
    val container = if (strong) DeepForest else Color.White
    val content = if (strong) Color.White else DeepForest
    Button(
        onClick = onClick,
        modifier = modifier.height(52.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = content),
        border = BorderStroke(1.dp, Color.Black),
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
                text = "Detail Paket",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))

            InfoRow(label = "Order ID", value = order.orderId)
            InfoRow(label = "Customer", value = order.customerName)
            InfoRow(label = "Pickup", value = order.pickupAddress)
            InfoRow(label = "Drop-off", value = order.dropAddress)
            InfoRow(label = "Pickup Time", value = order.pickupTime)
            InfoRow(label = "Distance", value = order.distance)
            InfoRow(label = "Fee", value = order.fee)
            
            if (order.length != null || order.width != null || order.height != null) {
                val dims = "${order.length ?: 0} x ${order.width ?: 0} x ${order.height ?: 0} cm"
                InfoRow(label = "Dimensions", value = dims)
            }
            if (order.weight != null) {
                InfoRow(label = "Weight", value = "${order.weight} kg")
            }

            InfoRow(label = "Status", value = order.status.replace("_", " ").uppercase())
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = "$label:", style = MaterialTheme.typography.bodyMedium)
        Text(
            text = value.ifBlank { "Data belum tersedia" },
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
    Spacer(modifier = Modifier.height(8.dp))
}

@Composable
private fun OrderActions(
    order: Order,
    onStatusClick: () -> Unit,
    onCapturePod: () -> Unit,
    onChatClick: () -> Unit
) {
    val context = LocalContext.current
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = "Aksi Kurir",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))

            ActionButton(
                icon = Icons.Default.Navigation,
                label = "Mulai Navigasi",
                prominent = true,
                onClick = {
                    openNavigation(context, order.dropAddress)
                }
            )

            ActionButton(
                    icon = Icons.AutoMirrored.Filled.Chat,
                label = "Chat Customer",
                onClick = onChatClick
            )

            ActionButton(
                    icon = Icons.AutoMirrored.Filled.Message,
                label = "Chat WhatsApp",
                onClick = {
                    val phone = order.phoneNumber ?: ""
                    if (phone.isNotBlank()) {
                        try {
                            val clean = phone.replace(Regex("[^0-9]"), "")
                            val formattedPhone = when {
                                clean.startsWith("0") -> "62" + clean.substring(1)
                                clean.startsWith("62") -> clean
                                else -> "62$clean"
                            }
                            val message = "Halo ${order.customerName}, saya Kurir TEMBUS sedang menuju ke alamat pengantaran Anda (Pesanan: ${order.orderId})."
                            val waUri = Uri.parse("https://api.whatsapp.com/send?phone=$formattedPhone&text=${Uri.encode(message)}")
                            val waIntent = Intent(Intent.ACTION_VIEW, waUri)
                            context.startActivity(waIntent)
                        } catch (e: Exception) {
                            android.widget.Toast.makeText(context, "WhatsApp tidak terinstall atau nomor tidak valid.", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        android.widget.Toast.makeText(context, "Nomor telepon pelanggan tidak tersedia.", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            )

            ActionButton(
                icon = Icons.Default.Phone,
                label = "Call Customer",
                onClick = {
                    val phone = order.phoneNumber ?: ""
                    if (phone.isNotBlank()) {
                        try {
                            val callIntent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:$phone")
                            }
                            context.startActivity(callIntent)
                        } catch (e: Exception) {
                            android.widget.Toast.makeText(context, "Gagal membuka tombol telepon.", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            )

            ActionButton(
                icon = Icons.Default.CameraAlt,
                label = "Upload Bukti Pengiriman",
                onClick = onCapturePod
            )

            if (order.normalizedWorkflowRole() == "on_demand" || order.status.isNotBlank()) {
                ActionButton(
                    icon = Icons.Default.Update,
                    label = "Update Status Order",
                    onClick = onStatusClick
                )
            }
        }
    }
}

private fun openNavigation(context: android.content.Context, address: String) {
    try {
        val gmmIntentUri = Uri.parse("geo:0,0?q=${Uri.encode(address)}")
        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
        val chooser = Intent.createChooser(mapIntent, "Pilih Aplikasi Peta/Navigasi")
        context.startActivity(chooser)
    } catch (e: Exception) {
        android.widget.Toast.makeText(context, "Tidak ada aplikasi peta terinstall.", android.widget.Toast.LENGTH_SHORT).show()
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
        modifier = Modifier.fillMaxWidth().height(48.dp),
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
                text = "Policy transisi status belum tersedia dari backend.",
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
                            text = "Wajib lewat bukti pickup/POD",
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
