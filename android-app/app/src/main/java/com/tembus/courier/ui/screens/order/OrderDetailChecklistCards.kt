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

import com.tembus.courier.ui.screens.order.*

@Composable
internal fun FoodItemsCard(order: Order) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = if (isSystemInDarkTheme()) DarkSurfaceVariant else Color.White,
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
internal fun PackageChecklistCard(order: Order, deliveryDone: Boolean) {
    val packageItems = order.packages
    val hasPackageRows = packageItems.isNotEmpty()
    val countLabel = if (hasPackageRows) packageItems.size else order.packageCount.coerceAtLeast(1)
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        color = if (isSystemInDarkTheme()) DarkSurfaceVariant else Color.White,
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
internal fun ServiceChecklistCard(
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

@Composable
internal fun RegularFailedDeliveryPanel(order: Order, onReportFailed: () -> Unit) {
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
internal fun OrderInfoCard(order: Order) {
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
