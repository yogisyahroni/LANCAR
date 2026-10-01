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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.NotificationsNone
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.TaskAlt
import androidx.compose.material.icons.filled.WorkOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.etaMinutesValue
import com.tembus.courier.data.model.isFoodDeliveryOrder
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.ui.components.maps.LatLng
import com.tembus.courier.ui.components.maps.MapUiSettings
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive

private val FoodOfferCanvas = Color(0xFFF5F8F5)
private val FoodOfferForest = Color(0xFF004D36)
private val FoodOfferGreen = Color(0xFF087A54)
private val FoodOfferMint = Color(0xFFE1F2E9)
private val FoodOfferOrange = Color(0xFFE86F16)
private val FoodOfferOrangeSoft = Color(0xFFFFE9DA)
private val FoodOfferInk = Color(0xFF17221C)
private val FoodOfferMuted = Color(0xFF6B7770)
private val FoodOfferBorder = Color(0xFFDCE6DF)

/** Food offer surface for Figma node 13-650. */
@Composable
internal fun FigmaFoodOfferScreen(
    order: Order,
    mapsProviderConfig: MapsProviderConfig,
    capabilityProfile: CourierCapabilityProfile?,
    acceptBlocked: Boolean,
    blockedReason: String,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onExpired: () -> Unit,
) {
    val courierVehicle = capabilityProfile?.vehicle ?: capabilityProfile?.vehicles?.firstOrNull()
    val payout = order.courierPayoutEstimateIdr.takeIf { it > 0 }
        ?: order.fee.filter(Char::isDigit).toIntOrNull()
        ?: 0
    val payoutLabel = payout.takeIf { it > 0 }?.toRupiahCompact() ?: "Menunggu tarif server"
    val merchant = order.merchantName?.trim().orEmpty().ifBlank { "Merchant food belum dikirim server" }
    val orderCode = order.orderNumber?.trim().takeIf { !it.isNullOrBlank() } ?: order.orderId
    val pickupPoint = remember(order.pickupLatitude, order.pickupLongitude) {
        if (order.pickupLatitude != null && order.pickupLongitude != null) LatLng(order.pickupLatitude, order.pickupLongitude) else null
    }
    val dropPoint = remember(order.dropLatitude, order.dropLongitude) {
        if (order.dropLatitude != null && order.dropLongitude != null) LatLng(order.dropLatitude, order.dropLongitude) else null
    }
    val distanceLabel = order.distance.trim().takeIf { it.isNotBlank() }
        ?: order.routeDistanceMeters.takeIf { it > 0 }?.let { "%.1f km".format(it / 1_000.0) }
        ?: "Jarak sinkron"
    val etaLabel = order.etaMinutesValue().takeIf { it > 0 }?.let { "$it mnt" } ?: "ETA sinkron"
    var now by remember(order.dispatchId, order.orderId) { mutableStateOf(System.currentTimeMillis()) }
    var expiredSent by remember(order.dispatchId, order.orderId) { mutableStateOf(false) }
    val expiresAt = order.offerExpiresAt ?: remember(order.dispatchId, order.orderId) {
        System.currentTimeMillis() + (order.offerTtlSeconds ?: 30) * 1_000L
    }
    val remainingSeconds = foodOfferRemainingSeconds(expiresAt, now)
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
        )
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(FoodOfferCanvas)
                .padding(bottom = 68.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 14.dp, vertical = 10.dp)
                    .padding(bottom = 92.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FoodOfferBadge("ONLINE", FoodOfferMint, FoodOfferGreen, showDot = true)
                    Column(modifier = Modifier.weight(1f)) {
                        val vehicleLabel = listOf(courierVehicle?.brand, courierVehicle?.model)
                            .mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
                            .joinToString(" ")
                            .ifBlank { "Mitra food" }
                        Text(
                            "$vehicleLabel${courierVehicle?.plateNumber?.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""}",
                            color = FoodOfferForest,
                            style = androidx.compose.material3.MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Black,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text("Siap menerima order food", color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
                    }
                    Surface(color = Color.White, shape = CircleShape, border = BorderStroke(1.dp, FoodOfferBorder)) {
                        Icon(Icons.Default.NotificationsNone, contentDescription = "Notifikasi", tint = FoodOfferGreen, modifier = Modifier.padding(10.dp).size(20.dp))
                    }
                }

                FoodOfferSection {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Default.Restaurant, contentDescription = null, tint = FoodOfferOrange, modifier = Modifier.size(22.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            FoodOfferBadge("TEMBUS FOOD KULINER HANGAT", FoodOfferOrangeSoft, FoodOfferOrange)
                            Text("Ambil di resto, antar ke customer", color = FoodOfferInk, style = androidx.compose.material3.MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Black)
                        }
                        FoodOfferBadge(if (expired) "Berakhir" else "${remainingSeconds}s", FoodOfferOrange, Color.White)
                    }
                    Text("Offer berlaku berdasarkan snapshot server. Jangan mulai pickup sebelum tawaran diterima.", color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                }

                FoodOfferRouteCard(order, mapsProviderConfig, pickupPoint, dropPoint, distanceLabel, etaLabel)

                FoodOfferSection {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("PENDAPATAN BERSIH MITRA", color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Black)
                            Text(payoutLabel, color = FoodOfferGreen, style = androidx.compose.material3.MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
                        }
                        FoodOfferBadge("DIKUNCI SERVER", FoodOfferMint, FoodOfferGreen)
                    }
                    FoodOfferAmountRow("Ongkir / payout order", payoutLabel)
                    if (order.tipAmountIdr > 0) FoodOfferAmountRow("Tip pelanggan", "+${order.tipAmountIdr.toInt().toRupiahCompact()}")
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Default.Lock, contentDescription = null, tint = FoodOfferGreen, modifier = Modifier.size(16.dp))
                        Text("Escrow server terkunci • saldo masuk dompet setelah status valid", color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
                    }
                }

                FoodOfferSection {
                    FoodOfferTitleRow(Icons.Default.Storefront, "Ambil pesanan di resto")
                    Text(merchant, color = FoodOfferInk, style = androidx.compose.material3.MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                    Text(order.pickupAddress.ifBlank { "Alamat resto sedang disinkronkan" }, color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        FoodOfferBadge("Kode $orderCode", FoodOfferCanvas, FoodOfferInk)
                        FoodOfferBadge("${order.foodItems.sumOf { it.quantity }.takeIf { it > 0 } ?: order.foodItems.size} item", FoodOfferCanvas, FoodOfferInk)
                    }
                    Surface(color = FoodOfferMint.copy(alpha = 0.7f), shape = RoundedCornerShape(12.dp)) {
                        Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.Schedule, contentDescription = null, tint = FoodOfferGreen, modifier = Modifier.size(18.dp))
                            Text("Status dapur mengikuti update merchant dari server", color = FoodOfferGreen, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                        }
                    }
                    if (order.foodItems.isNotEmpty()) {
                        order.foodItems.take(4).forEach { item ->
                            Text("${item.quantity}× ${item.name.ifBlank { "Item makanan" }}${item.variants.takeIf { it.isNotEmpty() }?.joinToString(prefix = " • ") { it.optionName } ?: ""}", color = FoodOfferInk, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                        }
                        if (order.foodItems.size > 4) Text("+ ${order.foodItems.size - 4} item lainnya", color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
                    } else {
                        Text("Rincian menu sedang disinkronkan dari merchant", color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                    }
                }

                FoodOfferSection {
                    FoodOfferTitleRow(Icons.Default.Place, "Antar ke customer")
                    Text(order.customerName.trim().ifBlank { "Nama customer mengikuti server" }, color = FoodOfferInk, style = androidx.compose.material3.MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                    Text(order.dropAddress.ifBlank { "Alamat customer dibuka dari order server" }, color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
                    if (order.contactless) {
                        FoodOfferSafetyRow(Icons.Default.Security, "Contactless aktif: POD foto tetap wajib")
                    } else {
                        FoodOfferSafetyRow(Icons.Default.CheckCircle, "Konfirmasi nama/order atau OTP saat serah-terima")
                    }
                }

                FoodOfferSection {
                    Text("Standar handoff food", color = FoodOfferForest, style = androidx.compose.material3.MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                    FoodOfferChecklistRow(Icons.Default.QrCodeScanner, "Verifikasi QR/PIN handoff merchant")
                    FoodOfferChecklistRow(Icons.Default.CheckCircle, "Cocokkan jumlah, varian, dan catatan menu")
                    FoodOfferChecklistRow(Icons.Default.CameraAlt, "Pastikan kemasan aman sebelum berangkat")
                    FoodOfferChecklistRow(Icons.Default.Security, "Ambil POD customer; contactless tetap foto")
                }

                if (acceptBlocked) {
                    Surface(color = Color(0xFFFFE6E3), shape = RoundedCornerShape(12.dp)) {
                        Text(blockedReason, modifier = Modifier.padding(11.dp), color = Color(0xFF9B2418), style = androidx.compose.material3.MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                    }
                }
                Button(
                    onClick = { if (canAccept) onAccept() },
                    enabled = canAccept,
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    shape = RoundedCornerShape(999.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = FoodOfferOrange, contentColor = Color.White, disabledContainerColor = Color(0xFFD7DCD8), disabledContentColor = FoodOfferMuted)
                ) {
                    Icon(Icons.Default.TaskAlt, contentDescription = null, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(7.dp))
                    Text("Terima order food ($payoutLabel)", fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Spacer(Modifier.width(4.dp))
                    Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                OutlinedButton(
                    onClick = onReject,
                    enabled = !expired,
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(999.dp),
                    border = BorderStroke(1.dp, FoodOfferBorder)
                ) {
                    Icon(Icons.Default.Cancel, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(7.dp))
                    Text("Tolak tawaran", fontWeight = FontWeight.Bold)
                }
            }

            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
                color = Color.White,
                shadowElevation = 8.dp,
                border = BorderStroke(1.dp, FoodOfferBorder)
            ) {
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 7.dp), horizontalArrangement = Arrangement.SpaceAround) {
                    FoodOfferNavItem(Icons.Default.WorkOutline, "Kerja", true)
                    FoodOfferNavItem(Icons.Default.ReceiptLong, "Order")
                    FoodOfferNavItem(Icons.Default.AccountBalanceWallet, "Dompet")
                    FoodOfferNavItem(Icons.Default.ChatBubbleOutline, "Pesan")
                    FoodOfferNavItem(Icons.Default.Person, "Akun")
                }
            }
        }
    }
}

@Composable
private fun FoodOfferRouteCard(order: Order, mapsProviderConfig: MapsProviderConfig, pickup: LatLng?, drop: LatLng?, distance: String, eta: String) {
    FoodOfferSection {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            FoodOfferBadge("RUTE ORDER FOOD", FoodOfferOrangeSoft, FoodOfferOrange)
            FoodOfferBadge("$distance • $eta", FoodOfferMint, FoodOfferGreen)
        }
        if (pickup != null || drop != null) {
            Box(modifier = Modifier.fillMaxWidth().height(208.dp).clip(RoundedCornerShape(13.dp))) {
                RuntimeMapRenderer(
                    modifier = Modifier.fillMaxSize(),
                    providerConfig = mapsProviderConfig,
                    markers = buildList {
                        pickup?.let { add(RuntimeMapMarker("food-pickup-${order.orderId}", it, "Resto", order.pickupAddress)) }
                        drop?.let { add(RuntimeMapMarker("food-drop-${order.orderId}", it, "Customer", order.dropAddress)) }
                    },
                    routePoints = listOfNotNull(pickup, drop),
                    followLocation = pickup ?: drop,
                    mapUiSettings = MapUiSettings(zoomControlsEnabled = false, myLocationButtonEnabled = false, mapToolbarEnabled = false, scrollGesturesEnabled = false, zoomGesturesEnabled = false, tiltGesturesEnabled = false, rotationGesturesEnabled = false),
                    routeColor = FoodOfferOrange,
                    fallbackTitle = "Rute food",
                    fallbackMessage = "Koordinat dan ETA mengikuti snapshot server"
                )
                Surface(modifier = Modifier.align(Alignment.BottomStart).padding(9.dp), color = Color.White.copy(alpha = 0.94f), shape = RoundedCornerShape(999.dp)) {
                    Row(modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        Icon(Icons.Default.Navigation, contentDescription = null, tint = FoodOfferGreen, modifier = Modifier.size(15.dp))
                        Text("Rute server", color = FoodOfferGreen, style = androidx.compose.material3.MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    }
                }
            }
        } else {
            Surface(modifier = Modifier.fillMaxWidth().height(208.dp), color = FoodOfferCanvas, shape = RoundedCornerShape(13.dp)) {
                Column(modifier = Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Icon(Icons.Default.Map, contentDescription = null, tint = FoodOfferMuted, modifier = Modifier.size(30.dp))
                    Text("Rute food belum tersedia", color = FoodOfferMuted, fontWeight = FontWeight.Bold)
                    Text("Menunggu koordinat dari server", color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun FoodOfferSection(content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth(), color = Color.White, shape = RoundedCornerShape(17.dp), border = BorderStroke(1.dp, FoodOfferBorder)) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp), content = content)
    }
}

@Composable
private fun FoodOfferBadge(text: String, background: Color, contentColor: Color, showDot: Boolean = false) {
    Surface(color = background, contentColor = contentColor, shape = RoundedCornerShape(999.dp)) {
        Row(modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            if (showDot) Surface(modifier = Modifier.size(8.dp), color = contentColor, shape = CircleShape) {}
            Text(text, style = androidx.compose.material3.MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun FoodOfferTitleRow(icon: ImageVector, title: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = FoodOfferGreen, modifier = Modifier.size(21.dp))
        Text(title, color = FoodOfferForest, style = androidx.compose.material3.MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun FoodOfferAmountRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.bodySmall)
        Text(value, color = FoodOfferInk, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun FoodOfferSafetyRow(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Icon(icon, contentDescription = null, tint = FoodOfferGreen, modifier = Modifier.size(17.dp))
        Text(text, color = FoodOfferGreen, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun FoodOfferChecklistRow(icon: ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = FoodOfferOrange, modifier = Modifier.size(18.dp))
        Text(text, color = FoodOfferInk, style = androidx.compose.material3.MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun FoodOfferNavItem(icon: ImageVector, label: String, selected: Boolean = false) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.padding(horizontal = 4.dp)) {
        Icon(icon, contentDescription = label, tint = if (selected) FoodOfferOrange else FoodOfferMuted, modifier = Modifier.size(20.dp))
        Text(label, color = if (selected) FoodOfferOrange else FoodOfferMuted, style = androidx.compose.material3.MaterialTheme.typography.labelSmall, fontWeight = if (selected) FontWeight.Black else FontWeight.SemiBold)
    }
}

private fun foodOfferRemainingSeconds(expiresAt: Long, now: Long): Int =
    (((expiresAt - now).coerceAtLeast(0L) + 999L) / 1_000L).toInt()
