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
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
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
                    contentDescription = CourierTextCatalog.translate("Foto Paket"),
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
