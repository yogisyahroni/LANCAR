package com.tembus.courier.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material.icons.filled.WorkOutline
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.estimatedNetEarningsIdr
import com.tembus.courier.data.model.etaMinutesValue
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.ui.components.maps.LatLng
import com.tembus.courier.ui.components.maps.MapUiSettings
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import com.tembus.courier.ui.theme.TembusComponentDefaults
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

private val TowingOfferCanvas = Color(0xFFF6F8F6)
private val TowingOfferForest = Color(0xFF004D36)
private val TowingOfferGreen = Color(0xFF087A54)
private val TowingOfferMint = Color(0xFFDCF0E7)
private val TowingOfferOrange = Color(0xFFFF7800)
private val TowingOfferOrangeSoft = Color(0xFFFFE9D9)
private val TowingOfferInk = Color(0xFF17221C)
private val TowingOfferMuted = Color(0xFF6C7871)
private val TowingOfferBorder = Color(0xFFDCE6DF)

/**
 * Full-screen towing offer based on Figma node 13-410.
 *
 * Every order-specific value is read from the dispatch snapshot. When the API
 * omits a value, the UI says that it is syncing instead of filling in a demo
 * customer, price, address, or vehicle.
 */
@Composable
internal fun FigmaTowingOfferScreen(
    order: Order,
    mapsProviderConfig: MapsProviderConfig,
    capabilityProfile: CourierCapabilityProfile?,
    acceptBlocked: Boolean,
    blockedReason: String,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onExpired: () -> Unit,
) {
    val haptic = LocalHapticFeedback.current
    val context = LocalContext.current
    val vehicle = order.vehicleDetails
    val courierVehicle = capabilityProfile?.vehicle ?: capabilityProfile?.vehicles?.firstOrNull()
    val serviceLabel = order.serviceName?.trim()?.takeIf { it.isNotBlank() } ?: "Towing"
    val payout = order.estimatedNetEarningsIdr()
    val payoutLabel = payout.takeIf { it > 0 }?.toRupiahCompact() ?: "Menunggu tarif server"
    val customerName = order.customerName.trim().ifBlank { "Pelanggan" }
    val customerPhone = order.phoneNumber?.trim().orEmpty()
    val phone = customerPhone.replace(Regex("[^0-9+]"), "")
    val customerVehicle = listOf(vehicle?.make, vehicle?.model)
        .mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
        .joinToString(" ")
        .ifBlank { vehicle?.type?.trim().orEmpty().ifBlank { "Kendaraan customer" } }
    val towingType = vehicle?.towingConditions.orEmpty().firstOrNull { it.isNotBlank() }
        ?: vehicle?.accessConstraints?.trim()?.takeIf { it.isNotBlank() }
        ?: "Derek mengikuti spesifikasi kendaraan"
    val distanceLabel = order.distance.trim().ifBlank {
        order.routeDistanceMeters.takeIf { it > 0 }?.let { meters ->
            if (meters >= 1_000) String.format("%.1f km", meters / 1_000.0) else "$meters m"
        } ?: "Jarak sinkron"
    }
    val etaLabel = order.etaMinutesValue().takeIf { it > 0 }?.let { "$it menit" } ?: "ETA sinkron"
    val pickupPoint = remember(order.pickupLatitude, order.pickupLongitude) {
        if (order.pickupLatitude != null && order.pickupLongitude != null) {
            LatLng(order.pickupLatitude, order.pickupLongitude)
        } else null
    }
    val dropPoint = remember(order.dropLatitude, order.dropLongitude) {
        if (order.dropLatitude != null && order.dropLongitude != null) {
            LatLng(order.dropLatitude, order.dropLongitude)
        } else null
    }
    val photoUrls = buildList {
        vehicle?.photoItems.orEmpty().forEach { item ->
            item.url.trim().takeIf(String::isNotBlank)?.let { add(item.role.humanizeOfferToken() to it) }
        }
        vehicle?.photoUrls.orEmpty().forEach { url ->
            url.trim().takeIf(String::isNotBlank)?.let { add("Foto kondisi" to it) }
        }
    }.distinctBy { it.second }.take(2)
    val breakdown = order.pricingBreakdown
    val priceBreakdown = buildList<Pair<String, String>> {
        breakdown?.serviceFeeIdr?.takeIf { it > 0 }?.let { add("Jasa" to it.toRupiahCompact()) }
        breakdown?.travelFeeIdr?.takeIf { it > 0 }?.let { add("Jarak" to it.toRupiahCompact()) }
        breakdown?.platformFeeIdr?.takeIf { it > 0 }?.let { add("Platform" to it.toRupiahCompact()) }
    }
    val specificationItems = buildList {
        vehicle?.type?.trim()?.takeIf(String::isNotBlank)?.let { add("Tipe kendaraan: $it") }
        vehicle?.condition?.trim()?.takeIf(String::isNotBlank)?.let { add("Kondisi: $it") }
        vehicle?.accessConstraints?.trim()?.takeIf(String::isNotBlank)?.let { add("Akses: $it") }
        vehicle?.notes?.trim()?.takeIf(String::isNotBlank)?.let { add(it) }
        if (isEmpty()) add("Detail dan perlengkapan mengikuti instruksi order dari server")
    }.distinct()

    var now by remember(order.dispatchId, order.orderId) { mutableStateOf(System.currentTimeMillis()) }
    var expiredSent by remember(order.dispatchId, order.orderId) { mutableStateOf(false) }
    val expiresAt = order.offerExpiresAt ?: remember(order.dispatchId, order.orderId) {
        System.currentTimeMillis() + (order.offerTtlSeconds ?: 30) * 1000L
    }
    val remainingSeconds = towingOfferRemainingSeconds(expiresAt, now)
    val expired = remainingSeconds <= 0
    val canAccept = !acceptBlocked && !expired && payout > 0

    LaunchedEffect(order.dispatchId, order.orderId, expiresAt) {
        while (isActive && System.currentTimeMillis() < expiresAt) {
            now = System.currentTimeMillis()
            delay(250L)
        }
        now = System.currentTimeMillis()
    }
    LaunchedEffect(remainingSeconds) {
        if (remainingSeconds in 1..5) haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        if (expired && !expiredSent) {
            expiredSent = true
            onExpired()
        }
    }

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = false,
            dismissOnClickOutside = false,
        ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(TowingOfferCanvas)
                .padding(bottom = 68.dp),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp, vertical = 10.dp)
                    .padding(bottom = 92.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OfferPill("ONLINE", TowingOfferMint, TowingOfferGreen, showDot = true)
                    Column(modifier = Modifier.weight(1f)) {
                        val courierVehicleLabel = listOf(courierVehicle?.brand, courierVehicle?.model)
                            .mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
                            .joinToString(" ")
                            .ifBlank { "Mitra towing" }
                        Text(
                            "$courierVehicleLabel${courierVehicle?.plateNumber?.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""}",
                            color = TowingOfferForest,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Black,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text("Siap menerima order towing", color = TowingOfferMuted, style = MaterialTheme.typography.labelSmall)
                    }
                    Surface(color = Color.White, shape = CircleShape, border = BorderStroke(1.dp, TowingOfferBorder)) {
                        Icon(Icons.Default.NotificationsNone, contentDescription = "Notifikasi", tint = TowingOfferGreen, modifier = Modifier.padding(10.dp).size(20.dp))
                    }
                }

                Surface(color = TowingOfferForest, shape = RoundedCornerShape(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 9.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(Icons.Default.LocalShipping, contentDescription = null, tint = TowingOfferMint, modifier = Modifier.size(18.dp))
                            Column {
                                Text("TAWARAN TOWING DARURAT", color = TowingOfferMint, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black)
                                Text("Panggilan masuk di sekitar lokasi kamu", color = Color.White, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                            }
                        }
                        OfferPill(if (expired) "Berakhir" else "${remainingSeconds}s", TowingOfferOrange, Color.White)
                    }
                }

                TowingOfferMapCard(
                    order = order,
                    mapsProviderConfig = mapsProviderConfig,
                    pickupPoint = pickupPoint,
                    dropPoint = dropPoint,
                    distanceLabel = distanceLabel,
                    etaLabel = etaLabel,
                )

                OfferSectionCard {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                        Column(modifier = Modifier.weight(1f)) {
                            OfferPill("SIAGA JALAN RAYA", TowingOfferOrangeSoft, TowingOfferOrange)
                            Spacer(Modifier.height(8.dp))
                            Text("$serviceLabel • ${order.orderNumber?.takeIf { it.isNotBlank() } ?: order.orderId}", color = TowingOfferMuted, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                            Text("Pendapatan bersih mitra", color = TowingOfferMuted, style = MaterialTheme.typography.bodySmall)
                            Text(payoutLabel, color = TowingOfferGreen, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
                        }
                        OfferPill("Tarif terkunci", TowingOfferMint, TowingOfferGreen)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        OfferMetric(Icons.Default.Route, distanceLabel, Modifier.weight(1f))
                        OfferMetric(Icons.Default.Schedule, "ETA $etaLabel", Modifier.weight(1f))
                    }
                    if (priceBreakdown.isNotEmpty()) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            priceBreakdown.forEach { (label, value) ->
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(label, color = TowingOfferMuted, style = MaterialTheme.typography.labelSmall)
                                    Text(value, color = TowingOfferInk, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                }
                            }
                        }
                    }
                    Surface(color = TowingOfferMint.copy(alpha = 0.55f), shape = RoundedCornerShape(12.dp)) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(Icons.Default.Lock, contentDescription = null, tint = TowingOfferGreen, modifier = Modifier.size(18.dp))
                            Text("Harga berasal dari snapshot server dan tidak berubah karena inspeksi lapangan.", color = TowingOfferForest, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
                        }
                    }
                }

                OfferSectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        if (order.customerPhotoUrl.isNotBlank()) {
                            AsyncImage(
                                model = ImageRequest.Builder(context).data(order.customerPhotoUrl).crossfade(true).build(),
                                contentDescription = "Foto $customerName",
                                modifier = Modifier.size(46.dp).clip(CircleShape),
                                contentScale = ContentScale.Crop,
                            )
                        } else {
                            Surface(color = TowingOfferMint, shape = CircleShape) {
                                Text(customerInitials(customerName), color = TowingOfferForest, fontWeight = FontWeight.Black, modifier = Modifier.padding(13.dp))
                            }
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text(customerName, color = TowingOfferInk, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                            Text(customerVehicle, color = TowingOfferMuted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (customerPhone.isNotBlank()) Text(customerPhone, color = TowingOfferMuted, style = MaterialTheme.typography.labelSmall)
                        }
                        if (phone.isNotBlank()) Icon(Icons.Default.Phone, contentDescription = "Telepon pelanggan", tint = TowingOfferGreen, modifier = Modifier.size(22.dp))
                    }
                    Surface(color = TowingOfferOrangeSoft.copy(alpha = 0.55f), shape = RoundedCornerShape(12.dp)) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.WarningAmber, contentDescription = null, tint = TowingOfferOrange, modifier = Modifier.size(20.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Prosedur wajib towing", color = TowingOfferOrange, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black)
                                Text(towingType, color = TowingOfferInk, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                                Text("Pastikan bahu jalan aman, hazard dan perlengkapan derek aktif sebelum bergerak.", color = TowingOfferMuted, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("Hazard", "Pengaman", "Area aman").forEach { label ->
                            OfferPill("✓ $label", TowingOfferMint, TowingOfferGreen, modifier = Modifier.weight(1f))
                        }
                    }
                }

                OfferSectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Icon(Icons.Default.PhotoCamera, contentDescription = null, tint = TowingOfferGreen, modifier = Modifier.size(19.dp))
                        Text("Foto kendaraan & kondisi", color = TowingOfferInk, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                        Text("${photoUrls.size} foto", color = TowingOfferMuted, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                    if (photoUrls.isEmpty()) {
                        Surface(color = TowingOfferCanvas, shape = RoundedCornerShape(12.dp)) {
                            Text("Customer belum mengirim foto kondisi kendaraan.", modifier = Modifier.padding(10.dp), color = TowingOfferMuted, style = MaterialTheme.typography.bodySmall)
                        }
                    } else {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            photoUrls.forEachIndexed { index, (_, url) ->
                                AsyncImage(
                                    model = ImageRequest.Builder(context).data(url).crossfade(true).build(),
                                    contentDescription = "Foto kendaraan ${index + 1}",
                                    modifier = Modifier.weight(1f).height(112.dp).clip(RoundedCornerShape(12.dp)),
                                    contentScale = ContentScale.Crop,
                                )
                            }
                        }
                    }
                    Surface(color = TowingOfferMint.copy(alpha = 0.55f), shape = RoundedCornerShape(12.dp)) {
                        Row(modifier = Modifier.padding(9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(Icons.Default.Security, contentDescription = null, tint = TowingOfferGreen, modifier = Modifier.size(17.dp))
                            Text("Unit dan bukti kerja diverifikasi mengikuti SOP towing TEMBUS.", color = TowingOfferForest, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }

                OfferSectionCard {
                    Text("Rute penanganan towing", color = TowingOfferInk, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                    TowingRouteRow("Lokasi kendaraan", order.pickupAddress.ifBlank { "Alamat pickup sedang disinkronkan" }, TowingOfferOrange)
                    TowingRouteRow("Tujuan drop-off", order.dropAddress.ifBlank { "Alamat tujuan sedang disinkronkan" }, TowingOfferGreen)
                }

                OfferSectionCard {
                    Text("Spesifikasi & standar operasional", color = TowingOfferInk, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Black)
                    specificationItems.forEach { item ->
                        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = TowingOfferGreen, modifier = Modifier.size(18.dp))
                            Text(item, color = TowingOfferInk, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                        }
                    }
                }

                if (acceptBlocked) {
                    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp)) {
                        Text(blockedReason, modifier = Modifier.padding(10.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                    }
                }
                Button(
                    onClick = {
                        if (canAccept) {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onAccept()
                        }
                    },
                    enabled = canAccept,
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = TowingOfferOrange,
                        contentColor = Color.White,
                        disabledContainerColor = Color(0xFFD7DCD8),
                        disabledContentColor = TowingOfferMuted,
                    ),
                ) {
                    Icon(Icons.Default.TaskAlt, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(7.dp))
                    Text("Terima Derek (${payoutLabel})", fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.width(4.dp))
                    Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                OutlinedButton(
                    onClick = onReject,
                    enabled = !expired,
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(999.dp),
                    border = BorderStroke(1.dp, TowingOfferBorder),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = TowingOfferMuted),
                ) {
                    Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(7.dp))
                    Text("Tolak tawaran", fontWeight = FontWeight.Bold)
                    Spacer(Modifier.width(7.dp))
                    OfferPill("Bebas penalti SOP", TowingOfferMint, TowingOfferGreen)
                }
            }

            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
                color = Color.White,
                shadowElevation = 8.dp,
                border = BorderStroke(1.dp, TowingOfferBorder),
            ) {
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 7.dp), horizontalArrangement = Arrangement.SpaceAround) {
                    TowingOfferNavItem(Icons.Default.WorkOutline, "Kerja", selected = true)
                    TowingOfferNavItem(Icons.Default.ReceiptLong, "Order")
                    TowingOfferNavItem(Icons.Default.AccountBalanceWallet, "Dompet")
                    TowingOfferNavItem(Icons.Default.ChatBubbleOutline, "Pesan")
                    TowingOfferNavItem(Icons.Default.Person, "Akun")
                }
            }
        }
    }
}

@Composable
private fun TowingOfferMapCard(
    order: Order,
    mapsProviderConfig: MapsProviderConfig,
    pickupPoint: LatLng?,
    dropPoint: LatLng?,
    distanceLabel: String,
    etaLabel: String,
) {
    Surface(color = Color.White, shape = RoundedCornerShape(17.dp), border = BorderStroke(1.dp, TowingOfferBorder)) {
        Column(modifier = Modifier.padding(9.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                OfferPill("LOKASI & RUTE TOWING", TowingOfferOrangeSoft, TowingOfferOrange)
                OfferPill("$distanceLabel • $etaLabel", TowingOfferMint, TowingOfferGreen)
            }
            if (pickupPoint != null || dropPoint != null) {
                Box(modifier = Modifier.fillMaxWidth().height(208.dp).clip(RoundedCornerShape(13.dp))) {
                    RuntimeMapRenderer(
                        modifier = Modifier.fillMaxSize(),
                        providerConfig = mapsProviderConfig,
                        markers = buildList {
                            pickupPoint?.let { add(RuntimeMapMarker("towing-pickup-${order.orderId}", it, "Lokasi kendaraan", order.pickupAddress)) }
                            dropPoint?.let { add(RuntimeMapMarker("towing-drop-${order.orderId}", it, "Tujuan", order.dropAddress)) }
                        },
                        routePoints = listOfNotNull(pickupPoint, dropPoint),
                        followLocation = pickupPoint ?: dropPoint,
                        mapUiSettings = MapUiSettings(
                            zoomControlsEnabled = false,
                            myLocationButtonEnabled = false,
                            mapToolbarEnabled = false,
                            scrollGesturesEnabled = false,
                            zoomGesturesEnabled = false,
                            tiltGesturesEnabled = false,
                            rotationGesturesEnabled = false,
                        ),
                        routeColor = TowingOfferOrange,
                        fallbackTitle = "Area towing",
                        fallbackMessage = "Peta mengikuti koordinat order dari server.",
                    )
                    Surface(modifier = Modifier.align(Alignment.BottomStart).padding(9.dp), color = Color.White.copy(alpha = 0.94f), shape = RoundedCornerShape(999.dp)) {
                        Row(modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                            Icon(Icons.Default.Navigation, contentDescription = null, tint = TowingOfferGreen, modifier = Modifier.size(15.dp))
                            Text("Rute server", color = TowingOfferGreen, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            } else {
                Surface(modifier = Modifier.fillMaxWidth().height(208.dp), color = TowingOfferCanvas, shape = RoundedCornerShape(13.dp)) {
                    Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        Icon(Icons.Default.Map, contentDescription = null, tint = TowingOfferMuted, modifier = Modifier.size(30.dp))
                        Text("Rute towing belum tersedia", color = TowingOfferMuted, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
                        Text("Menunggu koordinat dari server", color = TowingOfferMuted, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Text(order.pickupAddress.ifBlank { "Lokasi kendaraan sedang disinkronkan" }, color = TowingOfferInk, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun OfferSectionCard(content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth(), color = Color.White, shape = RoundedCornerShape(17.dp), border = BorderStroke(1.dp, TowingOfferBorder)) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp), content = content)
    }
}

@Composable
private fun OfferPill(text: String, background: Color, contentColor: Color, showDot: Boolean = false, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, color = background, contentColor = contentColor, shape = RoundedCornerShape(999.dp)) {
        Row(modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            if (showDot) Surface(modifier = Modifier.size(8.dp), color = contentColor, shape = CircleShape) {}
            Text(text, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun OfferMetric(icon: ImageVector, text: String, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, color = TowingOfferCanvas, shape = RoundedCornerShape(11.dp), border = BorderStroke(1.dp, TowingOfferBorder)) {
        Row(modifier = Modifier.padding(horizontal = 9.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(icon, contentDescription = null, tint = TowingOfferOrange, modifier = Modifier.size(16.dp))
            Text(text, color = TowingOfferInk, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun TowingRouteRow(label: String, value: String, color: Color) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Surface(modifier = Modifier.size(12.dp), color = color, shape = CircleShape) {}
            Box(modifier = Modifier.width(2.dp).height(33.dp).background(color.copy(alpha = 0.24f)))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(label, color = TowingOfferMuted, style = MaterialTheme.typography.labelSmall)
            Text(value, color = TowingOfferInk, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun TowingOfferNavItem(icon: ImageVector, label: String, selected: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.widthIn(min = 52.dp)) {
        Icon(icon, contentDescription = label, tint = if (selected) TowingOfferOrange else TowingOfferMuted, modifier = Modifier.size(22.dp))
        Text(label, color = if (selected) TowingOfferOrange else TowingOfferMuted, style = MaterialTheme.typography.labelSmall, fontWeight = if (selected) FontWeight.Black else FontWeight.Medium)
    }
}

private fun customerInitials(name: String): String = name.trim()
    .split(Regex("\\s+"))
    .mapNotNull { it.firstOrNull()?.uppercase() }
    .take(2)
    .joinToString("")
    .ifBlank { "CU" }

private fun String.humanizeOfferToken(): String = trim()
    .replace('_', ' ')
    .replace('-', ' ')
    .split(Regex("\\s+"))
    .filter(String::isNotBlank)
    .joinToString(" ") { it.replaceFirstChar { character -> character.uppercase() } }

private fun towingOfferRemainingSeconds(expiresAt: Long, now: Long): Int =
    ((expiresAt - now).coerceAtLeast(0L) / 1_000L).toInt()
