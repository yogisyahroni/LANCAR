package com.tembus.customer.ui.screens.tracking
import android.graphics.Bitmap
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
