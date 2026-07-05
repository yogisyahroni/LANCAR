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
import com.tembus.customer.ui.theme.AccentLight
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.SecondaryLight
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

private val Ink = OnSurface
private val Muted = OnSurfaceVariant
private val FieldBg = Background
private val LcGreen = Primary
private val SoftGreen = PrimaryLight
private val SoftBlue = SecondaryLight
private val SoftOrange = AccentLight

@Composable
private fun tembusLightTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Ink,
    unfocusedTextColor = Ink,
    disabledTextColor = Muted,
    focusedContainerColor = Color.White,
    unfocusedContainerColor = Color.White,
    disabledContainerColor = Color(0xFFF5F7FA),
    cursorColor = Primary,
    focusedBorderColor = Primary,
    unfocusedBorderColor = Color(0xFFDCE3EE),
    disabledBorderColor = Color(0xFFE5EAF2),
    focusedLabelColor = Primary,
    unfocusedLabelColor = Muted,
    disabledLabelColor = Muted,
    focusedPlaceholderColor = Muted,
    unfocusedPlaceholderColor = Muted,
    disabledPlaceholderColor = Muted,
    focusedLeadingIconColor = Primary,
    unfocusedLeadingIconColor = Muted,
    focusedTrailingIconColor = Primary,
    unfocusedTrailingIconColor = Muted
)

private fun BookingState.isRouteComplete(): Boolean {
    return pickupLocation != null && pickupAddress.isNotBlank() && destinationLocation != null && destinationAddress.isNotBlank()
}

private fun BookingState.isPackageReady(): Boolean {
    return isPackageSizeSelected &&
        sizeTier.isNotBlank() &&
        packageWeight > 0.0 &&
        packageLength > 0 &&
        packageWidth > 0 &&
        packageHeight > 0
}

private fun BookingState.selectedService(): DeliveryServiceProduct? {
    return services.firstOrNull { it.code == selectedServiceCode }
}

private fun BookingState.selectedSizeTier(): ServiceSizeTier? {
    return services
        .flatMap { it.sizeTiers }
        .firstOrNull { it.code == sizeTier }
}

private fun ServiceSizeTier.defaultDimensionsPayload(): DimensionsPayload {
    val normalizedCode = code.lowercase(Locale.ROOT)
    return when {
        normalizedCode.contains("small") || normalizedCode.contains("kecil") || maxWeightKg <= 5.0 ->
            DimensionsPayload(length = 30, width = 20, height = 15)
        normalizedCode.contains("medium") || normalizedCode.contains("sedang") || maxWeightKg <= 10.0 ->
            DimensionsPayload(length = 45, width = 35, height = 25)
        else ->
            DimensionsPayload(length = 60, width = 40, height = 30)
    }
}

private fun PriceBreakdown.hasRoadRouteSnapshot(): Boolean {
    val snapshot = routeSnapshot
    val routePolyline = snapshot?.routePolyline?.trim().orEmpty()
    val provider = snapshot?.provider.orEmpty()
    return routePolyline.isNotBlank() &&
        decodeRoutePolyline(routePolyline).size > 1 &&
        !provider.contains("haversine", ignoreCase = true) &&
        (snapshot?.distanceKm?.takeIf { it > 0.0 } ?: distanceKm) > 0.0
}

private fun BookingState.selectedPrice(): PriceBreakdown? {
    return priceBreakdowns[selectedServiceCode]?.takeIf { it.hasRoadRouteSnapshot() }
}

private fun BookingState.isRecipientReady(): Boolean {
    return recipientName.trim().length >= 2 &&
        recipientPhone.trim().length >= 8 &&
        itemDescription.trim().length >= 3
}

private fun decodeRoutePolyline(encoded: String?): List<LatLng> {
    if (encoded.isNullOrBlank()) return emptyList()
    val routePoints = mutableListOf<LatLng>()
    var index = 0
    var lat = 0
    var lng = 0

    while (index < encoded.length) {
        var result = 0
        var shift = 0
        do {
            if (index >= encoded.length) return routePoints
            val byteValue = encoded[index++].code - 63
            result = result or ((byteValue and 0x1f) shl shift)
            shift += 5
        } while (byteValue >= 0x20)
        lat += if ((result and 1) != 0) (result shr 1).inv() else result shr 1

        result = 0
        shift = 0
        do {
            if (index >= encoded.length) return routePoints
            val byteValue = encoded[index++].code - 63
            result = result or ((byteValue and 0x1f) shl shift)
            shift += 5
        } while (byteValue >= 0x20)
        lng += if ((result and 1) != 0) (result shr 1).inv() else result shr 1
        routePoints.add(LatLng(lat / 1E5, lng / 1E5))
    }

    return routePoints
}

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
                        shape = RoundedCornerShape(18.dp),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFF0F5FF)),
                        border = BorderStroke(1.dp, Color(0xFFDCE6F8))
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
                                Text("${uiState.pickupAddress.take(22)}... ➔ ${uiState.destinationAddress.take(22)}...", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Ink)
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
            containerColor = Color.White
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
            containerColor = Color.White
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
            containerColor = Color.White
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
            containerColor = Color.White
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
            containerColor = Color.White
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
                .background(Color.Black.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center
        ) {
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White)
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

@Composable
private fun PreselectedPromoCard(
    promoCode: String,
    onClear: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = AccentLight),
        border = BorderStroke(1.dp, Accent.copy(alpha = 0.28f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.LocalOffer, contentDescription = null, tint = Accent)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Promo disiapkan", color = OnSurface, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                Text(
                    promoCode,
                    color = Accent,
                    fontWeight = FontWeight.Black,
                    fontSize = 14.sp
                )
            }
            TextButton(onClick = onClear) {
                Text("Lepas", color = Primary, fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun BookingHeader(onBackClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Primary)
            .statusBarsPadding()
            .padding(start = 10.dp, end = 20.dp, top = 12.dp, bottom = 18.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBackClick) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = Color.White)
        }
        Spacer(Modifier.width(8.dp))
        Column {
            Text("TEMBUS", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
            Text("Pengiriman on-demand", fontSize = 14.sp, color = Color.White.copy(alpha = 0.82f))
        }
    }
}

@Composable
private fun DeliveryDetailCard(
    state: BookingState,
    onPickupClick: () -> Unit,
    onDestinationClick: () -> Unit,
    onRequestLocationClick: () -> Unit
) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(26.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 4.dp)
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Detail pengiriman paket", fontWeight = FontWeight.ExtraBold, fontSize = 21.sp, color = Ink)
                    Text("Alamat dipakai untuk hitung harga dan pencarian kurir.", color = Muted, fontSize = 13.sp)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(SoftBlue)
                        .padding(horizontal = 12.dp, vertical = 7.dp)
                ) {
                    Text("ON DEMAND", color = Primary, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                }
            }
            Spacer(Modifier.height(16.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Rute", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = Ink)
                Spacer(Modifier.weight(1f))
                AssistChip(
                    onClick = onDestinationClick,
                    label = { Text("Pilih tujuan") },
                    leadingIcon = { Icon(Icons.Default.Place, null, Modifier.size(18.dp)) }
                )
            }
            Spacer(Modifier.height(10.dp))
            AddressRow(
                icon = Icons.Default.MyLocation,
                iconColor = LcGreen,
                title = "Ambil paket di",
                address = state.pickupAddress.ifBlank { "Pilih titik pickup" },
                emphasized = state.pickupAddress.isNotBlank(),
                onClick = onPickupClick
            )
            DottedConnector()
            AddressRow(
                icon = Icons.Default.Place,
                iconColor = Secondary,
                title = "Kirim paket ke",
                address = state.destinationAddress.ifBlank { "Pilih lokasi tujuan" },
                emphasized = state.destinationAddress.isNotBlank(),
                onClick = onDestinationClick
            )
            Spacer(Modifier.height(14.dp))
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(18.dp))
                    .background(SoftGreen)
                    .clickable { onRequestLocationClick() }
                    .padding(horizontal = 14.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Map, null, tint = LcGreen)
                Spacer(Modifier.width(10.dp))
                Text("Minta lokasi dari penerima", color = LcGreen, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = LcGreen)
            }
        }
    }
}

@Composable
private fun AddressRow(
    icon: ImageVector,
    iconColor: Color,
    title: String,
    address: String,
    emphasized: Boolean,
    onClick: (() -> Unit)?
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .clickable(enabled = onClick != null) { onClick?.invoke() }
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(iconColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = iconColor)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Muted, fontSize = 13.sp)
            Text(
                address,
                color = if (emphasized) Ink else Color(0xFF9AA3AF),
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 2
            )
        }
        if (onClick != null) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Color(0xFFB2BAC6))
        }
    }
}

@Composable
private fun DottedConnector() {
    Row(Modifier.padding(start = 20.dp)) {
        Box(
            modifier = Modifier
                .height(24.dp)
                .width(1.dp)
                .background(Color(0xFFD7DDE6))
        )
    }
}

@Composable
private fun BookingStepHintCard() {
    LcCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(SoftBlue),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Navigation, null, tint = Primary)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Mulai dari alamat", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
                Text(
                    "Pilih titik pickup dan tujuan. Setelah lengkap, ukuran paket dan pilihan layanan akan muncul otomatis.",
                    color = Muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            }
        }
    }
}

@Composable
private fun BookingProgressPills(
    state: BookingState,
    currentStep: Int = 1,
    onStepSelect: (Int) -> Unit = {}
) {
    val steps = listOf(
        Triple(1, "1. Rute & Armada", state.isRouteComplete() && state.selectedPrice() != null),
        Triple(2, "2. Detail Penerima", state.isRecipientReady())
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        steps.forEach { step ->
            val stepNum = step.first
            val stepLabel = step.second
            val done = step.third
            val active = (currentStep == stepNum)

            Row(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        when {
                            active -> Primary.copy(alpha = 0.12f)
                            done -> SoftGreen
                            else -> Color.White
                        }
                    )
                    .border(
                        BorderStroke(
                            width = if (active) 1.5.dp else 1.dp,
                            color = when {
                                active -> Primary
                                done -> LcGreen.copy(alpha = 0.4f)
                                else -> Color(0xFFE1E7F0)
                            }
                        ),
                        RoundedCornerShape(14.dp)
                    )
                    .clickable { onStepSelect(stepNum) }
                    .padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center
            ) {
                Icon(
                    imageVector = when {
                        done && !active -> Icons.Default.CheckCircle
                        stepNum == 1 -> Icons.Default.LocalShipping
                        else -> Icons.Default.Place
                    },
                    contentDescription = null,
                    tint = when {
                        active -> Primary
                        done -> LcGreen
                        else -> Muted
                    },
                    modifier = Modifier.size(16.dp)
                )
                Spacer(Modifier.width(6.dp))
                Text(
                    text = stepLabel,
                    color = when {
                        active -> Primary
                        done -> LcGreen
                        else -> Muted
                    },
                    fontWeight = if (active) FontWeight.Black else FontWeight.Bold,
                    fontSize = 12.sp
                )
            }
        }
    }
}

@Composable
private fun RecipientCard(
    state: BookingState,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onItemChange: (String) -> Unit
) {
    LcCard {
        Text("Detail penerima & barang", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Data ini dikirim ke kurir dan dipakai untuk bukti operasional.", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = state.recipientName,
            onValueChange = onNameChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nama penerima") },
            singleLine = true,
            shape = RoundedCornerShape(18.dp),
            colors = tembusLightTextFieldColors()
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = state.recipientPhone,
            onValueChange = onPhoneChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nomor handphone penerima") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            shape = RoundedCornerShape(18.dp),
            colors = tembusLightTextFieldColors()
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = state.itemDescription,
            onValueChange = onItemChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Isi paket / catatan barang") },
            singleLine = true,
            shape = RoundedCornerShape(18.dp),
            colors = tembusLightTextFieldColors()
        )
    }
}

@Composable
private fun PackageCard(
    state: BookingState,
    onTierSelected: (String, Double, DimensionsPayload) -> Unit
) {
    val selectedService = state.selectedService()
    val serviceMaxWeight = selectedService?.maxWeightKg
    val tiers = remember(state.services) {
        state.services
            .flatMap { it.sizeTiers }
            .filter { it.code.isNotBlank() && it.name.isNotBlank() && it.maxWeightKg > 0.0 }
            .distinctBy { it.code }
            .sortedBy { it.maxWeightKg }
    }
    var selectedTierCode by remember(state.sizeTier, tiers) {
        mutableStateOf(state.sizeTier)
    }
    val selectedTier = tiers.firstOrNull { it.code == state.sizeTier }

    LcCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Ukuran & berat paket", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        }
        Text("Pilih tier paket. Berat dan dimensi teknis akan diisi otomatis untuk menghitung harga.", color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(16.dp))
        if (tiers.isEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(FieldBg)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Scale, null, tint = Muted)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Pilihan paket sedang dimuat", fontWeight = FontWeight.Bold, color = Ink)
                    Text("Pilihan ukuran layanan sedang disinkronkan sebelum order dihitung.", color = Muted, fontSize = 12.sp)
                }
            }
        } else {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(items = tiers, key = { it.code }) { tier: ServiceSizeTier ->
                    val selected = selectedTierCode == tier.code
                    val availableForService = serviceMaxWeight == null || tier.maxWeightKg <= serviceMaxWeight
                    Column(
                        modifier = Modifier
                            .width(148.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(if (selected) SoftGreen else if (availableForService) Color.White else Color(0xFFF2F4F7))
                            .border(
                                BorderStroke(1.dp, if (selected) LcGreen else Color(0xFFDDE3EC)),
                                RoundedCornerShape(18.dp)
                            )
                            .clickable(enabled = availableForService) {
                                selectedTierCode = tier.code
                                onTierSelected(
                                    tier.code,
                                    tier.maxWeightKg.coerceAtLeast(1.0),
                                    tier.defaultDimensionsPayload()
                                )
                            }
                            .padding(14.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(tier.name, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = if (availableForService) Ink else Muted)
                        Spacer(Modifier.height(6.dp))
                        Text(if (availableForService) "Maks. ${formatWeightKg(tier.maxWeightKg)} kg" else "Tidak cocok", color = Muted, fontSize = 13.sp)
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        if (state.isPackageReady()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(FieldBg)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Scale, null, tint = Primary)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        "${selectedTier?.name ?: "Paket"} • maks. ${formatWeightKg(state.packageWeight)} kg",
                        fontWeight = FontWeight.Bold,
                        color = Ink
                    )
                    Text("Detail teknis otomatis mengikuti tier yang dipilih.", color = Muted, fontSize = 12.sp)
                }
                Text(if (state.dimensionsScanned) "Scan valid" else "Tier dipilih", color = LcGreen, fontWeight = FontWeight.Bold)
            }
        } else {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(FieldBg)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Scale, null, tint = Muted)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Ukuran paket belum dipilih", fontWeight = FontWeight.Bold, color = Ink)
                    Text("Pilih salah satu tier paket untuk menghitung harga.", color = Muted, fontSize = 12.sp)
                }
            }
        }
        selectedService?.let { service ->
            if (service.maxWeightKg != null) {
                Spacer(Modifier.height(8.dp))
                Text(
                    "${service.name} menerima paket sampai ${service.maxWeightKg.toInt()} kg. Pilihan yang melebihi batas layanan dikunci.",
                    color = Muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp
                )
            }
        }
    }
}

@Composable
private fun AddOnCard(
    deliveryCodeEnabled: Boolean,
    insuranceEnabled: Boolean,
    onDeliveryCodeChange: (Boolean) -> Unit,
    onInsuranceChange: (Boolean) -> Unit
) {
    LcCard {
        Text("Fitur tambahan", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Spacer(Modifier.height(12.dp))
        AddOnRow(
            icon = Icons.Default.Lock,
            title = "Kode terima paket",
            description = "Penerima wajib memberi kode saat paket diterima.",
            price = "Gratis",
            checked = deliveryCodeEnabled,
            onCheckedChange = onDeliveryCodeChange
        )
        HorizontalDivider(color = Color(0xFFE7EAF0))
        AddOnRow(
            icon = Icons.Default.Shield,
            title = "Perlindungan paket",
            description = "Tambahkan perlindungan untuk barang bernilai.",
            price = "Opsional",
            checked = insuranceEnabled,
            onCheckedChange = onInsuranceChange
        )
    }
}

@Composable
private fun AddOnRow(
    icon: ImageVector,
    title: String,
    description: String,
    price: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(SoftOrange),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = Secondary)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(title, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = Ink)
                Spacer(Modifier.width(8.dp))
                Text(price, fontWeight = FontWeight.Bold, color = LcGreen, fontSize = 13.sp)
            }
            Text(description, color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun RoutePreviewCard(
    state: BookingState,
    locationEnabled: Boolean
) {
    LcCard {
        val selectedPrice = state.selectedPrice()
        val selectedSnapshot = selectedPrice?.routeSnapshot
        val selectedDistanceKm = selectedSnapshot?.distanceKm?.takeIf { it > 0.0 } ?: selectedPrice?.distanceKm
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Preview rute", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
            Spacer(Modifier.weight(1f))
            if (selectedDistanceKm != null) {
                Text("${String.format(Locale.US, "%.1f", selectedDistanceKm)} km", color = LcGreen, fontWeight = FontWeight.ExtraBold)
            }
        }
        Spacer(Modifier.height(12.dp))
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(190.dp)
                .clip(RoundedCornerShape(22.dp))
        ) {
            val markers = buildList {
                state.pickupLocation?.let {
                    add(RuntimeMapMarker("pickup", it, "Pickup", state.pickupAddress))
                }
                state.destinationLocation?.let {
                    add(RuntimeMapMarker("dropoff", it, "Dropoff", state.destinationAddress))
                }
            }
            val routeSnapshot = selectedSnapshot
            val backendRoutePoints = decodeRoutePolyline(routeSnapshot?.routePolyline)
            val routePoints = backendRoutePoints
            RuntimeMapRenderer(
                providerConfig = state.mapsProviderConfig,
                markers = markers,
                routePoints = routePoints,
                followLocation = null,
                mapProperties = MapProperties(isMyLocationEnabled = locationEnabled),
                mapUiSettings = MapUiSettings(
                    zoomControlsEnabled = false,
                    compassEnabled = false,
                    myLocationButtonEnabled = false,
                    scrollGesturesEnabled = false,
                    zoomGesturesEnabled = false,
                    mapToolbarEnabled = false
                ),
                routeColor = LcGreen,
                fallbackTitle = "Rute sedang dihitung",
                fallbackMessage = "Harga tampil setelah rute jalan valid.",
                modifier = Modifier.fillMaxSize()
            )
            if (state.destinationLocation == null) {
                Box(
                    Modifier
                        .fillMaxSize()
                        .background(Color.White.copy(alpha = 0.72f)),
                    contentAlignment = Alignment.Center
                ) {
                    Text("Pilih tujuan untuk melihat estimasi rute", color = Muted, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun RoadPricingProgressBar(
    trackColor: Color,
    indicatorColor: Color
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(6.dp)
            .clip(CircleShape)
            .background(trackColor)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.42f)
                .height(6.dp)
                .clip(CircleShape)
                .background(indicatorColor)
        )
    }
}

@Composable
private fun RoutePricingProgressCard() {
    LcCard {
        Text("Menghitung rute & harga", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Spacer(Modifier.height(8.dp))
        Text(
            "Sistem menghitung rute jalan sebelum layanan bisa dipilih.",
            color = Muted,
            lineHeight = 20.sp
        )
        Spacer(Modifier.height(16.dp))
        RoadPricingProgressBar(
            trackColor = SoftGreen,
            indicatorColor = LcGreen
        )
    }
}

@Composable
private fun RouteUnavailableCard() {
    LcCard {
        Text("Rute sedang dihitung", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Spacer(Modifier.height(8.dp))
        Text(
            "Pilih alamat yang lebih spesifik. Harga tidak akan ditampilkan jika sistem belum mendapat rute jalan yang valid.",
            color = Muted,
            lineHeight = 20.sp
        )
    }
}

@Composable
private fun ServiceInlinePreview(
    state: BookingState,
    onChooseService: () -> Unit
) {
    val selected = state.selectedService()
    val price = state.selectedPrice()
    val packageReady = state.isPackageReady()
    val isPricingReady = packageReady && state.priceBreakdowns.isNotEmpty() && !state.isCalculatingRoute
    LcCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(58.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(serviceIcon(selected), null, tint = LcGreen, modifier = Modifier.size(30.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    when {
                        !packageReady -> "Pilih ukuran paket"
                        state.isCalculatingRoute -> "Menghitung layanan"
                        selected != null -> selected.name
                        else -> "Pilih layanan"
                    },
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Ink
                )
                Text(
                    when {
                        !packageReady -> "Berat paket diperlukan sebelum harga final dihitung."
                        state.isCalculatingRoute -> "Rute jalan dan harga sedang diproses."
                        price != null -> "Estimasi ${etaLabel(price.etaMinutes)}"
                        isPricingReady -> "Harga sudah dihitung. Pilih layanan yang cocok."
                        else -> "Harga tampil setelah rute jalan valid."
                    },
                    color = Muted,
                    fontSize = 14.sp
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    if (price != null) formatRupiah(price.totalPriceIdr) else if (isPricingReady) "${state.priceBreakdowns.size} opsi" else "-",
                    fontSize = 20.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Ink
                )
                TextButton(
                    onClick = onChooseService,
                    enabled = isPricingReady
                ) {
                    Text(if (selected == null) "Pilih" else "Ganti")
                }
            }
        }
    }
}

@Composable
private fun SelectedServiceBar(
    state: BookingState,
    currentStep: Int = 1,
    onChooseService: () -> Unit,
    onContinue: () -> Unit
) {
    val selected = state.selectedService()
    val price = state.selectedPrice()
    val routeReady = state.isRouteComplete()
    val packageReady = state.isPackageReady()
    val recipientReady = state.isRecipientReady()
    val isPricingReady = packageReady && state.priceBreakdowns.isNotEmpty() && !state.isCalculatingRoute
    val buttonLabel = when {
        !routeReady -> "Lengkapi alamat"
        !packageReady -> "Pilih ukuran paket"
        state.isCalculatingRoute -> "Menghitung harga..."
        price == null -> "Pilih layanan"
        currentStep == 1 -> "Lanjut Isi Pengiriman • ${formatRupiah(price.totalPriceIdr)}"
        !recipientReady -> "Tambah detail pengiriman"
        else -> "Review & Bayar • ${formatRupiah(price.totalPriceIdr)}"
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 26.dp, topEnd = 26.dp))
            .background(Color.White)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(18.dp)
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .size(width = 42.dp, height = 4.dp)
                .clip(CircleShape)
                .background(Color(0xFFD2D8E2))
        )
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(serviceIcon(selected), null, tint = LcGreen)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(selected?.name ?: "Pilih layanan", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = Ink)
                Text(
                    when {
                        !routeReady -> "Alamat pickup dan tujuan wajib diisi"
                        !packageReady -> "Pilih berat agar harga layanan tampil"
                        state.isCalculatingRoute -> "Rute jalan sedang dihitung"
                        price == null -> "Pilih service setelah harga tampil"
                        currentStep == 1 -> "Langkah 1 selesai. Tekan untuk isi data penerima."
                        !recipientReady -> "Lengkapi penerima dan isi paket"
                        else -> "Review sebelum order dikirim"
                    },
                    color = Muted,
                    fontSize = 13.sp
                )
            }
            TextButton(onClick = onChooseService, enabled = isPricingReady) {
                Text(if (state.services.size > 1) "Pilih" else "Detail", fontWeight = FontWeight.Bold)
            }
            Text(
                if (price != null) formatRupiah(price.totalPriceIdr) else "-",
                fontWeight = FontWeight.ExtraBold,
                fontSize = 18.sp,
                color = Ink
            )
        }
        Spacer(Modifier.height(14.dp))
        Button(
            onClick = onContinue,
            enabled = routeReady && price != null && !state.isLoading && !state.isCalculatingRoute,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(18.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.White)
        ) {
            Text(buttonLabel, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            Spacer(Modifier.width(8.dp))
            Icon(Icons.Default.Navigation, null)
        }
    }
}

@Composable
private fun ServicePickerSheet(
    state: BookingState,
    onSelect: (String) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .size(width = 42.dp, height = 4.dp)
                .clip(CircleShape)
                .background(Color(0xFFD2D8E2))
        )
        Text("Pilih layanan TEMBUS", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Harga final dihitung dari jarak, berat, dan fitur tambahan.", color = Muted, lineHeight = 20.sp)
        if (state.isCalculatingRoute) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = SoftGreen),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Menghitung harga dari rute jalan", color = Ink, fontWeight = FontWeight.ExtraBold)
                    RoadPricingProgressBar(
                        trackColor = Color.White,
                        indicatorColor = LcGreen
                    )
                }
            }
        } else if (!state.isPackageReady()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = SoftBlue),
                shape = RoundedCornerShape(20.dp)
            ) {
                Text(
                    "Pilih ukuran dan berat paket terlebih dahulu. Setelah itu sistem akan menghitung harga dan menampilkan layanan yang tersedia.",
                    modifier = Modifier.padding(14.dp),
                    color = Ink,
                    fontWeight = FontWeight.SemiBold
                )
            }
        } else if (state.priceBreakdowns.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = SoftOrange),
                shape = RoundedCornerShape(20.dp)
            ) {
                Text(
                    "Lengkapi pickup dan tujuan agar sistem bisa menampilkan layanan yang tersedia.",
                    modifier = Modifier.padding(14.dp),
                    color = Ink,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
        state.services.forEach { service ->
            val selected = service.code == state.selectedServiceCode
            val price = state.priceBreakdowns[service.code]
            ServiceRow(
                service = service,
                price = price,
                selected = selected,
                onClick = { onSelect(service.code) }
            )
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun ServiceRow(
    service: DeliveryServiceProduct,
    price: PriceBreakdown?,
    selected: Boolean,
    onClick: () -> Unit
) {
    val selectable = price != null
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(
                when {
                    selected -> SoftGreen
                    selectable -> Color.White
                    else -> Color(0xFFF3F5F8)
                }
            )
            .border(BorderStroke(1.dp, if (selected) LcGreen else Color(0xFFE2E6ED)), RoundedCornerShape(22.dp))
            .clickable(enabled = selectable) { onClick() }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(58.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(if (selected) Color.White else SoftBlue),
            contentAlignment = Alignment.Center
        ) {
            Icon(serviceIcon(service), null, tint = if (service.vehicleTypes.contains("car")) Secondary else Primary)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(service.name, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
                if (selected) {
                    Spacer(Modifier.width(8.dp))
                    Icon(Icons.Default.CheckCircle, null, tint = LcGreen, modifier = Modifier.size(18.dp))
                }
            }
            Text(
                price?.let { "${"%.1f".format(Locale.US, it.distanceKm)} km • ${etaLabel(it.etaMinutes)}" }
                    ?: "Hitung ulang untuk rute dan berat ini",
                color = Muted,
                fontSize = 14.sp
            )
            if (service.maxWeightKg != null) {
                Text("Maks. ${service.maxWeightKg.toInt()} kg", color = Muted, fontSize = 12.sp)
            }
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                price?.let { formatRupiah(it.totalPriceIdr) } ?: "-",
                fontSize = 18.sp,
                fontWeight = FontWeight.ExtraBold,
                color = if (selectable) Ink else Muted
            )
            if (selected) {
                Text("Dipilih", color = LcGreen, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun BookingReviewSheet(
    state: BookingState,
    onSubmit: () -> Unit
) {
    val service = state.selectedService()
    val selectedTier = state.selectedSizeTier()
    val price = state.selectedPrice()
    val packageSummary = selectedTier
        ?.let { "${it.name} • maks. ${formatWeightKg(it.maxWeightKg)} kg" }
        ?: "${formatWeightKg(state.packageWeight)} kg"
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .size(width = 42.dp, height = 4.dp)
                .clip(CircleShape)
                .background(Color(0xFFD2D8E2))
        )
        Text("Cek lagi detail pengiriman", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Pastikan alamat, penerima, layanan, dan harga sudah benar sebelum order diteruskan ke kurir.", color = Muted)
        ReviewRouteBlock(state)
        ReviewRouteSnapshotBlock(state = state, price = price)
        ReviewInfoRow("Penerima", state.recipientName, state.recipientPhone)
        ReviewInfoRow("Isi paket", state.itemDescription, packageSummary)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(SoftGreen)
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(serviceIcon(service), null, tint = LcGreen, modifier = Modifier.size(34.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(service?.name ?: "Layanan", color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
                Text(price?.let { "Estimasi ${etaLabel(it.etaMinutes)}" } ?: "Hitung harga untuk melihat estimasi", color = Muted, fontSize = 13.sp)
            }
            Text(formatRupiah(price?.totalPriceIdr ?: 0), color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
        }
        Button(
            onClick = onSubmit,
            enabled = price != null && !state.isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp),
            shape = RoundedCornerShape(20.dp),
            colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
        ) {
            Text(
                if (state.isLoading) "Mengirim order..." else "Kirim ${service?.name ?: "TEMBUS"} • ${formatRupiah(price?.totalPriceIdr ?: 0)}",
                fontWeight = FontWeight.ExtraBold,
                fontSize = 16.sp
            )
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun ReviewRouteSnapshotBlock(state: BookingState, price: PriceBreakdown?) {
    val snapshot = price?.routeSnapshot
    val pickupPoint = state.pickupLocation
    val dropoffPoint = state.destinationLocation
    val backendRoutePoints = decodeRoutePolyline(snapshot?.routePolyline)
    val routePoints = backendRoutePoints
    val markers = buildList {
        pickupPoint?.let { add(RuntimeMapMarker("review-pickup", it, "Pickup", state.pickupAddress)) }
        dropoffPoint?.let { add(RuntimeMapMarker("review-dropoff", it, "Dropoff", state.destinationAddress)) }
    }
    val distanceKm = snapshot?.distanceKm?.takeIf { it > 0.0 } ?: price?.distanceKm
    val etaText = snapshot?.eta?.takeIf { it.isNotBlank() }
        ?: snapshot?.etaMinutes?.takeIf { it > 0 }?.let { etaLabel(it) }
        ?: price?.etaMinutes?.takeIf { it > 0 }?.let { etaLabel(it) }
        ?: "Estimasi awal"
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .border(BorderStroke(1.dp, Color(0xFFDCEFE7)), RoundedCornerShape(22.dp))
            .background(Color(0xFFF6FFFA))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Rute & estimasi", color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                Text(
                    listOfNotNull(
                        distanceKm?.let { "${String.format(Locale.US, "%.1f", it)} km" },
                        etaText
                    ).joinToString(" • "),
                    color = Muted,
                    fontSize = 13.sp
                )
            }
            Surface(color = SoftGreen, shape = RoundedCornerShape(12.dp)) {
                Text(
                    "RUTE AKTIF",
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    color = LcGreen,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 11.sp
                )
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(158.dp)
                .clip(RoundedCornerShape(18.dp))
        ) {
            RuntimeMapRenderer(
                providerConfig = state.mapsProviderConfig,
                markers = markers,
                routePoints = routePoints,
                followLocation = null,
                mapProperties = MapProperties(isMyLocationEnabled = false),
                mapUiSettings = MapUiSettings(
                    zoomControlsEnabled = false,
                    compassEnabled = false,
                    myLocationButtonEnabled = false,
                    scrollGesturesEnabled = false,
                    zoomGesturesEnabled = false,
                    mapToolbarEnabled = false
                ),
                routeColor = LcGreen,
                fallbackTitle = "Rute sedang diperbarui",
                fallbackMessage = "Estimasi awal tetap aman dipakai untuk order ini.",
                modifier = Modifier.fillMaxSize()
            )
        }
        if (snapshot?.fallbackReason?.isNotBlank() == true) {
            Text(
                "Estimasi awal. Rute akan diperbarui otomatis saat sistem peta aktif.",
                color = Muted,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
private fun ReviewRouteBlock(state: BookingState) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(FieldBg)
            .padding(14.dp)
    ) {
        AddressRow(
            icon = Icons.Default.MyLocation,
            iconColor = LcGreen,
            title = "Pickup",
            address = state.pickupAddress,
            emphasized = true,
            onClick = null
        )
        DottedConnector()
        AddressRow(
            icon = Icons.Default.Place,
            iconColor = Secondary,
            title = "Dropoff",
            address = state.destinationAddress,
            emphasized = true,
            onClick = null
        )
    }
}

@Composable
private fun ReviewInfoRow(title: String, primary: String, secondary: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .border(BorderStroke(1.dp, Color(0xFFE2E6ED)), RoundedCornerShape(18.dp))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Muted, fontSize = 12.sp)
            Text(primary, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            Text(secondary, color = Muted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun LocationInputSheet(
    title: String,
    subtitle: String,
    buttonLabel: String,
    savedAddresses: List<CustomerAddress>,
    addressKind: String,
    geocodeResults: List<MapsGeocodeResult>,
    isSearchingLocation: Boolean,
    geocodeError: String?,
    selectedMapLocation: LatLng?,
    selectedMapAddress: String,
    isResolvingMapPoint: Boolean,
    onSearch: (String) -> Unit,
    onGeocodeSelected: (MapsGeocodeResult) -> Unit,
    onSelect: (LatLng, String) -> Unit,
    onSavedAddressSelected: (CustomerAddress) -> Unit,
    onSaveAndSelect: (String, LatLng, String) -> Unit
) {
    var address by remember { mutableStateOf("") }
    var saveFavorite by remember { mutableStateOf(false) }
    var label by remember { mutableStateOf(if (addressKind == "pickup") "Pickup utama" else "Tujuan favorit") }
    val selectedAddress = selectedMapAddress.ifBlank { address.trim() }
    val canSave = selectedMapLocation != null && selectedAddress.length >= 6 && !isResolvingMapPoint

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 18.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(title, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text(subtitle, color = Muted, lineHeight = 20.sp)
        if (savedAddresses.isNotEmpty()) {
            Text("Alamat tersimpan", color = Ink, fontWeight = FontWeight.ExtraBold)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(savedAddresses, key = { it.id }) { savedAddress ->
                    SavedAddressChip(
                        address = savedAddress,
                        onClick = { onSavedAddressSelected(savedAddress) }
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(if (selectedMapLocation == null) FieldBg else Color(0xFFEAF7F0))
                .border(
                    BorderStroke(
                        1.dp,
                        if (selectedMapLocation == null) Color(0xFFE1E7EF) else Color(0xFFB7E5CA)
                    ),
                    RoundedCornerShape(22.dp)
                )
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(if (selectedMapLocation == null) Color.White else Color(0xFFDDF6EA)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (selectedMapLocation == null) Icons.Default.Search else Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = if (selectedMapLocation == null) Muted else LcGreen,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    if (selectedMapLocation == null) "Cari alamat lewat nama lokasi" else "Alamat terpilih",
                    color = Ink,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 16.sp
                )
                Text(
                    if (selectedMapLocation == null) {
                        "Ketik nama gedung, jalan, atau area lalu pilih dari hasil pencarian."
                    } else if (isResolvingMapPoint) {
                        "Menyinkronkan alamat terpilih..."
                    } else {
                        selectedAddress
                    },
                    color = Muted,
                    fontSize = 13.sp,
                    lineHeight = 18.sp
                )
            }
        }
        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text(if (addressKind == "pickup") "Cari alamat pickup" else "Cari alamat tujuan") },
            minLines = 2,
            shape = RoundedCornerShape(18.dp),
            colors = tembusLightTextFieldColors()
        )
        Button(
            onClick = { onSearch(address) },
            enabled = address.trim().length >= 3 && !isSearchingLocation,
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp),
            shape = RoundedCornerShape(18.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Primary)
        ) {
            Icon(Icons.Default.Search, null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(if (isSearchingLocation) "Mencari alamat..." else "Cari lokasi")
        }
        geocodeError?.let { message ->
            Text(message, color = Secondary, fontSize = 13.sp)
        }
        if (geocodeResults.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .border(BorderStroke(1.dp, Color(0xFFDDE6F2)), RoundedCornerShape(20.dp))
                    .background(Color.White)
                    .padding(10.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Pilih hasil pencarian", color = Ink, fontWeight = FontWeight.ExtraBold)
                geocodeResults.take(5).forEach { result ->
                    GeocodeResultRow(
                        result = result,
                        onClick = {
                            address = result.label
                            onGeocodeSelected(result)
                        }
                    )
                }
            }
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(FieldBg)
                .clickable { saveFavorite = !saveFavorite }
                .padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(checked = saveFavorite, onCheckedChange = { saveFavorite = it })
            Column(Modifier.weight(1f)) {
                Text("Simpan ke alamat favorit", fontWeight = FontWeight.Bold, color = Ink)
                Text("Alamat ini akan muncul lagi saat membuat pengiriman berikutnya.", color = Muted, fontSize = 12.sp)
            }
        }
        if (saveFavorite) {
            OutlinedTextField(
                value = label,
                onValueChange = { label = it.take(80) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Nama alamat") },
                singleLine = true,
                shape = RoundedCornerShape(18.dp),
                colors = tembusLightTextFieldColors()
            )
        }
        Button(
            onClick = {
                selectedMapLocation?.let { selectedLocation ->
                    if (saveFavorite) {
                        onSaveAndSelect(label.trim(), selectedLocation, selectedAddress)
                    } else {
                        onSelect(selectedLocation, selectedAddress)
                    }
                }
            },
            enabled = canSave && (!saveFavorite || label.trim().length >= 2),
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(18.dp),
            colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
        ) {
            Text(buttonLabel, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
private fun GeocodeResultRow(
    result: MapsGeocodeResult,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(FieldBg)
            .clickable { onClick() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(SoftGreen),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Place, null, tint = LcGreen)
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(result.label, color = Ink, fontWeight = FontWeight.ExtraBold, maxLines = 2)
            Text(
                text = "Ketuk untuk memilih titik ini",
                color = Muted,
                fontSize = 12.sp,
                maxLines = 1
            )
        }
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Muted)
    }
}

@Composable
private fun SavedAddressChip(
    address: CustomerAddress,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .width(240.dp)
            .clip(RoundedCornerShape(18.dp))
            .border(BorderStroke(1.dp, Color(0xFFDCE3EE)), RoundedCornerShape(18.dp))
            .background(Color.White)
            .clickable { onClick() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(if (address.kind == "pickup") SoftGreen else SoftOrange),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                if (address.kind == "pickup") Icons.Default.MyLocation else Icons.Default.Place,
                null,
                tint = if (address.kind == "pickup") LcGreen else Secondary
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(address.label, color = Ink, fontWeight = FontWeight.ExtraBold, maxLines = 1)
            Text(address.address, color = Muted, fontSize = 12.sp, maxLines = 2)
        }
    }
}

@Composable
private fun RequestReceiverLocationSheet(
    link: String,
    status: String?,
    submittedAddress: String?,
    submittedContactName: String?,
    submittedContactPhone: String?,
    expiresAt: String?,
    isLoading: Boolean,
    onCreateLink: () -> Unit,
    onRefresh: () -> Unit,
    onRevoke: () -> Unit,
    onCopy: () -> Unit,
    onShare: () -> Unit
) {
    val isRevoked = status == "revoked"
    val canUseLink = link.isNotBlank() && !isRevoked

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 22.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .size(76.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(SoftGreen),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Map, null, tint = LcGreen, modifier = Modifier.size(38.dp))
        }
        Spacer(Modifier.height(18.dp))
        Text(
            "Minta lokasi penerima",
            fontSize = 24.sp,
            fontWeight = FontWeight.ExtraBold,
            color = Ink
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "Bagikan link agar penerima mengisi alamat dropoff yang lebih akurat. Setelah penerima mengirim, cek kembali untuk memakai titik tersebut.",
            color = Muted,
            fontSize = 14.sp,
            lineHeight = 20.sp
        )
        Spacer(Modifier.height(18.dp))
        if (!status.isNullOrBlank()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(if (status == "submitted") SoftGreen else FieldBg)
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    if (status == "submitted") Icons.Default.CheckCircle else Icons.Default.AccessTime,
                    null,
                    tint = if (status == "submitted") LcGreen else Muted
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        when (status) {
                            "submitted" -> "Lokasi sudah diisi"
                            "expired" -> "Link kedaluwarsa"
                            "revoked" -> "Link dibatalkan"
                            else -> "Menunggu penerima"
                        },
                        color = Ink,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Text(
                        if (expiresAt.isNullOrBlank()) "Status tersinkron dari server" else "Aktif sampai ${expiresAt.take(16).replace("T", " ")}",
                        color = Muted,
                        fontSize = 12.sp
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        if (!submittedAddress.isNullOrBlank()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(SoftGreen)
                    .padding(14.dp)
            ) {
                Text("Alamat dari penerima", color = LcGreen, fontWeight = FontWeight.ExtraBold)
                Spacer(Modifier.height(4.dp))
                Text(submittedAddress, color = Ink, fontWeight = FontWeight.Bold)
                if (!submittedContactName.isNullOrBlank()) {
                    Text(
                        listOfNotNull(submittedContactName, submittedContactPhone).joinToString(" • "),
                        color = Muted,
                        fontSize = 12.sp
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(18.dp))
                .background(FieldBg)
                .padding(horizontal = 14.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Lock, null, tint = Muted)
            Spacer(Modifier.width(10.dp))
            Text(
                if (isRevoked) "Link sudah dibatalkan" else link.ifBlank { "Link belum dibuat" },
                color = Ink,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
                maxLines = 2
            )
            TextButton(onClick = onCopy, enabled = canUseLink) {
                Text("Salin", color = LcGreen, fontWeight = FontWeight.ExtraBold)
            }
        }
        Spacer(Modifier.height(18.dp))
        if (canUseLink) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Button(
                    onClick = onShare,
                    enabled = !isLoading,
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
                ) {
                    Text("Bagikan", fontWeight = FontWeight.ExtraBold)
                }
                Button(
                    onClick = onRefresh,
                    enabled = !isLoading,
                    modifier = Modifier
                        .weight(1f)
                        .height(50.dp),
                    shape = RoundedCornerShape(18.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Text(if (isLoading) "Mengecek..." else "Cek status", fontWeight = FontWeight.ExtraBold)
                }
            }
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = onRevoke,
                enabled = !isLoading && status == "pending",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, Color(0xFFE8294D).copy(alpha = 0.45f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFE8294D))
            ) {
                Text("Batalkan link", fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(10.dp))
        }
        Button(
            onClick = if (link.isBlank()) onCreateLink else onCopy,
            enabled = !isLoading && !isRevoked,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(18.dp),
            colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
        ) {
            Text(
                when {
                    isLoading -> "Membuat link..."
                    link.isBlank() -> "Buat link lokasi"
                    isRevoked -> "Link dibatalkan"
                    else -> "Salin link"
                },
                fontWeight = FontWeight.ExtraBold
            )
        }
        Spacer(Modifier.height(18.dp))
    }
}

@Composable
private fun LcCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Outline),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(18.dp), content = content)
    }
}

private fun serviceIcon(service: DeliveryServiceProduct?): ImageVector {
    return if (service?.vehicleTypes?.contains("car") == true) Icons.Default.LocalShipping else Icons.Default.LocalShipping
}

private fun etaLabel(minutes: Int): String {
    if (minutes <= 0) return "-"
    return if (minutes < 60) "$minutes menit" else "${minutes / 60}-${(minutes / 60) + 1} jam"
}

private fun formatWeightKg(value: Double): String {
    if (value <= 0.0) return "0"
    return if (value % 1.0 == 0.0) value.toInt().toString() else "%.1f".format(Locale.US, value)
}

private fun formatRupiah(value: Long): String {
    if (value <= 0) return "Rp0"
    val formatter = NumberFormat.getNumberInstance(Locale.forLanguageTag("id-ID"))
    return "Rp${formatter.format(value)}"
}
