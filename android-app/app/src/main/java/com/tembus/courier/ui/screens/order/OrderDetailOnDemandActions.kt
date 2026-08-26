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
internal fun OnDemandTaskActions(
    order: Order,
    routePreview: CourierRoutePreview?,
    flowState: CourierFlowState,
    cancelPickupReasons: List<CancelPickupReason>,
    pickupScanVerified: Boolean,
    pickupPhotoVerified: Boolean,
    faceVerifiedForPickup: Boolean,
    onVerifyFace: () -> Unit,
    onVerifyPickup: () -> Unit,
    onCapturePickupProof: () -> Unit,
    onCapturePod: () -> Unit,
    onUpdateStatus: (String) -> Unit,
    onStartDelivery: (String) -> Unit,
    onChatClick: () -> Unit,
    onCallClick: () -> Unit,
    onSosClick: () -> Unit,
    onReportIssue: (eventType: String, severity: String, message: String, photoFile: File?) -> Unit,
    onCancelPickup: (reasonCode: String, reasonNote: String?, photoFile: File) -> Unit
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
                        onVerifyPickup = onVerifyPickup,
                        onCapturePickupProof = onCapturePickupProof,
                        onCapturePod = onCapturePod,
                        onUpdateStatus = onUpdateStatus,
                        onStartDelivery = onStartDelivery,
                        onChatClick = onChatClick,
                        onReportFailedDelivery = {
                            onReportIssue("failed_delivery", "high",
                                "Penerima tidak dapat ditemui. Membutuhkan tindak lanjut operasional.", null)
                        }
                    )
                },
                onSecondaryClick = if (flowState.secondaryAction != null) {
                    {
                        onReportIssue("failed_delivery", "high",
                            "Penerima tidak dapat ditemui. Membutuhkan tindak lanjut operasional.", null)
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

            SyncStateNotice(order = order)
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
            onSubmit = { eventType, severity, message, photoFile ->
                showIssueDialog = false
                onReportIssue(eventType, severity, message, photoFile)
            }
        )
    }
}

@Composable
internal fun OnDemandJobHeader(order: Order, phaseTitle: String, phaseInstruction: String) {
    // Di mode DARK: bg = DeepForest (hijau sangat gelap) → teks aksen harus TERANG:
    // DarkAccentLight #FDA66A (9.79:1). Di light: AccentDark #C2410C di bg terang.
    val isDark = isSystemInDarkTheme()
    val accentOnHeader = if (isDark) DarkAccentLight else AccentDark
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = DeepForest,
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(color = LogisticsOrange, shape = RoundedCornerShape(8.dp)) {
                Icon(Icons.Default.Bolt, contentDescription = null, tint = Color.Black, modifier = Modifier.padding(9.dp).size(20.dp))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(phaseTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = Color.White)
                Text(order.displayServiceName(), style = MaterialTheme.typography.labelLarge, color = accentOnHeader, fontWeight = FontWeight.Black)
                Text(phaseInstruction, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.76f))
            }
            Surface(color = Color.White.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                Text(
                    order.estimatedNetEarningsIdr().toRupiahCompact(),
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                    color = Color.White,
                    fontWeight = FontWeight.Black,
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

@Composable
internal fun OnDemandProgressTimeline(pickupDone: Boolean, deliveryDone: Boolean, isServiceOrder: Boolean = false) {
    if (isServiceOrder) {
        Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
            OnDemandTimelineItem(
                icon = Icons.Default.Build,
                title = "Tiba di lokasi",
                subtitle = "Verifikasi identitas di titik layanan",
                done = pickupDone,
                active = !pickupDone
            )
            OnDemandTimelineItem(
                icon = Icons.Default.Settings,
                title = "Proses perbaikan",
                subtitle = "Kerjakan layanan sesuai pesanan customer",
                done = deliveryDone,
                active = pickupDone && !deliveryDone
            )
            OnDemandTimelineItem(
                icon = Icons.Default.CameraAlt,
                title = "Selesai & Dokumentasi",
                subtitle = "Foto hasil pekerjaan sebagai bukti",
                done = deliveryDone,
                active = false,
                showConnector = false
            )
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
            OnDemandTimelineItem(
                icon = Icons.Default.Storefront,
                title = "Jemput barang",
                subtitle = "Scan kode paket dan foto barang di titik pickup",
                done = pickupDone,
                active = !pickupDone
            )
            OnDemandTimelineItem(
                icon = Icons.Default.Navigation,
                title = "Perjalanan ke penerima",
                subtitle = "Navigasi aktif setelah pickup tervalidasi",
                done = deliveryDone,
                active = pickupDone && !deliveryDone
            )
            OnDemandTimelineItem(
                icon = Icons.Default.CameraAlt,
                title = "Bukti Terima",
                subtitle = "Foto bukti terima di titik penerima",
                done = deliveryDone,
                active = false,
                showConnector = false
            )
        }
    }
}

@Composable
internal fun OnDemandTimelineItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    done: Boolean,
    active: Boolean,
    showConnector: Boolean = true
) {
    val color = when {
        done -> Success
        active -> LogisticsOrange
        else -> MaterialTheme.colorScheme.outline
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Surface(
                modifier = Modifier.size(34.dp),
                color = color.copy(alpha = if (done || active) 0.16f else 0.08f),
                shape = RoundedCornerShape(8.dp),
                border = BorderStroke(1.dp, color.copy(alpha = 0.34f))
            ) {
                Icon(
                    imageVector = if (done) Icons.Default.CheckCircle else icon,
                    contentDescription = null,
                    tint = color,
                    modifier = Modifier.padding(8.dp)
                )
            }
            if (showConnector) {
                Box(
                    modifier = Modifier
                        .width(1.dp)
                        .height(22.dp)
                        .padding(vertical = 2.dp)
                        .then(Modifier)
                ) {
                    Surface(modifier = Modifier.fillMaxSize(), color = color.copy(alpha = 0.28f)) {}
                }
            }
        }
        Column(modifier = Modifier.padding(top = 2.dp).weight(1f)) {
            // done/active: colorScheme.primary (dark=#239158 terang di bg gelap; light=#005C32 di bg terang).
            // JANGAN DeepForest/Primary hardcode — gelap-on-gelap = samar (rasio 1:1 / 1.79).
            Text(title, fontWeight = FontWeight.Bold, color = if (done || active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            Text(subtitle, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
internal fun OnDemandCurrentStopCard(
    title: String,
    address: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    gateLabel: String
) {
    // bg adaptif: OnDemandSurface terang utk LIGHT; DarkSurface utk DARK
    // (teks onSurface = putih di dark — harus di atas bg gelap, bukan kartu terang).
    val isDark = isSystemInDarkTheme()
    val cardBg = if (isDark) DarkSurface else OnDemandSurface
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = cardBg,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.16f))
    ) {
        Row(
            modifier = Modifier.padding(14.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Surface(color = Color.White, shape = RoundedCornerShape(8.dp)) {
                Icon(icon, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(9.dp).size(20.dp))
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(title, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    address,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(gateLabel, style = MaterialTheme.typography.labelMedium, color = if (isSystemInDarkTheme()) DarkAccentLight else Primary, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun OnDemandProofPanel(
    title: String,
    subtitle: String,
    primaryIcon: androidx.compose.ui.graphics.vector.ImageVector,
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryIcon: androidx.compose.ui.graphics.vector.ImageVector,
    secondaryLabel: String,
    onSecondary: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (isSystemInDarkTheme()) DarkSurfaceVariant else Color.White,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.18f))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onSurface)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = onPrimary,
                    modifier = Modifier.weight(1f).height(52.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.White)
                ) {
                    Icon(primaryIcon, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(primaryLabel, fontWeight = FontWeight.Black)
                }
                OutlinedButton(
                    onClick = onSecondary,
                    modifier = Modifier.weight(1f).height(52.dp),
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, Primary.copy(alpha = 0.42f))
                ) {
                    Icon(secondaryIcon, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(secondaryLabel, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
internal fun CourierNextActionPanel(
    flowState: CourierFlowState,
    onClick: () -> Unit,
    onSecondaryClick: (() -> Unit)? = null,
    helperTextOverride: String? = null
) {
    val action = flowState.nextAction
    val hasAction = action.type != CourierNextActionType.NONE
    val secondary = flowState.secondaryAction
    // bg adaptif: jangan oranye 12% transparan di bg gelap (jadi brownish — teks samar).
    val isDark = isSystemInDarkTheme()
    val panelBgColor = if (isDark) DarkSurfaceVariant else com.tembus.courier.ui.theme.Surface
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = panelBgColor,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(
            1.dp,
            if (hasAction) LogisticsOrange.copy(alpha = 0.5f) else Success.copy(alpha = 0.5f)
        )
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Surface(color = Color.White, shape = RoundedCornerShape(8.dp)) {
                    Icon(
                        courierActionIcon(action.type),
                        contentDescription = null,
                        tint = if (hasAction) LogisticsOrange else Success,
                        modifier = Modifier.padding(8.dp).size(20.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Aksi berikutnya", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onSurface)
                    Text(
                        helperTextOverride ?: action.helperText,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
            if (hasAction) {
                val isSwipeAction = action.type == CourierNextActionType.START_DELIVERY ||
                    action.type == CourierNextActionType.COMPLETE_DELIVERY ||
                    action.type == CourierNextActionType.ACCEPT_OFFER
                if (isSwipeAction) {
                    SwipeToActionTrack(
                        label = "SWIPE UNTUK ${action.label.uppercase()}  →",
                        icon = courierActionIcon(action.type),
                        onAction = onClick
                    )
                } else {
                    Button(
                        onClick = onClick,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = LogisticsOrange, contentColor = Color.White)
                    ) {
                        Icon(courierActionIcon(action.type), contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(action.label, fontWeight = FontWeight.Black)
                    }
                }
                // S2-OS-03: Secondary action for on-demand failed delivery
                if (secondary != null && onSecondaryClick != null) {
                    OutlinedButton(
                        onClick = onSecondaryClick,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.55f))
                    ) {
                        Icon(courierActionIcon(secondary.type), contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(secondary.label, fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                Text(action.label, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = Success)
            }
        }
    }
}

@Composable
internal fun SwipeToActionTrack(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onAction: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val density = LocalDensity.current
    var trackWidthPx by remember { mutableFloatStateOf(0f) }
    val swipeProgress = remember { Animatable(0f) }
    var hasTriggered by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val thumbSize = 52.dp
    val trackPadding = 4.dp
    val threshold = 0.80f

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(thumbSize + trackPadding * 2)
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White)
            .border(BorderStroke(2.dp, LogisticsOrange), RoundedCornerShape(8.dp))
            .onSizeChanged { size -> trackWidthPx = size.width.toFloat() }
    ) {
        val progressWidth by swipeProgress.asState()
        Box(
            modifier = Modifier
                .align(Alignment.CenterStart)
                .fillMaxHeight()
                .width(with(density) { (progressWidth * trackWidthPx).toDp() }.coerceAtMost(
                    with(density) { trackWidthPx.toDp() }
                ))
                .clip(RoundedCornerShape(8.dp))
                .background(LogisticsOrange.copy(alpha = 0.35f))
        )

        if (progressWidth < 0.05f) {
            Text(
                text = label,
                modifier = Modifier.align(Alignment.Center),
                color = DeepForest,
                fontWeight = FontWeight.Black,
                fontSize = 14.sp
            )
        }

        val thumbOffsetPx = swipeProgress.value * (trackWidthPx - with(density) { thumbSize.toPx() })
        Box(
            modifier = Modifier
                .offset { IntOffset(thumbOffsetPx.toInt(), 0) }
                .padding(trackPadding)
                .size(thumbSize - trackPadding * 2)
                .clip(RoundedCornerShape(6.dp))
                .background(LogisticsOrange)
                .pointerInput(Unit) {
                    detectHorizontalDragGestures(
                        onDragEnd = {
                            scope.launch {
                                if (swipeProgress.value >= threshold && !hasTriggered) {
                                    hasTriggered = true
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    swipeProgress.animateTo(
                                        1f,
                                        animationSpec = tween(150, easing = FastOutSlowInEasing)
                                    )
                                    onAction()
                                } else if (!hasTriggered) {
                                    swipeProgress.animateTo(
                                        0f,
                                        animationSpec = tween(300, easing = FastOutSlowInEasing)
                                    )
                                }
                            }
                        },
                        onHorizontalDrag = { _, dragAmount ->
                            if (!hasTriggered) {
                                scope.launch {
                                    val delta = dragAmount / (trackWidthPx - with(density) { thumbSize.toPx() })
                                    val newValue = (swipeProgress.value + delta).coerceIn(0f, 1f)
                                    swipeProgress.snapTo(newValue)
                                }
                            }
                        }
                    )
                },
            contentAlignment = Alignment.Center
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = Color.Black,
                modifier = Modifier.size(22.dp)
            )
        }
    }
}

@Composable
internal fun ActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    prominent: Boolean = false,
    containerColor: Color = Secondary,
    contentColor: Color = Color.White,
    onClick: () -> Unit
) {
    val colors = if (prominent) {
        ButtonDefaults.buttonColors(containerColor = containerColor, contentColor = contentColor)
    } else {
        ButtonDefaults.outlinedButtonColors(contentColor = Primary)
    }
    val border = if (prominent) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline)

    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(52.dp),
        shape = RoundedCornerShape(8.dp),
        colors = colors,
        border = border
    ) {
        Icon(icon, contentDescription = null)
        Spacer(modifier = Modifier.width(8.dp))
        Text(label)
    }
    Spacer(modifier = Modifier.height(8.dp))
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
