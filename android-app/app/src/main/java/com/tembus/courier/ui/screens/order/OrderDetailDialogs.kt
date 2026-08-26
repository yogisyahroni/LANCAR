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
internal fun CancelPickupDialog(
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

internal fun saveCancellationPhoto(context: android.content.Context, orderId: String, bitmap: Bitmap): File {
    val safeOrderId = orderId.replace(Regex("[^A-Za-z0-9_-]"), "_")
    val file = File(context.cacheDir, "pickup_cancel_${safeOrderId}_${System.currentTimeMillis()}.jpg")
    FileOutputStream(file).use { out ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 88, out)
    }
    return file
}

@Composable
internal fun CourierIssueReportDialog(
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
                colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.White)
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

internal data class CourierIssueReason(
    val code: String,
    val title: String,
    val description: String,
    val severity: String
)

internal fun saveIssuePhoto(context: android.content.Context, orderId: String, issueCode: String, bitmap: Bitmap): File {
    val safeOrderId = orderId.replace(Regex("[^A-Za-z0-9_-]"), "_")
    val safeIssueCode = issueCode.replace(Regex("[^A-Za-z0-9_-]"), "_")
    val file = File(context.cacheDir, "issue_${safeIssueCode}_${safeOrderId}_${System.currentTimeMillis()}.jpg")
    FileOutputStream(file).use { out ->
        bitmap.compress(Bitmap.CompressFormat.JPEG, 88, out)
    }
    return file
}

@Composable
internal fun OrderStatusOptions(
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

internal fun isPickupPhotoRequired(order: Order, transitions: List<OrderStatusTransition>): Boolean {
    if (order.normalizedWorkflowRole() == "on_demand") return true
    if (order.pickupPhotoVerified || order.scanType == "pickup_photo") return true

    val currentStatus = order.status.trim()
    return transitions.any { transition ->
        transition.fromStatus.equals(currentStatus, ignoreCase = true) &&
            transition.requiresProof &&
            transition.toStatus.lowercase(Locale.getDefault()) in setOf("picked_up", "pickup_verified", "in_transit")
    }
}
