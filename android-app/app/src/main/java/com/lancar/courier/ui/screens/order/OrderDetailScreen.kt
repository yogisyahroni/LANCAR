package com.lancar.courier.ui.screens.order

import android.app.Activity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Geocoder
import android.location.Location
import android.net.Uri
import android.view.WindowManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import com.lancar.courier.data.model.Order
import com.lancar.courier.data.model.CourierRoutePreview
import com.lancar.courier.data.model.cleanPayoutIdr
import com.lancar.courier.data.model.displayServiceName
import com.lancar.courier.data.model.normalizedWorkflowRole
import com.lancar.courier.data.model.toRupiahCompact
import com.lancar.courier.ui.theme.Primary
import com.lancar.courier.ui.theme.PrimaryLight
import com.lancar.courier.ui.theme.Secondary
import com.lancar.courier.ui.theme.Success
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale

private val LogisticsOrange = Color(0xFFFF6D00)
private val DeepForest = Color(0xFF0A2F20)
private val OnDemandSurface = Color(0xFFF2F5F0)

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
    onSosClick: () -> Unit = {},
    onReportIssue: (String) -> Unit = {},
    onShareTrip: () -> Unit = {}
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
        AlertDialog(
            onDismissRequest = { showStatusDialog = false },
            title = { Text("Update Status") },
            text = {
                Column {
                    OrderStatusOptions(newStatus) { status ->
                        newStatus = status
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    onUpdateStatus(newStatus)
                    showStatusDialog = false
                }) {
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
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
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
            DeliveryMapCard(order = order)
            OrderInfoCard(order = order)
            if (order.normalizedWorkflowRole() == "on_demand") {
                OnDemandTaskActions(
                    order = order,
                    routePreview = routePreview,
                    onVerifyPickup = onVerifyPickup,
                    onCapturePickupProof = onCapturePickupProof,
                    onCapturePod = onCapturePod,
                    onChatClick = onChatClick,
                    onSosClick = onSosClick,
                    onReportIssue = onReportIssue,
                    onShareTrip = onShareTrip
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
private fun DeliveryMapCard(order: Order) {
    val context = LocalContext.current
    val fallbackPickup = remember { LatLng(-6.175392, 106.827153) }
    val fallbackDropoff = remember { LatLng(-6.200000, 106.816666) }
    var pickupLatLng by remember(order.pickupAddress, order.pickupLatitude, order.pickupLongitude) { mutableStateOf<LatLng?>(null) }
    var dropLatLng by remember(order.dropAddress, order.dropLatitude, order.dropLongitude) { mutableStateOf<LatLng?>(null) }

    LaunchedEffect(order.pickupAddress, order.dropAddress, order.pickupLatitude, order.pickupLongitude, order.dropLatitude, order.dropLongitude) {
        pickupLatLng = when {
            order.pickupLatitude != null && order.pickupLongitude != null -> LatLng(order.pickupLatitude, order.pickupLongitude)
            else -> geocodeAddress(context, order.pickupAddress) ?: fallbackPickup
        }
        dropLatLng = when {
            order.dropLatitude != null && order.dropLongitude != null -> LatLng(order.dropLatitude, order.dropLongitude)
            else -> geocodeAddress(context, order.dropAddress) ?: fallbackDropoff
        }
    }

    val pickup = pickupLatLng ?: fallbackPickup
    val dropoff = dropLatLng ?: fallbackDropoff
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(pickup, 12f)
    }

    LaunchedEffect(pickup, dropoff) {
        val center = LatLng(
            (pickup.latitude + dropoff.latitude) / 2,
            (pickup.longitude + dropoff.longitude) / 2
        )
        cameraPositionState.position = CameraPosition.fromLatLngZoom(center, 12f)
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.fillMaxWidth().height(230.dp)) {
                GoogleMap(
                    modifier = Modifier.fillMaxSize(),
                    cameraPositionState = cameraPositionState,
                    uiSettings = MapUiSettings(
                        zoomControlsEnabled = false,
                        myLocationButtonEnabled = false,
                        mapToolbarEnabled = false
                    )
                ) {
                    Marker(
                        state = MarkerState(position = pickup),
                        title = "Pickup",
                        snippet = order.pickupAddress
                    )
                    Marker(
                        state = MarkerState(position = dropoff),
                        title = "Dropoff",
                        snippet = order.dropAddress
                    )
                    Polyline(points = listOf(pickup, dropoff), color = Primary, width = 8f)
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
    onVerifyPickup: () -> Unit,
    onCapturePickupProof: () -> Unit,
    onCapturePod: () -> Unit,
    onChatClick: () -> Unit,
    onSosClick: () -> Unit,
    onReportIssue: (String) -> Unit,
    onShareTrip: () -> Unit
) {
    val context = LocalContext.current
    val status = order.status.lowercase()
    val pickupDone = status in setOf("picked_up", "in_transit", "delivered", "completed")
    val deliveryDone = status in setOf("delivered", "completed")
    val activeAddress = if (pickupDone) order.dropAddress else order.pickupAddress
    val activeLabel = if (pickupDone) "Antar paket" else "Pickup barang"
    val activeInstruction = if (pickupDone) {
        "Ambil foto POD saat sudah berada di lokasi penerima."
    } else {
        "Datang ke pickup, lalu scan barcode atau foto barang."
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(topStart = 16.dp, topEnd = 26.dp, bottomStart = 26.dp, bottomEnd = 16.dp),
        colors = CardDefaults.cardColors(containerColor = OnDemandSurface),
        border = BorderStroke(2.dp, Color.Black)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text("Tugas On Demand", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = DeepForest)
                    Text(order.displayServiceName(), style = MaterialTheme.typography.labelLarge, color = LogisticsOrange, fontWeight = FontWeight.Black)
                    Text(activeInstruction, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Surface(
                    color = LogisticsOrange,
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, Color.Black)
                ) {
                    Text(
                        order.cleanPayoutIdr().toRupiahCompact(),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        color = Color.Black,
                        fontWeight = FontWeight.Black,
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }

            OnDemandStepper(pickupDone = pickupDone, deliveryDone = deliveryDone)
            routePreview?.let { RoutePreviewStrip(it) }
            LocationGateStatus(order = order, targetPickup = !pickupDone)

            Surface(
                color = Color.White.copy(alpha = 0.92f),
                shape = RoundedCornerShape(topStart = 12.dp, topEnd = 22.dp, bottomStart = 22.dp, bottomEnd = 12.dp),
                border = BorderStroke(1.dp, Color.Black.copy(alpha = 0.2f)),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(if (pickupDone) Icons.Default.LocationOn else Icons.Default.Storefront, contentDescription = null, tint = LogisticsOrange)
                        Text(activeLabel, fontWeight = FontWeight.Black, color = DeepForest)
                    }
                    Text(
                        activeAddress.ifBlank { "Alamat belum tersedia" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = if (pickupDone) "Gate lokasi: titik tujuan" else "Gate lokasi: titik pickup",
                        style = MaterialTheme.typography.labelMedium,
                        color = Primary,
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            ActionButton(
                icon = Icons.Default.Navigation,
                label = if (pickupDone) "Buka Maps Tujuan" else "Buka Maps Pickup",
                prominent = true,
                containerColor = LogisticsOrange,
                contentColor = Color.Black,
                onClick = { openNavigation(context, activeAddress) }
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                CompactActionButton(icon = Icons.Default.Chat, label = "Chat", onClick = onChatClick, modifier = Modifier.weight(1f))
                CompactActionButton(icon = Icons.Default.Phone, label = "Call", onClick = {
                    val phone = order.phoneNumber.orEmpty()
                    if (phone.isNotBlank()) {
                        context.startActivity(Intent(Intent.ACTION_DIAL).apply { data = Uri.parse("tel:$phone") })
                    }
                }, modifier = Modifier.weight(1f))
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                CompactActionButton(icon = Icons.Default.Share, label = "Share Trip", onClick = onShareTrip, modifier = Modifier.weight(1f))
                CompactActionButton(icon = Icons.Default.ReportProblem, label = "Lapor", onClick = { onReportIssue("support_request") }, modifier = Modifier.weight(1f))
            }

            if (!pickupDone) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    CompactActionButton(icon = Icons.Default.QrCodeScanner, label = "Scan Barang", onClick = onVerifyPickup, modifier = Modifier.weight(1f), strong = true)
                    CompactActionButton(icon = Icons.Default.CameraAlt, label = "Foto Barang", onClick = onCapturePickupProof, modifier = Modifier.weight(1f), strong = true)
                }
                VerificationNotice("Scan jika ada barcode. Jika tidak ada barcode, foto barang dipakai sebagai bukti pickup.")
                if (!order.itemDescription.isNullOrBlank()) {
                    VerificationNotice("Isi paket: ${order.itemDescription}. Pastikan foto memperlihatkan kondisi barang sebelum dibawa.")
                }
                CompactActionButton(
                    icon = Icons.Default.Block,
                    label = "Laporkan barang bermasalah",
                    onClick = { onReportIssue("prohibited_goods") },
                    modifier = Modifier.fillMaxWidth()
                )
            } else if (!deliveryDone) {
                ActionButton(
                    icon = Icons.Default.CameraAlt,
                    label = "Selesaikan Pengiriman",
                    prominent = true,
                    containerColor = LogisticsOrange,
                    contentColor = Color.Black,
                    onClick = onCapturePod
                )
                VerificationNotice("POD hanya bisa dikirim saat GPS berada di titik tujuan.")
            } else {
                AssistChip(
                    onClick = {},
                    label = { Text("Pengiriman selesai") },
                    leadingIcon = { Icon(Icons.Default.CheckCircle, contentDescription = null) }
                )
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
                Text("SOS Bantuan Operasional", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun RoutePreviewStrip(routePreview: CourierRoutePreview) {
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
                    "${"%.1f".format(routePreview.distanceKm)} km • ETA ${routePreview.etaMinutes} menit",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                Text(routePreview.provider.uppercase(), modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp), style = MaterialTheme.typography.labelSmall, color = Primary, fontWeight = FontWeight.Bold)
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
            text = value,
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
                icon = Icons.Default.Chat,
                label = "Chat Customer",
                onClick = onChatClick
            )

            ActionButton(
                icon = Icons.Default.Message,
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
                            val message = "Halo ${order.customerName}, saya Kurir LANCAR sedang menuju ke alamat pengantaran Anda (Pesanan: ${order.orderId})."
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

            ActionButton(
                icon = Icons.Default.Update,
                label = "Update Status Order",
                onClick = onStatusClick
            )
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
private fun OrderStatusOptions(currentStatus: String, onSelect: (String) -> Unit) {
    val statuses = listOf("pending", "assigned", "picked_up", "in_transit", "delivered", "failed")
    
    Column {
        statuses.forEach { status ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = status.replace("_", " ").uppercase())
                RadioButton(
                    selected = currentStatus == status,
                    onClick = { onSelect(status) }
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
