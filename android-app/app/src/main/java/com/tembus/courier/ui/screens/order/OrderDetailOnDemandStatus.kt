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
internal fun MandatoryPickupChecklist(
    faceDone: Boolean,
    scanDone: Boolean,
    photoDone: Boolean
) {
    // bg adaptif: PrimaryLight transparan di dark = hijau gelap → teks DeepForest samar.
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
                "Syarat mulai pengantaran",
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.onSurface
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

@Composable
internal fun VerificationRequirementRow(
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
internal fun LocationGateStatus(order: Order, targetPickup: Boolean) {
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
    val isDark = isSystemInDarkTheme()

    Surface(
        color = if (isDark) color.copy(alpha = 0.20f) else color.copy(alpha = 0.12f),
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
                Text(copy, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Medium)
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
internal fun OnDemandStepper(pickupDone: Boolean, deliveryDone: Boolean) {
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
internal fun OnDemandSupportActions(
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
