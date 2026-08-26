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
internal fun TambalBanReportCard(report: com.tembus.courier.data.model.TambalBanReport) {
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
internal fun TowingReportCard(report: com.tembus.courier.data.model.TowingReport) {
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

internal fun openNavigation(
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

internal fun serviceTitle(order: Order): String {
    val sc = order.serviceCode.orEmpty().lowercase()
    return when {
        sc.startsWith("towing") -> "Layanan Towing"
        sc.startsWith("tambal_ban") -> "Layanan Tambal Ban"
        else -> "Layanan"
    }
}

internal fun serviceNextActionHelper(order: Order): String {
    val sc = order.serviceCode.orEmpty().lowercase()
    return if (sc.startsWith("towing"))
        "Scan wajah untuk membuktikan identitas teknisi di lokasi kendaraan customer."
    else
        "Scan wajah untuk membuktikan identitas teknisi di lokasi layanan."
}

internal fun servicePhaseTitle(order: Order): String {
    val sc = order.serviceCode.orEmpty().lowercase()
    return when {
        sc.startsWith("towing") -> "Proses Towing"
        sc.startsWith("tambal_ban") -> "Proses Tambal Ban"
        else -> "Proses Layanan"
    }
}

internal fun servicePhaseInstruction(order: Order): String {
    val sc = order.serviceCode.orEmpty().lowercase()
    return when {
        sc.startsWith("towing") -> "Menuju lokasi kendaraan customer untuk layanan towing."
        sc.startsWith("tambal_ban") -> "Menuju lokasi kendaraan customer untuk perbaikan ban."
        else -> "Menuju lokasi layanan."
    }
}

@Composable
internal fun OrderActions(
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
