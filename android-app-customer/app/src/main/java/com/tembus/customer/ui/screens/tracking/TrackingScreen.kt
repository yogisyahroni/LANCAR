package com.tembus.customer.ui.screens.tracking

import android.graphics.Bitmap
import androidx.compose.material3.MaterialTheme
import android.graphics.BitmapFactory
import android.graphics.Canvas
import androidx.annotation.DrawableRes
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.ui.components.maps.CameraUpdateFactory
import com.tembus.customer.ui.components.maps.BitmapDescriptorFactory
import com.tembus.customer.ui.components.maps.CameraPosition
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.ui.components.maps.*
import com.tembus.customer.BuildConfig
import com.tembus.customer.R
import com.tembus.customer.data.model.OrderTrackingDetail
import com.tembus.customer.ui.components.maps.RuntimeMapMarker
import com.tembus.customer.ui.components.maps.RuntimeMapRenderer
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.screens.rating.CourierRatingDialog
import com.tembus.customer.ui.screens.rating.CourierRatingViewModel
import com.tembus.customer.ui.screens.rating.MerchantRatingDialog
import com.tembus.customer.ui.screens.rating.MerchantRatingViewModel
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.screens.tip.TipDialog
import com.tembus.customer.ui.screens.tip.TipViewModel
import androidx.compose.material.icons.filled.VolunteerActivism

@Composable
fun TrackingScreen(
    orderId: String,
    viewModel: TrackingViewModel,
    onBackClick: () -> Unit,
    onChatClick: (String, String?) -> Unit,
    onCallClick: (String, String?) -> Unit,
    ratingViewModel: CourierRatingViewModel = hiltViewModel(),
    merchantRatingViewModel: MerchantRatingViewModel = hiltViewModel(),
    tipViewModel: TipViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val ratingState by ratingViewModel.uiState.collectAsStateWithLifecycle()
    val merchantRatingState by merchantRatingViewModel.uiState.collectAsStateWithLifecycle()
    val tipState by tipViewModel.uiState.collectAsStateWithLifecycle()

    // Tracking lifecycle management
    DisposableEffect(orderId) {
        viewModel.startTracking(orderId)
        tipViewModel.checkTipStatus(orderId)
        onDispose {
            viewModel.stopTracking()
        }
    }

    // Tampilkan dialog rating otomatis ketika order DELIVERED dan belum di-rating
    // courierRating == null berarti customer belum memberikan penilaian
    LaunchedEffect(uiState.detail?.order?.status, uiState.detail?.order?.courierRating) {
        val order = uiState.detail?.order
        if (order != null &&
            order.status.lowercase() == "delivered" &&
            order.courierRating == null &&
            ratingState.pendingReminders.isEmpty() &&
            !ratingState.isSubmitted
        ) {
            ratingViewModel.prepareFromTrackingOrder(
                orderId = orderId,
                orderNumber = order.orderNumber ?: "",
                courierName = order.courierName ?: "",
                courierPhotoUrl = order.courierPhotoUrl ?: "",
                courierPlate = order.courierPlate ?: ""
            )
        }
    }

    // FOOD-BIKE-060: merchant rating hanya dibuka setelah alur rating kurir selesai.
    var lastCourierReminderCount by remember(orderId) { mutableStateOf(0) }
    var openMerchantRating by remember(orderId) { mutableStateOf(false) }

    LaunchedEffect(ratingState.pendingReminders.size, ratingState.isSubmitted) {
        val currentReminderCount = ratingState.pendingReminders.size
        if (ratingState.isSubmitted) {
            openMerchantRating = true
        } else if (lastCourierReminderCount > 0 && currentReminderCount == 0) {
            openMerchantRating = true
        }
        lastCourierReminderCount = currentReminderCount
    }

    LaunchedEffect(openMerchantRating, uiState.detail?.order?.merchantId) {
        val order = uiState.detail?.order
        if (openMerchantRating &&
            order != null &&
            !order.merchantId.isNullOrBlank() &&
            !merchantRatingState.showDialog &&
            !merchantRatingState.isSubmitted
        ) {
            merchantRatingViewModel.prepare(
                orderId = orderId,
                orderNumber = order.orderNumber ?: "",
                merchantName = order.merchantName ?: "Merchant"
            )
            openMerchantRating = false
        }
    }

    val mapMarkers = remember(uiState.courierLocation, uiState.detail?.order?.courierName) {
        uiState.courierLocation?.let { loc ->
            listOf(
                RuntimeMapMarker(
                    id = "courier",
                    position = loc,
                    title = uiState.detail?.order?.courierName ?: "Kurir Anda",
                    snippet = "Posisi diperbarui otomatis"
                )
            )
        } ?: emptyList()
    }

    Box(modifier = Modifier.fillMaxSize()) {
        
        // LAYER 1: MAP VIEW
        val mapProps = remember { MapProperties(isMyLocationEnabled = true) }
        val mapUi = remember { 
            MapUiSettings(
                zoomControlsEnabled = false,
                myLocationButtonEnabled = false,
                compassEnabled = true
            )
        }
        
        RuntimeMapRenderer(
            providerConfig = uiState.mapsProviderConfig,
            markers = mapMarkers,
            routePoints = uiState.routePoints,
            followLocation = uiState.courierLocation,
            mapProperties = mapProps,
            mapUiSettings = mapUi,
            routeColor = Primary,
            fallbackTitle = "Tracking tetap aktif",
            fallbackMessage = "Posisi kurir dan ETA tetap diperbarui otomatis.",
            modifier = Modifier.fillMaxSize()
        )

        // LAYER 2: TOP NAVIGATION OVERLAY
        SafeAreaWrapper {
            IconButton(
                onClick = onBackClick,
                modifier = Modifier
                    .padding(20.dp)
                    .size(48.dp)
                    .clip(CircleShape)
                    .shadow(10.dp, CircleShape)
                    .background(MaterialTheme.colorScheme.surface)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Kembali",
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }

        // LAYER 3: LOADING OVERLAY
        if (uiState.isLoading && uiState.courierLocation == null) {
            Text(
                text = "Memuat posisi kurir...",
                modifier = Modifier.align(Alignment.Center),
                color = Primary,
                fontWeight = FontWeight.Bold
            )
        }

        // LAYER 3.5: SOS EMERGENCY FAB — hanya aktif saat kurir dalam perjalanan
        // S2-CUSTOMER-01: SOS Button implementation removed as per decision

        // LAYER 4: LIVE STATUS PANEL
        AnimatedVisibility(
            visible = uiState.courierLocation != null,
            enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
            modifier = Modifier.align(Alignment.BottomCenter)
        ) {
            CourierStatusCard(
                eta = uiState.eta ?: "Menghitung...",
                detail = uiState.detail,
                staleTrackingReason = uiState.staleTrackingReason,
                lastLiveTrackingAt = uiState.lastLiveTrackingAt,
                onCallClick = {
                    onCallClick(orderId, uiState.detail?.order?.courierName)
                },
                onChatClick = {
                    // Seamless navigation into real-time full duplex chat screen passing the courier metadata
                    onChatClick(
                        orderId,
                        uiState.detail?.order?.courierName
                    )
                },
                hasUnreadMessage = uiState.hasUnreadMessage,
                // FB-077: tip — tampil saat kurir sudah ditugaskan, status eligible, belum di-tip
                canTip = !tipState.tipped &&
                    uiState.detail?.order?.courierName != null &&
                    (uiState.detail?.order?.status?.lowercase() in tipEligibleCustomerStatuses),
                onTipClick = {
                    val order = uiState.detail?.order
                    tipViewModel.prepare(
                        orderId = orderId,
                        orderNumber = order?.orderNumber ?: "",
                        courierName = order?.courierName ?: ""
                    )
                },
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 24.dp)
            )
        }

        // LAYER 5: SEARCH TIMEOUT RETRY SHEET
        // S2-CUSTOMER-03: Muncul saat order cancelled karena no_driver_found
        val showSearchTimeout = uiState.detail?.order?.status?.lowercase() in setOf("cancelled", "failed")
            && uiState.detail?.order?.courierName == null
        if (showSearchTimeout && uiState.courierLocation == null) {
            SearchTimeoutSheet(
                orderId = orderId,
                viewModel = viewModel,
                modifier = Modifier.align(Alignment.BottomCenter).padding(16.dp)
            )
        }

        // LAYER 6: RATING DIALOG
        // Muncul otomatis saat order DELIVERED. Customer bisa skip (Ingatkan Nanti).
        // Jika ada pending reminders atau baru saja di-prepare dari tracking, tampilkan dialog.
        val showRatingDialog = ratingState.pendingReminders.isNotEmpty()
        if (showRatingDialog) {
            CourierRatingDialog(
                courierName = ratingState.courierName,
                courierPhotoUrl = ratingState.courierPhotoUrl,
                courierPlate = ratingState.courierPlate,
                orderNumber = ratingState.orderNumber,
                isSubmitting = ratingState.isSubmitting,
                isSubmitted = ratingState.isSubmitted,
                errorMessage = ratingState.error,
                onSubmit = { rating, comment ->
                    val currentOrderId = ratingState.pendingReminders
                        .getOrNull(ratingState.currentReminderIndex)?.orderId ?: orderId
                    ratingViewModel.submitRating(currentOrderId, rating, comment)
                },
                onDismiss = { ratingViewModel.dismissCurrentReminder() },
                onDismissError = { ratingViewModel.clearError() }
            )
        }

        // FOOD-BIKE-060: dialog rating merchant (muncul setelah rating kurir selesai)
        if (merchantRatingState.showDialog) {
            MerchantRatingDialog(
                merchantName = merchantRatingState.merchantName,
                orderNumber = merchantRatingState.orderNumber,
                isSubmitting = merchantRatingState.isSubmitting,
                isSubmitted = merchantRatingState.isSubmitted,
                errorMessage = merchantRatingState.error,
                onSubmit = { rating, comment ->
                    merchantRatingViewModel.submitRating(rating, comment)
                },
                onDismiss = { merchantRatingViewModel.dismiss() },
                onDismissError = { merchantRatingViewModel.clearError() }
            )
        }

        // FB-077: dialog tip kurir (semua service)
        if (tipState.showDialog) {
            TipDialog(
                courierName = tipState.courierName,
                orderNumber = tipState.orderNumber,
                isSubmitting = tipState.isSubmitting,
                isSubmitted = tipState.isSubmitted,
                errorMessage = tipState.error,
                onSubmit = { amount -> tipViewModel.submitTip(amount) },
                onDismiss = { tipViewModel.dismiss() },
                onDismissError = { tipViewModel.clearError() }
            )
        }
    }
}

// FB-077: status order customer yang masih bisa di-tip
// (selaras dengan eligible statuses di backend tip_service.go)
private val tipEligibleCustomerStatuses = setOf(
    "accepted", "picking_up", "picked_up",
    "inbound_origin", "outbound_origin", "inbound_destination", "outbound_destination",
    "delivering", "delivered"
)

@Composable
private fun RuntimeMapFallback(
    provider: String,
    reason: String?,
    courierLocation: LatLng?,
    eta: String?,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(Color(0xFFEFF6FF)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .padding(24.dp)
                .fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier.padding(22.dp),
                horizontalAlignment = Alignment.Start
            ) {
                Text(
                    text = if (provider == "openstreetmap") "Peta OpenStreetMap aktif" else "Mode peta teks aktif",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Color(0xFF0B3D2E)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Pelacakan tetap berjalan realtime dan mengikuti konfigurasi operasional terbaru.",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = courierLocation?.let { "Kurir: ${"%.5f".format(it.latitude)}, ${"%.5f".format(it.longitude)}" }
                        ?: "Menunggu koordinat kurir...",
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = eta?.let { "Estimasi: $it" } ?: "Estimasi dihitung otomatis saat lokasi tersedia.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )
                if (!reason.isNullOrBlank()) {
                    Text(
                        text = reason.replace("_", " "),
                        color = Color(0xFF92400E),
                        fontSize = 12.sp,
                        modifier = Modifier
                            .padding(top = 14.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFFFFFBEB))
                            .padding(horizontal = 12.dp, vertical = 8.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun CourierStatusCard(
    eta: String,
    detail: OrderTrackingDetail?,
    staleTrackingReason: String?,
    lastLiveTrackingAt: Long?,
    onCallClick: () -> Unit,
    onChatClick: () -> Unit,
    hasUnreadMessage: Boolean,
    canTip: Boolean = false,
    onTipClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val sessionManager = remember(context) { com.tembus.customer.data.session.AuthSessionManager(context) }
    val authToken by sessionManager.authToken.collectAsState(initial = null)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .shadow(24.dp, RoundedCornerShape(24.dp)),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(
            modifier = Modifier.padding(20.dp)
        ) {
            val order = detail?.order
            val stageText = remember(order?.status, order?.serviceSubType, order?.statusLabel, detail?.tracking?.stageLabel) {
                order?.statusLabel?.takeIf { it.isNotBlank() }
                    ?: detail?.tracking?.stageLabel?.takeIf { it.isNotBlank() }
                    ?: trackingStageText(order?.status, order?.serviceSubType)
            }
            // ETA Banner
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Primary.copy(alpha = 0.1f))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Icon(
                    painter = painterResource(id = android.R.drawable.ic_menu_recent_history), // system fallback icon
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = stageText,
                    fontWeight = FontWeight.Bold,
                    color = Primary,
                    fontSize = 15.sp
                )
            }
            Text(
                text = if (eta.isBlank() || eta == "Menghitung...") "Lokasi kurir diperbarui otomatis." else "Estimasi $eta",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                modifier = Modifier.padding(start = 32.dp, top = 6.dp)
            )
            staleTrackingReason?.let { reason ->
                Text(
                    text = "${trackingFreshnessLabel(lastLiveTrackingAt)}. $reason",
                    color = Color(0xFF92400E),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .padding(top = 10.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFFFFFBEB))
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Driver Info Row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                // Avatar Placeholder
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFE0E0E0)),
                    contentAlignment = Alignment.Center
                ) {
                    if (!order?.courierPhotoUrl.isNullOrBlank() && authToken != null) {
                        AsyncImage(
                            model = ImageRequest.Builder(context)
                                .data(absoluteUploadUrl(order?.courierPhotoUrl))
                                .addHeader("Authorization", "Bearer $authToken")
                                .crossfade(true)
                                .build(),
                            contentDescription = "Foto Profil Kurir",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    } else {
                        val initials = remember(order?.courierName) {
                            val name = order?.courierName ?: "K"
                            val parts = name.trim().split("\\s+".toRegex())
                            if (parts.size >= 2) {
                                "${parts[0].take(1)}${parts[1].take(1)}".uppercase()
                            } else {
                                name.take(2).uppercase()
                            }
                        }
                        Text(initials, fontWeight = FontWeight.Bold, color = Color.DarkGray)
                    }
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = order?.courierName ?: "Sedang mencari kurir...",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (order?.courierPlate != null) "${order.courierPlate} • ${order.courierVehicle ?: ""}" else "Menghubungkan driver",
                        color = Color.Gray,
                        fontSize = 14.sp
                    )
                }

                // Action Buttons (Call / Chat)
                Row {
                    FilledIconButton(
                        onClick = onCallClick,
                        modifier = Modifier.size(42.dp),
                        shape = CircleShape,
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = Color(0xFFF2F2F7)
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.Call,
                            contentDescription = "Panggil",
                            tint = Color.DarkGray,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Box {
                        FilledIconButton(
                            onClick = onChatClick,
                            modifier = Modifier.size(42.dp),
                            shape = CircleShape,
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = Primary
                            )
                        ) {
                            Icon(
                                imageVector = Icons.Default.ChatBubbleOutline,
                                contentDescription = "Pesan",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        if (hasUnreadMessage) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(11.dp)
                                    .clip(CircleShape)
                                    .background(Accent)
                            )
                        }
                    }
                }
            }

            // FB-077: tombol Kasih Tip — tampil saat kurir ditugaskan & status eligible
            if (canTip) {
                Spacer(modifier = Modifier.height(14.dp))
                Button(
                    onClick = onTipClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFF4E5))
                ) {
                    Icon(
                        imageVector = Icons.Default.VolunteerActivism,
                        contentDescription = null,
                        tint = Primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Kasih Tip ke Kurir",
                        color = Primary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }
            }

            if (detail != null) {
                Spacer(modifier = Modifier.height(18.dp))
                TrackingTimeline(detail = detail)
                PackageSection(detail = detail)
                ProofSection(detail = detail)
            }
        }
    }
}

@Composable
private fun PackageSection(detail: OrderTrackingDetail) {
    if (detail.packages.isEmpty()) return

    Spacer(modifier = Modifier.height(14.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFF7FAFC))
            .padding(14.dp)
    ) {
        Text("Rincian paket", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface)
        Spacer(modifier = Modifier.height(12.dp))
        detail.packages.forEachIndexed { index, item ->
            val scanDone = !item.pickupScanVerifiedAt.isNullOrBlank()
            val photoDone = !item.pickupPhotoVerifiedAt.isNullOrBlank()
            val podDone = !item.deliveryPodVerifiedAt.isNullOrBlank()
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                Surface(
                    shape = CircleShape,
                    color = if (podDone) Primary.copy(alpha = 0.12f) else Color.White
                ) {
                    Text(
                        text = "${item.packageIndex ?: index + 1}",
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                        fontWeight = FontWeight.Black,
                        fontSize = 12.sp,
                        color = Primary
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.description?.takeIf { it.isNotBlank() } ?: "Paket ${index + 1}",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    val meta = buildList {
                        item.packageCode?.takeIf { it.isNotBlank() }?.let { add(it) }
                        item.sizeTier?.takeIf { it.isNotBlank() }?.let { add(it.uppercase()) }
                        item.weightKg?.takeIf { it > 0.0 }?.let { add("${it} kg") }
                    }.joinToString(" • ")
                    if (meta.isNotBlank()) {
                        Text(meta, color = Color.Gray, fontSize = 12.sp)
                    }
                    Text(
                        text = buildList {
                            add(if (scanDone) "Scan pickup OK" else "Scan pickup belum")
                            add(if (photoDone) "Foto pickup OK" else "Foto pickup belum")
                            add(if (podDone) "POD OK" else "POD belum")
                        }.joinToString(" • "),
                        color = if (podDone) Primary else Color.Gray,
                        fontSize = 12.sp
                    )
                }
            }
            if (index != detail.packages.lastIndex) {
                Spacer(modifier = Modifier.height(10.dp))
                HorizontalDivider(color = Color(0xFFE8ECEF))
                Spacer(modifier = Modifier.height(10.dp))
            }
        }
    }
}

@Composable
private fun TrackingTimeline(detail: OrderTrackingDetail) {
    val completedTypes = remember(detail.events) { detail.events.map { it.eventType.lowercase() }.toSet() }
    val status = detail.order.status.lowercase()
    val copy = trackingCopy(detail.order.serviceSubType, detail.order.model, detail.order.merchantId)
    val isFood = copy.kind == TrackingServiceKind.FOOD
    val isCancelled = status in setOf("cancelled", "failed") || completedTypes.contains("pickup_cancelled_by_courier")
    val steps = if (isCancelled) {
        listOf(
            TimelineStep("merchant_order", "Order diterima", true),
            TimelineStep("cancelled", copy.cancelledLabel, true)
        )
    } else if (isFood) {
        // FOOD-BIKE-058: timeline khusus food — tahap merchant sebelum kurir
        // FB-123: kalau status 'scheduled', tampilkan step jadwal dulu.
        fun pastOrAt(vararg states: String) = status in states || status == "delivered" || status == "completed"
        if (status == "scheduled") {
            listOf(
                TimelineStep("scheduled", "Pesanan dijadwalkan", true),
                TimelineStep("merchant_order", "Merchant menerima pesanan", false),
                TimelineStep("merchant_prep", "Makanan disiapkan", false),
                TimelineStep("delivery", "Dalam pengantaran", false)
            )
        } else listOf(
            TimelineStep("merchant_order", "Merchant menerima pesanan", pastOrAt("pending_merchant", "preparing", "searching", "accepted", "picking_up", "picked_up", "delivering")),
            TimelineStep("merchant_prep", "Makanan disiapkan", pastOrAt("preparing", "searching", "accepted", "picking_up", "picked_up", "delivering")),
            TimelineStep("accepted", "Kurir sepeda mengambil", pastOrAt("accepted", "picking_up", "picked_up", "delivering")),
            TimelineStep("pickup", "Diverifikasi di merchant", pastOrAt("picked_up", "delivering")),
            TimelineStep("delivery", "Dalam pengantaran", pastOrAt("delivering")),
            TimelineStep("pod", "POD diterima", status in setOf("delivered", "completed"))
        )
    } else listOf(
        TimelineStep("accepted", copy.acceptedLabel, completedTypes.any { it in setOf("accepted", "courier_assigned", "assigned") } || status in setOf("accepted", "picking_up", "arrived_pickup", "picked_up", "service_started", "in_transit", "delivering", "loading", "unloading", "delivered", "completed")),
        TimelineStep("pickup", copy.pickupLabel, completedTypes.contains("pickup_verified") || status in setOf("arrived_pickup", "picked_up", "service_started", "in_transit", "delivering", "loading", "unloading", "delivered", "completed")),
        TimelineStep("delivery", copy.activeLabel, status in setOf("service_started", "in_transit", "delivering", "loading", "unloading", "delivered", "completed")),
        TimelineStep("pod", copy.completedLabel, completedTypes.contains("pod_verified") || status in setOf("delivered", "completed"))
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFF7FAFC))
            .padding(14.dp)
    ) {
        Text(copy.timelineTitle, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface)
        Spacer(modifier = Modifier.height(12.dp))
        steps.forEachIndexed { index, step ->
            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    imageVector = if (step.done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                    contentDescription = null,
                    tint = if (step.done) Primary else Color.Gray,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(step.label, fontWeight = FontWeight.SemiBold, color = if (step.done) Color(0xFF0B3D2E) else Color.Gray)
                    val event = detail.events.lastOrNull { event -> eventMatchesStep(event.eventType, step.key) }
                    if (event?.createdAt != null) {
                        Text(formatTrackingDate(event.createdAt), color = Color.Gray, fontSize = 12.sp)
                    }
                }
            }
            if (index != steps.lastIndex) {
                Spacer(modifier = Modifier.height(10.dp))
            }
        }
    }
}

@Composable
private fun ProofSection(detail: OrderTrackingDetail) {
    val copy = trackingCopy(detail.order.serviceSubType, detail.order.model, detail.order.merchantId)
    val pickupProof = detail.proofs.lastOrNull {
        it.scanType?.lowercase() in setOf("pickup", "pickup_photo") && !it.photoUrl.isNullOrBlank()
    }
    val podProof = detail.proofs.lastOrNull { it.scanType?.lowercase() == "pod" && !it.photoUrl.isNullOrBlank() }
    val cancellationProof = detail.proofs.lastOrNull {
        it.scanType?.lowercase() == "pickup_cancellation" && !it.photoUrl.isNullOrBlank()
    }
    val serviceProofs = buildList {
        detail.order.tambalBanReport?.let { report ->
            report.tirePhotoBeforeUrl?.takeIf { it.isNotBlank() }?.let { add("Foto ban sebelum" to it) }
            report.tirePhotoAfterUrl?.takeIf { it.isNotBlank() }?.let { add("Foto ban sesudah" to it) }
        }
        detail.order.towingReport?.let { report ->
            report.vehiclePhotoBeforeUrl?.takeIf { it.isNotBlank() }?.let { add("Foto kendaraan sebelum" to it) }
            report.loadingPhotoUrl?.takeIf { it.isNotBlank() }?.let { add("Foto loading" to it) }
            report.unloadingPhotoUrl?.takeIf { it.isNotBlank() }?.let { add("Foto unloading" to it) }
            report.completionPhotoUrl?.takeIf { it.isNotBlank() }?.let { add("Foto completion" to it) }
            report.signatureUrl?.takeIf { it.isNotBlank() }?.let { add("Tanda tangan penerima" to it) }
        }
    }
    if (pickupProof == null && podProof == null && cancellationProof == null && serviceProofs.isEmpty()) return

    Spacer(modifier = Modifier.height(14.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFFFFBF5))
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Image, contentDescription = null, tint = Color(0xFFFF6B00), modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(copy.proofSectionTitle, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF0B3D2E))
        }
        Spacer(modifier = Modifier.height(12.dp))
        val context = LocalContext.current
        val sessionManager = remember(context) { com.tembus.customer.data.session.AuthSessionManager(context) }
        val authToken by sessionManager.authToken.collectAsState(initial = null)
        
        cancellationProof?.let {
            CancellationProofCard(proof = it, authToken = authToken, title = copy.cancelledLabel)
            if (pickupProof != null || podProof != null) {
                Spacer(modifier = Modifier.height(10.dp))
            }
        }
        pickupProof?.let {
            ProofImage(title = copy.pickupProofTitle, url = absoluteUploadUrl(it.photoUrl), authToken = authToken)
            Spacer(modifier = Modifier.height(10.dp))
        }
        podProof?.let {
            ProofImage(title = copy.podProofTitle, url = absoluteUploadUrl(it.photoUrl), authToken = authToken)
        }
        serviceProofs.forEachIndexed { index, proof ->
            if (pickupProof != null || podProof != null || cancellationProof != null || index > 0) {
                Spacer(modifier = Modifier.height(10.dp))
            }
            ProofImage(title = proof.first, url = absoluteUploadUrl(proof.second), authToken = authToken)
        }
    }
}

@Composable
private fun CancellationProofCard(proof: com.tembus.customer.data.model.TrackingProof, authToken: String?, title: String) {
    val reasonText = proof.reasonNote
        ?: proof.overrideReason?.substringAfter(":", missingDelimiterValue = proof.overrideReason)?.trim()
        ?: "Alasan operasional sudah dikirim oleh kurir."
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFFFFF1F1))
            .padding(12.dp)
    ) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFFB42318))
        Spacer(modifier = Modifier.height(4.dp))
        Text(reasonText, fontSize = 13.sp, color = Color(0xFF5F1D1B))
        Spacer(modifier = Modifier.height(10.dp))
        ProofImage(title = "Foto bukti pembatalan", url = absoluteUploadUrl(proof.photoUrl), authToken = authToken)
    }
}

@Composable
private fun ProofImage(title: String, url: String, authToken: String?) {
    Column {
        Text(title, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
        Spacer(modifier = Modifier.height(6.dp))
        val context = LocalContext.current
        AsyncImage(
            model = if (authToken != null) {
                ImageRequest.Builder(context)
                    .data(url)
                    .addHeader("Authorization", "Bearer $authToken")
                    .crossfade(true)
                    .build()
            } else url,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xFFEDEFF2))
        )
    }
}

private data class TimelineStep(val key: String, val label: String, val done: Boolean)

@Composable
private fun SafeAreaWrapper(content: @Composable () -> Unit) {
    Box(modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars)) {
        content()
    }
}

// Helper function to convert Vector Drawable to Bitmap for map markers.
private fun bitmapDescriptorFromVector(
    context: android.content.Context,
    @DrawableRes vectorResId: Int,
    width: Int,
    height: Int
): com.tembus.customer.ui.components.maps.BitmapDescriptor {
    return try {
        val vectorDrawable = ContextCompat.getDrawable(context, vectorResId) ?: return BitmapDescriptorFactory.defaultMarker()
        vectorDrawable.setBounds(0, 0, width, height)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        vectorDrawable.draw(canvas)
        BitmapDescriptorFactory.fromBitmap(bitmap)
    } catch (e: Exception) {
        BitmapDescriptorFactory.defaultMarker()
    }
}

// S2-CUSTOMER-03: Search timeout retry sheet per skill 01 B.5
@Composable
private fun SearchTimeoutSheet(
    orderId: String,
    viewModel: TrackingViewModel,
    modifier: Modifier = Modifier
) {
    var isRetrying by remember { mutableStateOf(false) }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Schedule, contentDescription = null, tint = Color(0xFFFF9500), modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(10.dp))
                Text("Belum ada kurir tersedia", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
            Text(
                "Kami belum menemukan kurir di sekitar lokasi kamu. Pilih opsi di bawah:",
                color = Color.Gray,
                fontSize = 14.sp
            )

            Button(
                onClick = {
                    isRetrying = true
                    viewModel.retrySearch(orderId)
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Primary),
                enabled = !isRetrying
            ) {
                if (isRetrying) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (isRetrying) "Mencoba lagi..." else "Coba Lagi", fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = {
                    isRetrying = true
                    viewModel.retryWithSurge(orderId)
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
                enabled = !isRetrying
            ) {
                Icon(Icons.Default.TrendingUp, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Naikkan Tarif + Coba Lagi", fontWeight = FontWeight.Bold)
            }

            TextButton(
                onClick = { viewModel.cancelSearch(orderId) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Batalkan & Ajukan Refund", color = Color(0xFFFF5252), fontWeight = FontWeight.Bold)
            }
        }
    }
}
