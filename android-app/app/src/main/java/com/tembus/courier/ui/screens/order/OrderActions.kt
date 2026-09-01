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
    onVerifyFace: () -> Unit = {},
    onMarkPickupArrived: (String) -> Unit = {},
    onRetrySync: () -> Unit = {},
    onUseServerVersion: () -> Unit = {}
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
                        onMarkPickupArrived = onMarkPickupArrived,
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

            SyncStateNotice(order = order, onRetrySync = onRetrySync, onUseServerVersion = onUseServerVersion)
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

internal data class CourierIssueReason(
    val code: String,
    val title: String,
    val description: String,
    val severity: String
)
