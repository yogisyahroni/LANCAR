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

@Composable
internal fun SyncStateNotice(order: Order) {
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

    val isDark = isSystemInDarkTheme()
    Surface(
        modifier = Modifier.fillMaxWidth(),
        // bg solid adaptif — jangan success 10% transparan di dark (jadi gelap, teks DeepForest samar).
        color = if (isDark) color.copy(alpha = 0.18f) else color.copy(alpha = 0.10f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, color.copy(alpha = 0.45f))
    ) {
        Row(
            modifier = Modifier.padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
            Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Medium)
        }
    }
}

internal fun runCourierNextAction(
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

internal fun courierActionIcon(type: CourierNextActionType): androidx.compose.ui.graphics.vector.ImageVector {
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

