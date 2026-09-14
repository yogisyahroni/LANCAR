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
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.tembus.customer.ui.a11y.criticalAction
import com.tembus.customer.ui.screens.rating.CourierRatingDialog
import com.tembus.customer.ui.screens.rating.CourierRatingViewModel
import com.tembus.customer.ui.screens.rating.MerchantRatingDialog
import com.tembus.customer.ui.screens.rating.MerchantRatingViewModel
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.screens.tip.TipDialog
import com.tembus.customer.ui.screens.tip.TipViewModel
import androidx.compose.material.icons.filled.VolunteerActivism
import com.tembus.customer.util.rememberNetworkAvailable

@OptIn(ExperimentalMaterial3Api::class)
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
    val isOnline by rememberNetworkAvailable()
    var wasOffline by remember(orderId) { mutableStateOf(false) }
    var safetyCenterOpen by remember(orderId) { mutableStateOf(false) }
    var sosConfirmationOpen by remember(orderId) { mutableStateOf(false) }
    var safetyNote by remember(orderId) { mutableStateOf("") }

    // Tracking lifecycle management
    DisposableEffect(orderId) {
        viewModel.startTracking(orderId)
        tipViewModel.checkTipStatus(orderId)
        onDispose {
            viewModel.stopTracking()
        }
    }

    LaunchedEffect(isOnline) {
        if (!isOnline) {
            wasOffline = true
        } else if (wasOffline) {
            wasOffline = false
            // Polling continues while online; immediately reconcile after a
            // network transition so a stale map is not the only visible state.
            viewModel.refresh(orderId)
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

    PullToRefreshBox(
        isRefreshing = uiState.isLoading && uiState.courierLocation != null,
        onRefresh = { viewModel.refresh(orderId) },
        modifier = Modifier.fillMaxSize()
    ) {
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
                    .criticalAction("Kembali dari tracking")
                    .clip(CircleShape)
                    .shadow(10.dp, CircleShape)
                    .background(MaterialTheme.colorScheme.surface)
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = CustomerTextCatalog.translate("Kembali"),
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

        // LAYER 3.5: Safety Center remains reachable from the active tracking surface.
        if (uiState.detail != null) {
            FloatingActionButton(
                onClick = { safetyCenterOpen = true },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(top = 88.dp, end = 20.dp)
                    .size(52.dp)
                    .criticalAction("Buka Safety Center"),
                containerColor = MaterialTheme.colorScheme.errorContainer,
                contentColor = MaterialTheme.colorScheme.onErrorContainer
            ) {
                Icon(Icons.Filled.Warning, contentDescription = "Buka Safety Center")
            }
        }

        if (safetyCenterOpen) {
            AlertDialog(
                onDismissRequest = { if (!uiState.safetyActionPending) safetyCenterOpen = false },
                title = { Text("Safety Center") },
                text = {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Tetap tersedia selama order aktif. Laporan safety membuat insiden terpisah dan tidak mengubah status order secara diam-diam.")
                        Text(
                            uiState.safetyCenter?.policy?.sos?.consequence
                                ?: "Memuat konsekuensi tindakan darurat…",
                            style = MaterialTheme.typography.bodySmall
                        )
                        OutlinedTextField(
                            value = safetyNote,
                            onValueChange = { safetyNote = it.take(500) },
                            label = { Text("Jelaskan situasi") },
                            placeholder = { Text("Contoh: lokasi pickup terasa tidak aman") },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !uiState.safetyActionPending,
                            minLines = 2
                        )
                        if (!uiState.safetyMessage.isNullOrBlank()) {
                            Text(uiState.safetyMessage.orEmpty(), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                },
                confirmButton = {
                    Column(horizontalAlignment = Alignment.End) {
                        OutlinedButton(
                            onClick = { viewModel.reportSafety(orderId, safetyNote) },
                            enabled = !uiState.safetyActionPending && safetyNote.isNotBlank(),
                            modifier = Modifier
                                .heightIn(min = 48.dp)
                                .criticalAction("Kirim laporan isu keselamatan")
                        ) { Text("Laporkan isu") }
                        Button(
                            onClick = { sosConfirmationOpen = true },
                            enabled = !uiState.safetyActionPending,
                            modifier = Modifier
                                .heightIn(min = 48.dp)
                                .criticalAction("Buka konfirmasi SOS"),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                        ) { Text("SOS / eskalasi") }
                    }
                },
                dismissButton = { TextButton(onClick = { safetyCenterOpen = false }, enabled = !uiState.safetyActionPending) { Text("Tutup") } }
            )
        }

        if (sosConfirmationOpen) {
            AlertDialog(
                onDismissRequest = { sosConfirmationOpen = false },
                title = { Text("Konfirmasi SOS") },
                text = { Text("SOS akan membuat insiden CRITICAL dan mengirimkannya ke jalur eskalasi market. Jika vendor belum tersedia, aplikasi hanya mencatat insiden dan menampilkan instruksi darurat yang disetujui—tidak ada respons yang dijanjikan.") },
                confirmButton = {
                    Button(
                        onClick = { sosConfirmationOpen = false; viewModel.triggerSafetySos(orderId) },
                        modifier = Modifier
                            .heightIn(min = 48.dp)
                            .criticalAction("Kirim SOS setelah konfirmasi"),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    ) { Text("Kirim SOS") }
                },
                dismissButton = { TextButton(onClick = { sosConfirmationOpen = false }) { Text("Batal") } }
            )
        }

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
}

// FB-077: status order customer yang masih bisa di-tip
// (selaras dengan eligible statuses di backend tip_service.go)
