package com.tembus.customer.ui.screens.booking

import android.Manifest
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.LocalActivity
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Scale
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.ui.components.maps.MapProperties
import com.tembus.customer.ui.components.maps.MapUiSettings
import com.tembus.customer.data.model.CustomerAddress
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.data.model.DimensionsPayload
import com.tembus.customer.data.model.MapsGeocodeResult
import com.tembus.customer.data.model.PriceBreakdown
import com.tembus.customer.data.model.ServiceSizeTier
import com.tembus.customer.ui.components.maps.RuntimeMapMarker
import com.tembus.customer.ui.components.maps.RuntimeMapRenderer
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.AccentSoft
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.OutlineStrong
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryPale
import com.tembus.customer.ui.theme.PrimarySoft
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.SecondaryLight
import com.tembus.customer.ui.theme.Success
import com.tembus.customer.ui.theme.Surface as TembusSurface
import com.tembus.customer.ui.theme.SurfaceVariant
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.TextDisabled
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

private val Ink = OnSurface
private val Muted = OnSurfaceVariant
private val FieldBg = Background
private val LcGreen = Primary
private val SoftGreen = PrimarySoft
private val SoftBlue = SecondaryLight
private val SoftOrange = AccentSoft

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Composable
fun BookingScreen(
    viewModel: BookingViewModel,
    initialOpen: String? = null,
    initialPromoCode: String? = null,
    onBackClick: () -> Unit,
    onBookingSuccess: (String) -> Unit
) {
    val uiState by viewModel.bookingState.collectAsState()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    var showServiceSheet by remember { mutableStateOf(false) }
    var showPickupSheet by remember { mutableStateOf(false) }
    var showDestinationSheet by remember { mutableStateOf(false) }
    var showLocationRequestSheet by remember { mutableStateOf(false) }
    var showReviewSheet by remember { mutableStateOf(false) }
    var lastAutoServiceKey by remember { mutableStateOf("") }
    var currentStep by remember { mutableStateOf(1) }
    val locationPermissionState = rememberPermissionState(Manifest.permission.ACCESS_FINE_LOCATION)
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        if (!locationPermissionState.status.isGranted) {
            locationPermissionState.launchPermissionRequest()
        }
    }

    LaunchedEffect(viewModel) {
        viewModel.bookingSuccess.collectLatest { orderId ->
            showReviewSheet = false
            Toast.makeText(context, "Order berhasil dibuat", Toast.LENGTH_SHORT).show()
            onBookingSuccess(orderId)
        }
    }

    LaunchedEffect(initialOpen) {
        when (initialOpen) {
            "pickup" -> showPickupSheet = true
            "dropoff" -> showDestinationSheet = true
        }
    }

    LaunchedEffect(initialPromoCode) {
        if (!initialPromoCode.isNullOrBlank()) {
            viewModel.setPromoCode(initialPromoCode)
            Toast.makeText(context, "Promo ${initialPromoCode.uppercase()} disiapkan untuk order ini.", Toast.LENGTH_SHORT).show()
        }
    }

    val serviceAutoKey = listOf(
        uiState.pickupAddress,
        uiState.destinationAddress,
        uiState.sizeTier,
        uiState.packageWeight.toString(),
        "${uiState.packageLength}x${uiState.packageWidth}x${uiState.packageHeight}",
        uiState.priceBreakdowns.keys.sorted().joinToString(",")
    ).joinToString("|")

    LaunchedEffect(serviceAutoKey, uiState.selectedServiceCode) {
        if (
            uiState.isRouteComplete() &&
            uiState.isPackageReady() &&
            !uiState.isCalculatingRoute &&
            uiState.priceBreakdowns.isNotEmpty() &&
            uiState.selectedServiceCode.isBlank() &&
            serviceAutoKey != lastAutoServiceKey
        ) {
            lastAutoServiceKey = serviceAutoKey
            showServiceSheet = true
        }
    }

    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            Toast.makeText(context, error, Toast.LENGTH_LONG).show()
            viewModel.clearError()
        }
    }

    fun openServicePicker() {
        when {
            !uiState.isRouteComplete() -> Toast.makeText(context, "Pilih lokasi pickup dan tujuan dulu.", Toast.LENGTH_SHORT).show()
            !uiState.isPackageReady() -> Toast.makeText(context, "Pilih ukuran dan berat paket dulu.", Toast.LENGTH_SHORT).show()
            uiState.isCalculatingRoute -> Toast.makeText(context, "Sistem sedang menghitung rute jalan dan harga.", Toast.LENGTH_SHORT).show()
            uiState.priceBreakdowns.isEmpty() -> Toast.makeText(context, "Rute jalan sedang dihitung untuk alamat ini.", Toast.LENGTH_SHORT).show()
            else -> {
                keyboardController?.hide()
                focusManager.clearFocus()
                scope.launch {
                    delay(150)
                    showServiceSheet = true
                }
            }
        }
    }

    Scaffold(
        containerColor = Background,
        topBar = {
            BookingHeader(onBackClick = {
                if (currentStep > 1) {
                    currentStep = 1
                } else {
                    onBackClick()
                }
            })
        },
        bottomBar = {
            SelectedServiceBar(
                state = uiState,
                currentStep = currentStep,
                onChooseService = { openServicePicker() },
                onContinue = {
                    when {
                        !uiState.isRouteComplete() -> Toast.makeText(context, "Pilih lokasi pickup dan tujuan dulu.", Toast.LENGTH_SHORT).show()
                        !uiState.isPackageReady() -> Toast.makeText(context, "Pilih ukuran dan berat paket dulu.", Toast.LENGTH_SHORT).show()
                        uiState.isCalculatingRoute -> Toast.makeText(context, "Sistem sedang menghitung rute jalan dan harga.", Toast.LENGTH_SHORT).show()
                        uiState.selectedPrice() == null -> openServicePicker()
                        currentStep == 1 -> {
                            currentStep = 2
                            Toast.makeText(context, "Langkah 2: Lengkapi detail penerima & barang.", Toast.LENGTH_SHORT).show()
                        }
                        !uiState.isRecipientReady() -> Toast.makeText(context, "Lengkapi detail penerima dan isi paket.", Toast.LENGTH_SHORT).show()
                        else -> {
                            keyboardController?.hide()
                            focusManager.clearFocus()
                            scope.launch {
                                delay(150)
                                showReviewSheet = true
                            }
                        }
                    }
                }
            )
        }
    ) { padding ->
        BookingStepContent(
            state = uiState,
            currentStep = currentStep,
            locationEnabled = locationPermissionState.status.isGranted,
            contentPadding = padding,
            context = context,
            viewModel = viewModel,
            onStepChange = { currentStep = it },
            onOpenServicePicker = { openServicePicker() },
            onPickupClick = {
                keyboardController?.hide()
                focusManager.clearFocus()
                scope.launch { delay(150); showPickupSheet = true }
            },
            onDestinationClick = {
                keyboardController?.hide()
                focusManager.clearFocus()
                scope.launch { delay(150); showDestinationSheet = true }
            },
            onRequestLocationClick = {
                keyboardController?.hide()
                focusManager.clearFocus()
                scope.launch { delay(150); showLocationRequestSheet = true }
            }
        )
    }

    BookingModalSheets(
        state = uiState,
        viewModel = viewModel,
        context = context,
        clipboardManager = clipboardManager,
        showServiceSheet = showServiceSheet,
        showPickupSheet = showPickupSheet,
        showDestinationSheet = showDestinationSheet,
        showLocationRequestSheet = showLocationRequestSheet,
        showReviewSheet = showReviewSheet,
        onServiceSheetDismiss = { showServiceSheet = false },
        onPickupSheetDismiss = { showPickupSheet = false },
        onDestinationSheetDismiss = { showDestinationSheet = false },
        onLocationRequestSheetDismiss = { showLocationRequestSheet = false },
        onReviewSheetDismiss = { showReviewSheet = false }
    )

    if (uiState.isLoading) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center
        ) {
            Card(
                shape = RoundedCornerShape(TembusRadius.Card),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Text(
                    text = "Menyiapkan pengiriman...",
                    modifier = Modifier.padding(horizontal = 22.dp, vertical = 16.dp),
                    fontWeight = FontWeight.Bold,
                    color = Ink
                )
            }
        }
    }
}
