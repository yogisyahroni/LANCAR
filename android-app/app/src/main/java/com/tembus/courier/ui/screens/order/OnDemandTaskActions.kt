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
internal fun OnDemandTaskActions(
    order: Order,
    routePreview: CourierRoutePreview?,
    flowState: CourierFlowState,
    cancelPickupReasons: List<CancelPickupReason>,
    pickupScanVerified: Boolean,
    pickupPhotoVerified: Boolean,
    faceVerifiedForPickup: Boolean,
    onVerifyFace: () -> Unit,
    onMarkPickupArrived: (String) -> Unit,
    onVerifyPickup: () -> Unit,
    onCapturePickupProof: () -> Unit,
    onCapturePod: () -> Unit,
    onUpdateStatus: (String) -> Unit,
    onStartDelivery: (String) -> Unit,
    onChatClick: () -> Unit,
    onCallClick: () -> Unit,
    onSosClick: () -> Unit,
    onReportIssue: (eventType: String, reasonCode: String?, severity: String, message: String, photoFile: File?) -> Unit,
    onCancelPickup: (reasonCode: String, reasonNote: String?, photoFile: File) -> Unit,
    onRetrySync: () -> Unit = {},
    onUseServerVersion: () -> Unit = {}
) {
    val context = LocalContext.current
    var showCancelPickupDialog by remember { mutableStateOf(false) }
    var showIssueDialog by remember { mutableStateOf(false) }

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
                phaseTitle = flowState.title,
                phaseInstruction = flowState.instruction
            )

            OnDemandCurrentStopCard(
                title = flowState.activeAddressLabel,
                address = flowState.activeAddress,
                icon = if (flowState.targetIsPickup) Icons.Default.Storefront else Icons.Default.LocationOn,
                gateLabel = if (flowState.targetIsPickup) "Validasi di titik pickup" else "Validasi di titik penerima"
            )

            CourierNextActionPanel(
                flowState = flowState,
                onClick = {
                    runCourierNextAction(
                        context = context,
                        flowState = flowState,
                        onVerifyFace = onVerifyFace,
                        onMarkPickupArrived = onMarkPickupArrived,
                        onVerifyPickup = onVerifyPickup,
                        onCapturePickupProof = onCapturePickupProof,
                        onCapturePod = onCapturePod,
                        onUpdateStatus = onUpdateStatus,
                        onStartDelivery = onStartDelivery,
                        onChatClick = onChatClick,
                        onReportFailedDelivery = {
                            showIssueDialog = true
                        }
                    )
                },
                onSecondaryClick = if (flowState.secondaryAction != null) {
                    {
                        showIssueDialog = true
                    }
                } else null
            )

            RouteStateStrip(routePreview)
            LocationGateStatus(order = order, targetPickup = flowState.targetIsPickup)

            if (!flowState.deliveryDone) {
                ActionButton(
                    icon = Icons.Default.Navigation,
                    label = if (flowState.targetIsPickup) "Navigasi ke pickup" else "Navigasi ke penerima",
                    prominent = false,
                    onClick = { openNavigation(context, flowState.activeAddress) }
                )
            }

            SyncStateNotice(order = order, onRetrySync = onRetrySync, onUseServerVersion = onUseServerVersion)
            OnDemandProgressTimeline(pickupDone = flowState.pickupDone, deliveryDone = flowState.deliveryDone, isServiceOrder = false)

            if (!flowState.pickupDone) {
                // FB-105: order food tampilkan isi pesanan (snapshot
                // food_order_items) — driver tidak boleh buta terhadap
                // menu yang dijemput. Parcel tetap pakai checklist paket.
                if (order.foodItems.isNotEmpty()) {
                    FoodItemsCard(order = order)
                } else {
                    PackageChecklistCard(order = order, deliveryDone = flowState.deliveryDone)
                }
                MandatoryPickupChecklist(
                    faceDone = faceVerifiedForPickup,
                    scanDone = pickupScanVerified,
                    photoDone = pickupPhotoVerified
                )
                order.itemDescription?.takeIf { it.isNotBlank() }?.let {
                    VerificationNotice("Isi paket: $it. Pastikan foto memperlihatkan kondisi barang sebelum dibawa.")
                }
            } else if (!flowState.deliveryDone) {
                VerificationNotice("Pickup lengkap. Bukti terima wajib diambil saat paket sudah diserahkan ke penerima.")
            } else {
                VerificationNotice("Pengiriman selesai. Tidak ada tindakan lanjutan untuk pekerjaan ini.")
            }

            OnDemandSupportActions(
                pickupDone = flowState.pickupDone,
                onChatClick = onChatClick,
                onCallClick = onCallClick,
                onSosClick = onSosClick,
                onIssueClick = { showIssueDialog = true },
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

    if (showIssueDialog) {
        CourierIssueReportDialog(
            order = order,
            pickupDone = flowState.pickupDone,
            onDismiss = { showIssueDialog = false },
            onSubmit = { eventType, reasonCode, severity, message, photoFile ->
                showIssueDialog = false
                onReportIssue(eventType, reasonCode, severity, message, photoFile)
            }
        )
    }
}
