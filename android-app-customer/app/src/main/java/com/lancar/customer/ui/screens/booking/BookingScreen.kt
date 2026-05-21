package com.lancar.customer.ui.screens.booking

import android.Manifest
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
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.KeyboardArrowRight
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
import androidx.compose.material3.Divider
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.lancar.customer.data.model.CustomerAddress
import com.lancar.customer.data.model.DeliveryServiceProduct
import com.lancar.customer.data.model.DimensionsPayload
import com.lancar.customer.data.model.MapsGeocodeResult
import com.lancar.customer.data.model.PriceBreakdown
import com.lancar.customer.ui.components.maps.RuntimeMapMarker
import com.lancar.customer.ui.components.maps.RuntimeMapRenderer
import com.lancar.customer.ui.theme.Primary
import com.lancar.customer.ui.theme.Secondary
import kotlinx.coroutines.flow.collectLatest
import java.text.NumberFormat
import java.util.Locale

private val Ink = Color(0xFF17202A)
private val Muted = Color(0xFF657086)
private val FieldBg = Color(0xFFF7F9FC)
private val LcGreen = Color(0xFF067A46)
private val SoftGreen = Color(0xFFEAF8EF)
private val SoftBlue = Color(0xFFEAF4FF)
private val SoftOrange = Color(0xFFFFF3E8)

private fun BookingState.isRouteComplete(): Boolean {
    return pickupLocation != null && pickupAddress.isNotBlank() && destinationLocation != null && destinationAddress.isNotBlank()
}

private fun BookingState.selectedService(): DeliveryServiceProduct? {
    return services.firstOrNull { it.code == selectedServiceCode }
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
    val locationPermissionState = rememberPermissionState(Manifest.permission.ACCESS_FINE_LOCATION)

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

    val serviceAutoKey = listOf(
        uiState.pickupAddress,
        uiState.destinationAddress,
        uiState.sizeTier,
        uiState.packageWeight.toString(),
        uiState.priceBreakdowns.keys.sorted().joinToString(",")
    ).joinToString("|")

    LaunchedEffect(serviceAutoKey, uiState.selectedServiceCode) {
        if (
            uiState.isRouteComplete() &&
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
            uiState.isCalculatingRoute -> Toast.makeText(context, "Sistem sedang menghitung rute jalan dan harga.", Toast.LENGTH_SHORT).show()
            uiState.priceBreakdowns.isEmpty() -> Toast.makeText(context, "Rute jalan belum tersedia untuk alamat ini.", Toast.LENGTH_SHORT).show()
            else -> showServiceSheet = true
        }
    }

    Scaffold(
        containerColor = Color(0xFFF3F5F8),
        bottomBar = {
            SelectedServiceBar(
                state = uiState,
                onChooseService = { openServicePicker() },
                onContinue = {
                    when {
                        !uiState.isRouteComplete() -> Toast.makeText(context, "Pilih lokasi pickup dan tujuan dulu.", Toast.LENGTH_SHORT).show()
                        uiState.isCalculatingRoute -> Toast.makeText(context, "Sistem sedang menghitung rute jalan dan harga.", Toast.LENGTH_SHORT).show()
                        uiState.selectedPrice() == null -> openServicePicker()
                        !uiState.isRecipientReady() -> Toast.makeText(context, "Lengkapi detail penerima dan isi paket.", Toast.LENGTH_SHORT).show()
                        else -> showReviewSheet = true
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                BookingHeader(onBackClick = onBackClick)
            }
            item {
                DeliveryDetailCard(
                    state = uiState,
                    onPickupClick = { showPickupSheet = true },
                    onDestinationClick = { showDestinationSheet = true },
                    onRequestLocationClick = { showLocationRequestSheet = true }
                )
            }
            item {
                BookingProgressPills(state = uiState)
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
                if (uiState.selectedPrice() != null) {
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
                } else if (uiState.priceBreakdowns.isEmpty()) {
                    item {
                        RouteUnavailableCard()
                    }
                }
            } else {
                item {
                    BookingStepHintCard()
                }
            }
        }
    }

    if (showServiceSheet) {
        ModalBottomSheet(
            onDismissRequest = { showServiceSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
                onCopy = {
                    val link = uiState.receiverLocationLink?.url.orEmpty()
                    if (link.isNotBlank()) {
                        clipboardManager.setText(AnnotatedString(link))
                        Toast.makeText(context, "Link lokasi disalin", Toast.LENGTH_SHORT).show()
                    }
                }
            )
        }
    }

    if (showReviewSheet) {
        ModalBottomSheet(
            onDismissRequest = { showReviewSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
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
            Icon(Icons.Default.ArrowBack, contentDescription = "Kembali", tint = Color.White)
        }
        Spacer(Modifier.width(8.dp))
        Column {
            Text("LANCAR", fontSize = 28.sp, fontWeight = FontWeight.ExtraBold, color = Color.White)
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
                Text("Baru", color = Color.White, fontWeight = FontWeight.Bold, modifier = Modifier
                    .clip(RoundedCornerShape(50))
                    .background(Color(0xFFE8294D))
                    .padding(horizontal = 8.dp, vertical = 3.dp))
                Icon(Icons.Default.KeyboardArrowRight, null, tint = LcGreen)
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
            Icon(Icons.Default.KeyboardArrowRight, null, tint = Color(0xFFB2BAC6))
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
private fun BookingProgressPills(state: BookingState) {
    val steps = listOf(
        Triple("Alamat", state.isRouteComplete(), Icons.Default.Place),
        Triple("Berat", state.isRouteComplete(), Icons.Default.Scale),
        Triple("Layanan", state.selectedPrice() != null, Icons.Default.LocalShipping),
        Triple("Detail", state.isRecipientReady(), Icons.Default.CheckCircle)
    )
    LazyRow(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(steps) { step ->
            val done = step.second
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(if (done) SoftGreen else Color.White)
                    .border(
                        BorderStroke(1.dp, if (done) LcGreen.copy(alpha = 0.35f) else Color(0xFFE1E7F0)),
                        RoundedCornerShape(999.dp)
                    )
                    .padding(horizontal = 12.dp, vertical = 9.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    step.third,
                    contentDescription = null,
                    tint = if (done) LcGreen else Muted,
                    modifier = Modifier.size(17.dp)
                )
                Spacer(Modifier.width(7.dp))
                Text(
                    step.first,
                    color = if (done) LcGreen else Muted,
                    fontWeight = FontWeight.ExtraBold,
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
            shape = RoundedCornerShape(18.dp)
        )
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = state.recipientPhone,
            onValueChange = onPhoneChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nomor handphone penerima") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            shape = RoundedCornerShape(18.dp)
        )
        Spacer(Modifier.height(10.dp))
        Text("Paketnya berupa apa?", color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
        Spacer(Modifier.height(8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(listOf("Dokumen", "Makanan", "Baju", "Obat-obatan", "Buku", "Lainnya")) { packageType ->
                AssistChip(
                    onClick = { onItemChange(packageType) },
                    label = { Text(packageType) },
                    leadingIcon = {
                        if (state.itemDescription.equals(packageType, ignoreCase = true)) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                    }
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = state.itemDescription,
            onValueChange = onItemChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Isi paket / catatan barang") },
            singleLine = true,
            shape = RoundedCornerShape(18.dp)
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
    val tiers = listOf(
        PackageTier("small", "Kecil", "Maks. 5 kg", 5.0, 1.0, DimensionsPayload(40, 40, 17)),
        PackageTier("medium", "Sedang", "Maks. 20 kg", 20.0, 8.0, DimensionsPayload(50, 50, 40)),
        PackageTier("large", "Besar", "Maks. 100 kg", 100.0, 30.0, DimensionsPayload(120, 80, 80))
    )

    LcCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Ukuran & berat paket", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        }
        Text("Pastikan ukuran sesuai agar harga dan perlindungan paket akurat.", color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(16.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(items = tiers, key = { it.code }) { tier: PackageTier ->
                val selected = state.sizeTier == tier.code
                val availableForService = serviceMaxWeight == null || tier.maxWeightKg <= serviceMaxWeight
                Column(
                    modifier = Modifier
                        .width(132.dp)
                        .clip(RoundedCornerShape(18.dp))
                        .background(if (selected) SoftGreen else if (availableForService) Color.White else Color(0xFFF2F4F7))
                        .border(
                            BorderStroke(1.dp, if (selected) LcGreen else Color(0xFFDDE3EC)),
                            RoundedCornerShape(18.dp)
                        )
                        .clickable(enabled = availableForService) { onTierSelected(tier.code, tier.weightKg, tier.dimensions) }
                        .padding(14.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(tier.label, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = if (availableForService) Ink else Muted)
                    Spacer(Modifier.height(6.dp))
                    Text(if (availableForService) tier.caption else "Tidak cocok", color = Muted, fontSize = 13.sp)
                }
            }
        }
        Spacer(Modifier.height(14.dp))
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
            Text(
                "${state.packageWeight.toInt()} kg • ${state.packageLength}x${state.packageWidth}x${state.packageHeight} cm",
                fontWeight = FontWeight.Bold,
                color = Ink
            )
            Spacer(Modifier.weight(1f))
            Text(if (state.dimensionsScanned) "Scan valid" else "Dipilih manual", color = LcGreen, fontWeight = FontWeight.Bold)
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
        Divider(color = Color(0xFFE7EAF0))
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
                .background(SoftBlue)
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
                googleProperties = MapProperties(isMyLocationEnabled = locationEnabled),
                googleUiSettings = MapUiSettings(
                    zoomControlsEnabled = false,
                    compassEnabled = false,
                    myLocationButtonEnabled = false,
                    scrollGesturesEnabled = false,
                    zoomGesturesEnabled = false,
                    mapToolbarEnabled = false
                ),
                routeColor = LcGreen,
                fallbackTitle = "Rute belum tersedia",
                fallbackMessage = "Harga baru tampil setelah rute jalan valid dari provider peta.",
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
private fun RoutePricingProgressCard() {
    LcCard {
        Text("Menghitung rute & harga", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Spacer(Modifier.height(8.dp))
        Text(
            "Sistem mengambil rute jalan dari provider peta aktif sebelum layanan bisa dipilih.",
            color = Muted,
            lineHeight = 20.sp
        )
        Spacer(Modifier.height(16.dp))
        LinearProgressIndicator(
            modifier = Modifier
                .fillMaxWidth()
                .height(6.dp)
                .clip(CircleShape),
            color = LcGreen,
            trackColor = SoftGreen
        )
    }
}

@Composable
private fun RouteUnavailableCard() {
    LcCard {
        Text("Rute belum tersedia", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
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
    val isPricingReady = state.priceBreakdowns.isNotEmpty() && !state.isCalculatingRoute
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
    onChooseService: () -> Unit,
    onContinue: () -> Unit
) {
    val selected = state.selectedService()
    val price = state.selectedPrice()
    val routeReady = state.isRouteComplete()
    val recipientReady = state.isRecipientReady()
    val isPricingReady = state.priceBreakdowns.isNotEmpty() && !state.isCalculatingRoute
    val buttonLabel = when {
        !routeReady -> "Lengkapi alamat"
        state.isCalculatingRoute -> "Menghitung harga..."
        price == null -> "Pilih layanan"
        !recipientReady -> "Tambah detail pengiriman"
        else -> "Kirim ${selected?.name ?: "LANCAR"} • ${formatRupiah(price.totalPriceIdr)}"
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
                        state.isCalculatingRoute -> "Rute jalan sedang dihitung"
                        price == null -> "Pilih service setelah harga tampil"
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
            colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
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
        Text("Pilih layanan LANCAR", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Harga final dihitung dari pricing admin, jarak, berat, dan fitur tambahan.", color = Muted, lineHeight = 20.sp)
        if (state.isCalculatingRoute) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = SoftGreen),
                shape = RoundedCornerShape(20.dp)
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Menghitung harga dari rute jalan", color = Ink, fontWeight = FontWeight.ExtraBold)
                    LinearProgressIndicator(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(CircleShape),
                        color = LcGreen,
                        trackColor = Color.White
                    )
                }
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
                    ?: "Belum tersedia untuk rute/berat ini",
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
    val price = state.selectedPrice()
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
        ReviewInfoRow("Isi paket", state.itemDescription, "${state.packageWeight.toInt()} kg • ${state.packageLength}x${state.packageWidth}x${state.packageHeight} cm")
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
                Text(price?.let { "Estimasi ${etaLabel(it.etaMinutes)}" } ?: "Harga belum tersedia", color = Muted, fontSize = 13.sp)
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
                if (state.isLoading) "Mengirim order..." else "Kirim ${service?.name ?: "LANCAR"} • ${formatRupiah(price?.totalPriceIdr ?: 0)}",
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
        ?: "Estimasi sementara"
    val provider = snapshot?.activeProvider?.takeIf { it.isNotBlank() }
        ?: snapshot?.provider?.takeIf { it.isNotBlank() }
        ?: state.mapsProviderConfig.activeProvider

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
                    provider.uppercase(Locale.getDefault()),
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
                .background(SoftBlue)
        ) {
            RuntimeMapRenderer(
                providerConfig = state.mapsProviderConfig,
                markers = markers,
                routePoints = routePoints,
                followLocation = null,
                googleProperties = MapProperties(isMyLocationEnabled = false),
                googleUiSettings = MapUiSettings(
                    zoomControlsEnabled = false,
                    compassEnabled = false,
                    myLocationButtonEnabled = false,
                    scrollGesturesEnabled = false,
                    zoomGesturesEnabled = false,
                    mapToolbarEnabled = false
                ),
                routeColor = LcGreen,
                fallbackTitle = "Rute sedang diperbarui",
                fallbackMessage = "Estimasi sementara tetap aman dipakai untuk order ini.",
                modifier = Modifier.fillMaxSize()
            )
        }
        if (snapshot?.fallbackReason?.isNotBlank() == true) {
            Text(
                "Estimasi sementara. Rute akan diperbarui otomatis saat provider aktif.",
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
            shape = RoundedCornerShape(18.dp)
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
                shape = RoundedCornerShape(18.dp)
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
                text = listOfNotNull(
                    result.provider.takeIf { it.isNotBlank() }?.uppercase(Locale.getDefault()),
                    result.confidence?.let { "Akurasi ${"%.0f".format(Locale.US, it * 100)}%" }
                ).joinToString(" • "),
                color = Muted,
                fontSize = 12.sp,
                maxLines = 1
            )
        }
        Icon(Icons.Default.KeyboardArrowRight, null, tint = Muted)
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
    onCopy: () -> Unit
) {
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
                link.ifBlank { "Link belum dibuat" },
                color = Ink,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.weight(1f),
                maxLines = 2
            )
            TextButton(onClick = onCopy, enabled = link.isNotBlank()) {
                Text("Salin", color = LcGreen, fontWeight = FontWeight.ExtraBold)
            }
        }
        Spacer(Modifier.height(18.dp))
        if (link.isNotBlank()) {
            Button(
                onClick = onRefresh,
                enabled = !isLoading,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Primary)
            ) {
                Text(if (isLoading) "Mengecek..." else "Cek jawaban penerima", fontWeight = FontWeight.ExtraBold)
            }
            Spacer(Modifier.height(10.dp))
        }
        Button(
            onClick = if (link.isBlank()) onCreateLink else onCopy,
            enabled = !isLoading,
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
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(Modifier.padding(18.dp), content = content)
    }
}

private data class PackageTier(
    val code: String,
    val label: String,
    val caption: String,
    val maxWeightKg: Double,
    val weightKg: Double,
    val dimensions: DimensionsPayload
)

private fun serviceIcon(service: DeliveryServiceProduct?): ImageVector {
    return if (service?.vehicleTypes?.contains("car") == true) Icons.Default.LocalShipping else Icons.Default.LocalShipping
}

private fun etaLabel(minutes: Int): String {
    if (minutes <= 0) return "-"
    return if (minutes < 60) "$minutes menit" else "${minutes / 60}-${(minutes / 60) + 1} jam"
}

private fun formatRupiah(value: Long): String {
    if (value <= 0) return "Rp0"
    val formatter = NumberFormat.getNumberInstance(Locale("id", "ID"))
    return "Rp${formatter.format(value)}"
}
