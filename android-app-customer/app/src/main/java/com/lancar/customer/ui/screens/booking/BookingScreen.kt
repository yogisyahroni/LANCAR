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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
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
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.lancar.customer.data.model.CustomerAddress
import com.lancar.customer.data.model.DeliveryServiceProduct
import com.lancar.customer.data.model.DimensionsPayload
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

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Composable
fun BookingScreen(
    viewModel: BookingViewModel,
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
    val defaultJakarta = remember { LatLng(-6.2088, 106.8456) }
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(defaultJakarta, 11f)
    }
    val locationPermissionState = rememberPermissionState(Manifest.permission.ACCESS_FINE_LOCATION)

    LaunchedEffect(Unit) {
        if (!locationPermissionState.status.isGranted) {
            locationPermissionState.launchPermissionRequest()
        }
    }

    LaunchedEffect(viewModel) {
        viewModel.bookingSuccess.collectLatest { orderId ->
            Toast.makeText(context, "Order berhasil dibuat", Toast.LENGTH_SHORT).show()
            onBookingSuccess(orderId)
        }
    }

    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            Toast.makeText(context, error, Toast.LENGTH_LONG).show()
            viewModel.clearError()
        }
    }

    Scaffold(
        containerColor = Color(0xFFF3F5F8),
        bottomBar = {
            SelectedServiceBar(
                state = uiState,
                onChooseService = { showServiceSheet = true },
                onContinue = { viewModel.confirmBooking() }
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
                RecipientCard(
                    state = uiState,
                    onNameChange = viewModel::setRecipientName,
                    onPhoneChange = viewModel::setRecipientPhone,
                    onItemChange = viewModel::setItemDescription
                )
            }
            item {
                PackageCard(
                    state = uiState,
                    onTierSelected = { code, weight, dimensions ->
                        viewModel.setSizeTier(code, weight, dimensions)
                    }
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
            item {
                RoutePreviewCard(
                    state = uiState,
                    locationEnabled = locationPermissionState.status.isGranted
                )
            }
            item {
                ServiceInlinePreview(
                    state = uiState,
                    onChooseService = { showServiceSheet = true }
                )
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
            onDismissRequest = { showDestinationSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = Color.White
        ) {
            LocationInputSheet(
                title = "Kirim paket ke mana?",
                subtitle = "Masukkan alamat dan koordinat tujuan asli dari Maps agar harga dan rute dihitung dari data nyata.",
                buttonLabel = "Gunakan alamat tujuan",
                savedAddresses = uiState.addressBook.filter { it.kind == "receiver" || it.kind == "both" },
                addressKind = "receiver",
                onSelect = { location, address ->
                    viewModel.setDestination(location, address)
                    showDestinationSheet = false
                },
                onSavedAddressSelected = { address ->
                    viewModel.selectSavedAddress(address, asPickup = false)
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
                    showDestinationSheet = false
                }
            )
        }
    }

    if (showPickupSheet) {
        ModalBottomSheet(
            onDismissRequest = { showPickupSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = Color.White
        ) {
            LocationInputSheet(
                title = "Ambil paket di mana?",
                subtitle = "Masukkan alamat dan koordinat pickup asli supaya kurir menerima titik penjemputan yang akurat.",
                buttonLabel = "Gunakan alamat pickup",
                savedAddresses = uiState.addressBook.filter { it.kind == "pickup" || it.kind == "both" },
                addressKind = "pickup",
                onSelect = { location, address ->
                    viewModel.setPickup(location, address)
                    showPickupSheet = false
                },
                onSavedAddressSelected = { address ->
                    viewModel.selectSavedAddress(address, asPickup = true)
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
                Text("Detail pengiriman", fontWeight = FontWeight.ExtraBold, fontSize = 21.sp, color = Ink)
                Spacer(Modifier.weight(1f))
                AssistChip(
                    onClick = onDestinationClick,
                    label = { Text("Pilih tujuan") },
                    leadingIcon = { Icon(Icons.Default.Place, null, Modifier.size(18.dp)) }
                )
            }
            Spacer(Modifier.height(16.dp))
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
private fun RecipientCard(
    state: BookingState,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onItemChange: (String) -> Unit
) {
    LcCard {
        Text("Penerima & barang", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
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
        OutlinedTextField(
            value = state.itemDescription,
            onValueChange = onItemChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Isi paket") },
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
    val selectedService = state.services.firstOrNull { it.code == state.selectedServiceCode } ?: state.services.firstOrNull()
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
        val selectedPrice = state.priceBreakdowns[state.selectedServiceCode]
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Preview rute", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
            Spacer(Modifier.weight(1f))
            if (selectedPrice != null) {
                Text("${selectedPrice.distanceKm} km", color = LcGreen, fontWeight = FontWeight.ExtraBold)
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
            val routePoints = if (state.pickupLocation != null && state.destinationLocation != null) {
                listOf(state.pickupLocation, state.destinationLocation)
            } else {
                emptyList()
            }
            RuntimeMapRenderer(
                providerConfig = state.mapsProviderConfig,
                markers = markers,
                routePoints = routePoints,
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
                fallbackTitle = "Preview rute siap",
                fallbackMessage = "Pilih titik pickup dan tujuan. Rute dihitung oleh backend sesuai provider peta aktif.",
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
private fun ServiceInlinePreview(
    state: BookingState,
    onChooseService: () -> Unit
) {
    val selected = state.services.firstOrNull { it.code == state.selectedServiceCode } ?: state.services.firstOrNull()
    val price = selected?.let { state.priceBreakdowns[it.code] }
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
                Text(selected?.name ?: "Pilih layanan", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
                Text(
                    if (price != null) "Estimasi ${etaLabel(price.etaMinutes)}" else "Harga muncul setelah alamat lengkap",
                    color = Muted,
                    fontSize = 14.sp
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(formatRupiah(price?.totalPriceIdr ?: 0), fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
                TextButton(onClick = onChooseService) { Text("Ganti") }
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
    val selected = state.services.firstOrNull { it.code == state.selectedServiceCode } ?: state.services.firstOrNull()
    val price = selected?.let { state.priceBreakdowns[it.code] }
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
                Text(price?.let { "Diantar ${etaLabel(it.etaMinutes)}" } ?: "Lengkapi detail pengiriman", color = Muted, fontSize = 13.sp)
            }
            TextButton(onClick = onChooseService) {
                Text(if (state.services.size > 1) "Pilih" else "Detail", fontWeight = FontWeight.Bold)
            }
            Text(formatRupiah(price?.totalPriceIdr ?: 0), fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = Ink)
        }
        Spacer(Modifier.height(14.dp))
        Button(
            onClick = onContinue,
            enabled = state.destinationLocation != null && price != null && !state.isLoading,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(18.dp),
            colors = ButtonDefaults.buttonColors(containerColor = LcGreen)
        ) {
            Text("Tambah detail pengiriman", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
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
            .padding(horizontal = 18.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text("Pilih layanan LANCAR", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Harga dihitung dari pricing admin, jarak, berat, dan fitur tambahan.", color = Muted)
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
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(if (selected) SoftGreen else Color.White)
            .border(BorderStroke(1.dp, if (selected) LcGreen else Color(0xFFE2E6ED)), RoundedCornerShape(22.dp))
            .clickable { onClick() }
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
                price?.let { "Dikirim ${etaLabel(it.etaMinutes)}" } ?: "Lengkapi rute untuk melihat harga",
                color = Muted,
                fontSize = 14.sp
            )
            if (service.maxWeightKg != null) {
                Text("Maks. ${service.maxWeightKg.toInt()} kg", color = Muted, fontSize = 12.sp)
            }
        }
        Text(formatRupiah(price?.totalPriceIdr ?: 0), fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
    }
}

@Composable
private fun LocationInputSheet(
    title: String,
    subtitle: String,
    buttonLabel: String,
    savedAddresses: List<CustomerAddress>,
    addressKind: String,
    onSelect: (LatLng, String) -> Unit,
    onSavedAddressSelected: (CustomerAddress) -> Unit,
    onSaveAndSelect: (String, LatLng, String) -> Unit
) {
    var address by remember { mutableStateOf("") }
    var latitude by remember { mutableStateOf("") }
    var longitude by remember { mutableStateOf("") }
    var saveFavorite by remember { mutableStateOf(false) }
    var label by remember { mutableStateOf(if (addressKind == "pickup") "Pickup utama" else "Tujuan favorit") }
    val parsedLatitude = latitude.toDoubleOrNull()
    val parsedLongitude = longitude.toDoubleOrNull()
    val canSave = address.trim().length >= 6 &&
        parsedLatitude != null &&
        parsedLongitude != null &&
        parsedLatitude in -90.0..90.0 &&
        parsedLongitude in -180.0..180.0

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(title, fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text(subtitle, color = Muted)
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
        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Alamat tujuan") },
            minLines = 2,
            shape = RoundedCornerShape(18.dp)
        )
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedTextField(
                value = latitude,
                onValueChange = { latitude = it },
                modifier = Modifier.weight(1f),
                label = { Text("Latitude") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                shape = RoundedCornerShape(18.dp)
            )
            OutlinedTextField(
                value = longitude,
                onValueChange = { longitude = it },
                modifier = Modifier.weight(1f),
                label = { Text("Longitude") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                singleLine = true,
                shape = RoundedCornerShape(18.dp)
            )
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
                if (parsedLatitude != null && parsedLongitude != null) {
                    val selectedLocation = LatLng(parsedLatitude, parsedLongitude)
                    if (saveFavorite) {
                        onSaveAndSelect(label.trim(), selectedLocation, address.trim())
                    } else {
                        onSelect(selectedLocation, address.trim())
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
