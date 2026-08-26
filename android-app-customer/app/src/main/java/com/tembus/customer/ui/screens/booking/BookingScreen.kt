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
import androidx.compose.material3.Text
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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(top = 14.dp, bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                BookingProgressPills(
                    state = uiState,
                    currentStep = currentStep,
                    onStepSelect = { step ->
                        if (step == 1) {
                            currentStep = 1
                        } else if (step == 2) {
                            if (uiState.isRouteComplete() && uiState.isPackageReady() && uiState.selectedPrice() != null) {
                                currentStep = 2
                            } else {
                                Toast.makeText(context, "Lengkapi rute dan layanan pada Langkah 1 terlebih dahulu.", Toast.LENGTH_SHORT).show()
                            }
                        }
                    }
                )
            }
            if (currentStep == 1) {
                item {
                    DeliveryDetailCard(
                        state = uiState,
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
                if (uiState.promoCode.isNotBlank()) {
                    item {
                        PreselectedPromoCard(
                            promoCode = uiState.promoCode,
                            onClear = viewModel::clearPromoCode
                        )
                    }
                }
                // FB-078: voucher diskon (opsional, terpisah dari promo)
                item {
                    VoucherCard(
                        state = uiState,
                        onCodeChange = viewModel::setVoucherCode,
                        onApply = viewModel::validateVoucher,
                        onClear = viewModel::clearVoucher
                    )
                }
                if (uiState.isRouteComplete()) {
                    item {
                        PackageCard(
                            state = uiState,
                            onTierSelected = { code, weight, dimensions ->
                                viewModel.setSizeTier(code, weight, dimensions)
                            }
                        )
                    }
                    item {
                        ServiceInlinePreview(
                            state = uiState,
                            onChooseService = { openServicePicker() }
                        )
                    }
                    if (uiState.isCalculatingRoute) {
                        item {
                            RoutePricingProgressCard()
                        }
                    } else if (uiState.selectedPrice() != null) {
                        item {
                            RoutePreviewCard(
                                state = uiState,
                                locationEnabled = locationPermissionState.status.isGranted
                            )
                        }
                    } else if (uiState.isPackageReady() && uiState.priceBreakdowns.isEmpty()) {
                        item {
                            RouteUnavailableCard()
                        }
                    }
                } else {
                    item {
                        BookingStepHintCard()
                    }
                }
            } else if (currentStep == 2) {
                item {
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp),
                        shape = RoundedCornerShape(TembusRadius.Card),
                        colors = CardDefaults.cardColors(containerColor = PrimaryPale),
                        border = BorderStroke(1.dp, Outline)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Rute & Layanan Terpilih", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Primary)
                                Spacer(Modifier.height(4.dp))
                                Text("${uiState.pickupAddress.take(22)}... ke ${uiState.destinationAddress.take(22)}...", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Ink)
                                Text("${uiState.selectedService()?.name ?: "TEMBUS"} • ${uiState.selectedSizeTier()?.name ?: ""} (${uiState.packageWeight} kg)", fontSize = 12.sp, color = Muted)
                            }
                            TextButton(onClick = { currentStep = 1 }) {
                                Text("Ubah", fontWeight = FontWeight.ExtraBold, color = Primary)
                            }
                        }
                    }
                }
                item {
                    RecipientCard(
                        state = uiState,
                        onNameChange = viewModel::setRecipientName,
                        onPhoneChange = viewModel::setRecipientPhone,
                        onItemChange = viewModel::setItemDescription
                    )
                }
                item {
                    AddOnCard(
                        deliveryCodeEnabled = uiState.deliveryCodeEnabled,
                        insuranceEnabled = uiState.insuranceEnabled,
                        onDeliveryCodeChange = viewModel::toggleDeliveryCode,
                        onInsuranceChange = viewModel::toggleInsurance
                    )
                }
                if (uiState.promoCode.isNotBlank()) {
                    item {
                        PreselectedPromoCard(
                            promoCode = uiState.promoCode,
                            onClear = viewModel::clearPromoCode
                        )
                    }
                }
            }
        }
    }

    if (showServiceSheet) {
        ModalBottomSheet(
            onDismissRequest = { showServiceSheet = false },
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            ServicePickerSheet(
                state = uiState,
                onSelect = {
                    viewModel.selectService(it)
                    showServiceSheet = false
                }
            )
        }
    }

    if (showDestinationSheet) {
        ModalBottomSheet(
            onDismissRequest = {
                viewModel.clearLocationSearch()
                showDestinationSheet = false
            },
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            LocationInputSheet(
                title = "Kirim paket ke mana?",
                subtitle = "Cari alamat tujuan lalu pilih hasil yang paling sesuai agar harga dan rute dihitung dari data nyata.",
                buttonLabel = "Gunakan alamat tujuan",
                savedAddresses = uiState.addressBook.filter { it.kind == "receiver" || it.kind == "both" },
                addressKind = "receiver",
                geocodeResults = uiState.geocodeResults,
                isSearchingLocation = uiState.isSearchingLocation,
                geocodeError = uiState.geocodeError,
                selectedMapLocation = uiState.mapPickerLocation,
                selectedMapAddress = uiState.mapPickerAddress,
                isResolvingMapPoint = uiState.isResolvingMapPoint,
                onSearch = viewModel::searchAddress,
                onGeocodeSelected = viewModel::selectGeocodeResult,
                onSelect = { location, address ->
                    viewModel.setDestination(location, address)
                    viewModel.clearLocationSearch()
                    showDestinationSheet = false
                },
                onSavedAddressSelected = { address ->
                    viewModel.selectSavedAddress(address, asPickup = false)
                    viewModel.clearLocationSearch()
                    showDestinationSheet = false
                },
                onSaveAndSelect = { label, location, address ->
                    viewModel.saveAddressAndSelect(
                        label = label,
                        location = location,
                        address = address,
                        kind = "receiver",
                        asPickup = false
                    )
                    viewModel.clearLocationSearch()
                    showDestinationSheet = false
                }
            )
        }
    }

    if (showPickupSheet) {
        ModalBottomSheet(
            onDismissRequest = {
                viewModel.clearLocationSearch()
                showPickupSheet = false
            },
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            LocationInputSheet(
                title = "Ambil paket di mana?",
                subtitle = "Cari alamat pickup lalu pilih hasil yang paling sesuai supaya kurir menerima lokasi penjemputan yang akurat.",
                buttonLabel = "Gunakan alamat pickup",
                savedAddresses = uiState.addressBook.filter { it.kind == "pickup" || it.kind == "both" },
                addressKind = "pickup",
                geocodeResults = uiState.geocodeResults,
                isSearchingLocation = uiState.isSearchingLocation,
                geocodeError = uiState.geocodeError,
                selectedMapLocation = uiState.mapPickerLocation,
                selectedMapAddress = uiState.mapPickerAddress,
                isResolvingMapPoint = uiState.isResolvingMapPoint,
                onSearch = viewModel::searchAddress,
                onGeocodeSelected = viewModel::selectGeocodeResult,
                onSelect = { location, address ->
                    viewModel.setPickup(location, address)
                    viewModel.clearLocationSearch()
                    showPickupSheet = false
                },
                onSavedAddressSelected = { address ->
                    viewModel.selectSavedAddress(address, asPickup = true)
                    viewModel.clearLocationSearch()
                    showPickupSheet = false
                },
                onSaveAndSelect = { label, location, address ->
                    viewModel.saveAddressAndSelect(
                        label = label,
                        location = location,
                        address = address,
                        kind = "pickup",
                        asPickup = true
                    )
                    viewModel.clearLocationSearch()
                    showPickupSheet = false
                }
            )
        }
    }

    if (showLocationRequestSheet) {
        ModalBottomSheet(
            onDismissRequest = { showLocationRequestSheet = false },
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            RequestReceiverLocationSheet(
                link = uiState.receiverLocationLink?.url.orEmpty(),
                status = uiState.receiverLocationLink?.status,
                submittedAddress = uiState.receiverLocationLink?.submittedAddress,
                submittedContactName = uiState.receiverLocationLink?.submittedContactName,
                submittedContactPhone = uiState.receiverLocationLink?.submittedContactPhoneMasked,
                expiresAt = uiState.receiverLocationLink?.expiresAt,
                isLoading = uiState.isCreatingLocationLink,
                onCreateLink = viewModel::createReceiverLocationLink,
                onRefresh = viewModel::refreshReceiverLocationLink,
                onRevoke = viewModel::revokeReceiverLocationLink,
                onCopy = {
                    val link = uiState.receiverLocationLink?.url.orEmpty()
                    if (link.isNotBlank()) {
                        clipboardManager.setText(AnnotatedString(link))
                        Toast.makeText(context, "Link lokasi disalin", Toast.LENGTH_SHORT).show()
                    }
                },
                onShare = {
                    val link = uiState.receiverLocationLink?.url.orEmpty()
                    if (link.isNotBlank()) {
                        val shareIntent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(
                                Intent.EXTRA_TEXT,
                                "Halo, bantu isi titik tujuan pengiriman TEMBUS melalui link aman ini:\n$link"
                            )
                        }
                        context.startActivity(Intent.createChooser(shareIntent, "Bagikan link lokasi"))
                    }
                }
            )
        }
    }

    if (showReviewSheet) {
        ModalBottomSheet(
            onDismissRequest = { showReviewSheet = false },
            sheetState = rememberModalBottomSheetState(),
            containerColor = MaterialTheme.colorScheme.surface
        ) {
            BookingReviewSheet(
                state = uiState,
                onSubmit = {
                    viewModel.confirmBooking()
                }
            )
        }
    }

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
