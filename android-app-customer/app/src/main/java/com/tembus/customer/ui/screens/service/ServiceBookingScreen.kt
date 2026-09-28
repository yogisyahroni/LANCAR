package com.tembus.customer.ui.screens.service

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.TextButton
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tembus.customer.ui.designsystem.logistics.TembusAddressData
import com.tembus.customer.ui.designsystem.logistics.TembusQuoteBreakdown
import com.tembus.customer.ui.designsystem.logistics.TembusQuoteBreakdownData
import com.tembus.customer.ui.designsystem.logistics.TembusQuoteLine
import com.tembus.customer.ui.designsystem.logistics.TembusRouteSummary
import com.tembus.customer.ui.designsystem.logistics.TembusRouteSummaryData
import com.tembus.customer.ui.designsystem.logistics.TembusSafetyNotice
import com.tembus.customer.ui.designsystem.logistics.TembusTechnicianCard
import com.tembus.customer.ui.designsystem.logistics.TembusTechnicianData
import com.tembus.customer.ui.designsystem.logistics.TembusRequoteApprovalCard
import com.tembus.customer.ui.designsystem.logistics.TembusRequoteApprovalData
import com.tembus.customer.ui.designsystem.service.TembusServiceIdentityCard
import com.tembus.customer.ui.designsystem.service.TembusTireRepairIdentity
import com.tembus.customer.ui.designsystem.service.TembusTowingIdentity
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.OnOrangeCta
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.PrimarySoft

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceBookingScreen(
    serviceSubType: String,
    onBackClick: () -> Unit,
    onBookingSuccess: (String) -> Unit,
    onSelectCourierClick: (lat: Double, lng: Double) -> Unit = { _, _ -> },
    courierId: String? = null,
    courierPrice: Long? = null,
    courierName: String = "",
    courierRating: Double = 0.0,
    initialPhotos: List<LocalServicePhoto> = emptyList(),
    initialDamageType: String = "",
    initialNotes: String = "",
    initialRequestedHoleCount: Int? = null,
    initialTowingConditions: List<String> = emptyList(),
    initialTowingNotes: String = "",
    initialPickup: TowingRoutePoint? = null,
    initialDropoff: TowingRoutePoint? = null,
    viewModel: ServiceBookingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val isTowing = serviceSubType.startsWith("towing")

    // The previous screen is the canonical roadside intake. This screen is only
    // review/quote after a provider is selected; do not create a second editable
    // vehicle form here.
    val vehicleType = roadsideVehicleType(serviceSubType)
    val damageType = initialDamageType.ifBlank { initialTowingConditions.joinToString(", ") }
    val vehicleCondition = initialTowingConditions.joinToString(", ")
    val accessConstraints = ""
    var notes by remember(serviceSubType, initialNotes, initialTowingNotes) {
        mutableStateOf(initialNotes.ifBlank { initialTowingNotes })
    }
    var destinationContactName by remember { mutableStateOf("") }
    var destinationContactPhone by remember { mutableStateOf("") }
    var servicePhotos by remember(serviceSubType, initialPhotos) { mutableStateOf(initialPhotos) }
    var photoReadError by remember(serviceSubType) { mutableStateOf<String?>(null) }
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        )
    }

    val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }

    fun fetchCurrentLocation() {
        if (!hasLocationPermission) return
        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { location ->
                if (location != null) {
                    viewModel.setLocation(location.latitude, location.longitude)
                } else {
                    viewModel.setLocationError("Lokasi belum tersedia. Pilih lokasi di peta atau perbaiki pin.")
                }
            }
            .addOnFailureListener {
                viewModel.setLocationError("Lokasi tidak dapat dibaca. Pilih lokasi di peta atau perbaiki pin.")
            }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasLocationPermission = granted
        if (granted) fetchCurrentLocation()
    }

    LaunchedEffect(initialPickup, initialDropoff) {
        if (initialPickup != null || initialDropoff != null) {
            viewModel.applyInitialRoute(initialPickup, initialDropoff)
        }
    }

    LaunchedEffect(hasLocationPermission, initialPickup?.latitude, initialPickup?.longitude) {
        if (hasLocationPermission && initialPickup == null) {
            fetchCurrentLocation()
        }
    }

    LaunchedEffect(uiState.orderId) {
        uiState.orderId?.let { id ->
            onBookingSuccess(id)
        }
    }

    LaunchedEffect(serviceSubType) {
        viewModel.loadMaterials(serviceSubType)
    }

    fun submitSelectedServiceOrder() {
        val preparedPhotos = prepareServicePhotoUploads(
            context = context,
            photos = servicePhotos,
            photoRole = if (isTowing) "vehicle_condition" else "tire_condition",
        )
        if (preparedPhotos.isFailure) {
            photoReadError = preparedPhotos.exceptionOrNull()?.message ?: "Foto belum dapat dibaca"
            return
        }
        photoReadError = null
        viewModel.createOrder(
            serviceSubType = serviceSubType,
            vehicleType = vehicleType,
            damageType = damageType,
            vehicleMake = "",
            vehicleModel = "",
            vehicleCondition = vehicleCondition,
            accessConstraints = accessConstraints,
            notes = notes,
            requestedHoleCount = initialRequestedHoleCount,
            towingConditions = initialTowingConditions,
            destinationContactName = destinationContactName,
            destinationContactPhone = destinationContactPhone,
            preferredCourierId = courierId,
            photoUploads = preparedPhotos.getOrThrow(),
        )
    }

    val submitTowingAction = {
        if (uiState.priceEstimate == null) {
            if (uiState.customerLat != 0.0 && uiState.customerLng != 0.0 && uiState.dropoffAddress.isNotBlank()) {
                viewModel.fetchEstimate(
                    serviceSubType = serviceSubType,
                    lat = uiState.customerLat,
                    lng = uiState.customerLng,
                    courierId = courierId,
                    requestedHoleCount = initialRequestedHoleCount,
                )
            }
        } else {
            submitSelectedServiceOrder()
        }
    }

    Scaffold(
        containerColor = Color(0xFFF2FCF3),
        topBar = {
            TopAppBar(
                title = { Text(formatServiceName(serviceSubType), fontWeight = FontWeight.Bold) },
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFFF2FCF3),
                ),
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                }
            )
        },
        bottomBar = {
            if (isTowing) {
                Surface(
                    color = androidx.compose.ui.graphics.Color.White,
                    shadowElevation = 8.dp,
                    modifier = Modifier.navigationBarsPadding(),
                ) {
                    Column(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(4.dp),
                    ) {
                        Button(
                            onClick = submitTowingAction,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !uiState.isLoading && uiState.customerLat != 0.0 &&
                                uiState.dropoffAddress.isNotBlank() && courierId != null &&
                                uiState.photoUploadError == null,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = OrangeCta,
                                contentColor = OnOrangeCta,
                            ),
                        ) {
                            Text(
                                when {
                                    uiState.isLoading -> "Memuat penawaran..."
                                    uiState.priceEstimate == null -> "Cek Harga Penawaran"
                                    else -> "Konfirmasi & kunci penawaran →"
                                },
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        Text(
                            "Tarif petugas, jarak, tol, dan biaya platform dikunci dari penawaran server sebelum pembayaran.",
                            fontSize = 10.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                        )
                    }
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState())
        ) {
            TembusServiceIdentityCard(
                identity = if (isTowing) TembusTowingIdentity else TembusTireRepairIdentity
            )
            if (isTowing) {
                TembusSafetyNotice(
                    message = "Pastikan kendaraan berada di lokasi aman, tujuan dropoff benar, dan kondisi kendaraan sesuai detail sebelum petugas berangkat."
                )
            }
            Spacer(Modifier.height(4.dp))

            RoadsideRequestReviewCard(
                serviceSubType = serviceSubType,
                vehicleType = vehicleType,
                issueLabel = damageType,
                conditionLabel = vehicleCondition,
                notes = notes,
                photoCount = servicePhotos.size,
            )

            Spacer(Modifier.height(12.dp))
            photoReadError?.let { message ->
                Spacer(Modifier.height(6.dp))
                Text(message, color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
            }
            uiState.photoUploadError?.let { message ->
                Spacer(Modifier.height(8.dp))
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                ) {
                    Column(Modifier.padding(12.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                        Text(message, color = MaterialTheme.colorScheme.onErrorContainer, fontSize = 12.sp)
                        Text(
                            "Order sudah dibuat, tetapi foto belum seluruhnya tersimpan di server. Ulangi upload sebelum melanjutkan.",
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            fontSize = 12.sp,
                        )
                        OutlinedButton(
                            onClick = viewModel::retryPhotoUploads,
                            enabled = !uiState.isLoading,
                        ) { Text("Coba simpan foto lagi") }
                    }
                }
            }
            if (uiState.isLoading && uiState.pendingPhotoCount > 0) {
                Spacer(Modifier.height(6.dp))
                Text(
                    "Menyimpan foto ${uiState.uploadedPhotoCount}/${uiState.pendingPhotoCount}...",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (!isTowing && uiState.materials.isNotEmpty()) {
                Spacer(Modifier.height(16.dp))
                Text("Material tambahan (opsional)", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Harga diambil dari katalog operasional dan dihitung ulang server saat cek harga.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                uiState.materials.forEach { material ->
                    FilterChip(
                        selected = material.code in uiState.selectedMaterialCodes,
                        onClick = { viewModel.toggleMaterial(material.code) },
                        label = { Text("${material.name} • Rp ${formatRupiah(material.priceIdr)}") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(6.dp))
                }
            }

            Spacer(Modifier.height(16.dp))

            // Location section (GPS)
            Text(
                if (isTowing) "Lokasi jemput kendaraan" else "2. Lokasi layanan",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(Modifier.height(8.dp))

            when {
                !hasLocationPermission -> {
                    Text(
                        "Aktifkan lokasi untuk menentukan posisi Anda.",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = { permissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION) }
                    ) {
                        Text("Aktifkan Lokasi")
                    }
                }

                uiState.isResolvingLocation -> {
                    CircularProgressIndicator(modifier = Modifier.height(18.dp))
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Membaca alamat dari GPS...",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                uiState.customerLat != 0.0 -> {
                    Text(
                        uiState.customerAddress.ifBlank { "Lokasi saat ini" },
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(4.dp))
                    // FB-005: user bisa memperbaiki pin manual bila GPS meleset.
                    Row {
                        Text(
                            "Pin: ${"%.6f".format(uiState.customerLat)}, ${"%.6f".format(uiState.customerLng)}",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.width(8.dp))
                        TextButton(onClick = {
                            // Opens native map picker to correct pin.
                            val uri = "geo:${uiState.customerLat},${uiState.customerLng}?q=${uiState.customerLat},${uiState.customerLng}"
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))
                        }) {
                            Text("Perbaiki", fontSize = 12.sp)
                        }
                    }
                }

                else -> {
                    Text(
                        "Mengambil lokasi...",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            if (isTowing) {
                Text(
                    "Tujuan towing",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = uiState.dropoffQuery,
                    onValueChange = viewModel::updateDropoffQuery,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Cari alamat bengkel, rumah, atau dropoff") },
                    singleLine = false,
                    minLines = 1,
                    maxLines = 2
                )
                Spacer(Modifier.height(8.dp))
                OutlinedButton(
                    onClick = viewModel::searchDropoffAddress,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = uiState.dropoffQuery.trim().length >= 3 && !uiState.isLoading
                ) {
                    Text(if (uiState.isLoading) "Mencari tujuan..." else "Cari Tujuan")
                }
                if (uiState.dropoffResults.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    uiState.dropoffResults.take(5).forEach { result ->
                        OutlinedButton(
                            onClick = { viewModel.selectDropoff(result) },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Text(
                                    result.label.ifBlank { "Tujuan towing" },
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold
                                )
                                Text(
                                    "${result.latitude}, ${result.longitude}",
                                    fontSize = 11.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        Spacer(Modifier.height(6.dp))
                    }
                } else if (uiState.dropoffAddress.isNotBlank()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(TembusRadius.Card),
                        colors = CardDefaults.cardColors(
                            containerColor = PrimarySoft.copy(alpha = 0.78f)
                        )
                    ) {
                        Column(modifier = Modifier.padding(12.dp)) {
                            Text("Tujuan dipilih", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Spacer(Modifier.height(4.dp))
                            Text(uiState.dropoffAddress, fontSize = 13.sp)
                            Text(
                                "${uiState.dropoffLat}, ${uiState.dropoffLng}",
                                fontSize = 11.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }

                Spacer(Modifier.height(16.dp))

                Text("Kontak tujuan", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = destinationContactName,
                    onValueChange = { destinationContactName = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Nama bengkel/penerima") },
                    singleLine = true
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = destinationContactPhone,
                    onValueChange = { destinationContactPhone = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Nomor kontak tujuan (wajib)") },
                    singleLine = true
                )

                Spacer(Modifier.height(16.dp))
            }

            // Selected courier (dari "Pilih Petugas")
            if (courierId != null) {
                TembusTechnicianCard(
                    data = TembusTechnicianData(
                        name = courierName.ifBlank { "Petugas TEMBUS" },
                        capabilityLabel = formatServiceName(serviceSubType),
                        etaLabel = "Petugas dipilih",
                        ratingLabel = courierRating.takeIf { it > 0 }?.let { "Rating ${"%.1f".format(it)}" },
                        statusLabel = courierPrice?.takeIf { it > 0 }?.let { "Harga jasa: Rp ${formatRupiah(it)}" },
                    )
                )
                if (!isTowing && initialRequestedHoleCount != null) {
                    Text(
                        "Permintaan customer: $initialRequestedHoleCount lubang. Pekerjaan di sistem mengikuti jumlah ini.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(bottom = 8.dp),
                    )
                }
                Spacer(Modifier.height(8.dp))
            } else {
                // Pilih petugas dulu (wajib untuk tambal ban & towing)
                OutlinedButton(
                    onClick = {
                        if (uiState.customerLat != 0.0) {
                            onSelectCourierClick(uiState.customerLat, uiState.customerLng)
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = uiState.customerLat != 0.0 && (!isTowing || uiState.dropoffAddress.isNotBlank())
                ) {
                Text("Pilih Penawaran Petugas")
                }
                Spacer(Modifier.height(8.dp))
            }

            // Price estimation
            if (uiState.priceEstimate != null) {
                val estimate = uiState.priceEstimate!!
                val breakdown = uiState.rawPriceBreakdown
                val displayServiceFee = breakdown?.serviceFeeIdr?.takeIf { it > 0 }
                    ?: if (courierPrice != null && courierPrice > 0) courierPrice else (estimate.baseFare - estimate.distanceBase).coerceAtLeast(0)
                val travelFee = breakdown?.travelFeeIdr?.takeIf { it > 0 }
                    ?: (estimate.distanceBase +
                        (estimate.perKmRate * kotlin.math.max(0.0, kotlin.math.ceil(estimate.distanceKm - 1))).toLong())
                val route = uiState.rawPriceBreakdown?.routeSnapshot
                val quoteLines = buildList {
                    add(TembusQuoteLine(
                        if (!isTowing && initialRequestedHoleCount != null && (breakdown?.pricePerHoleIdr ?: 0) > 0)
                            "Jasa petugas ($initialRequestedHoleCount lubang × Rp ${formatRupiah(breakdown!!.pricePerHoleIdr)})"
                        else "Jasa petugas",
                        "Rp ${formatRupiah(displayServiceFee)}"
                    ))
                    add(TembusQuoteLine("Biaya perjalanan", "Rp ${formatRupiah(travelFee)} (${"%.1f".format(estimate.distanceKm)} km)"))
                    if (estimate.dynamicPrice > 0) add(TembusQuoteLine("Biaya dinamis", "Rp ${formatRupiah(estimate.dynamicPrice)}"))
                    if (estimate.materialCost > 0) add(TembusQuoteLine("Material", "Rp ${formatRupiah(estimate.materialCost)}"))
                    if (isTowing) add(TembusQuoteLine("Tol", if (estimate.tollCost > 0) "Rp ${formatRupiah(estimate.tollCost)}" else "Belum termasuk"))
                    add(TembusQuoteLine("Biaya layanan platform", "Rp ${formatRupiah(estimate.platformFee)}"))
                }
                TembusQuoteBreakdown(
                    data = TembusQuoteBreakdownData(
                        title = if (isTowing) "Penawaran towing" else "Penawaran tambal ban",
                        lines = quoteLines,
                        totalLabel = "Rp ${formatRupiah(estimate.totalPrice)}",
                        providerLabel = route?.provider?.ifBlank { null } ?: "Katalog operasional",
                    )
                )
                Spacer(Modifier.height(8.dp))
                TembusSafetyNotice(
                    message = "Harga pada penawaran ini sudah berasal dari tarif provider yang dipilih dan disimpan server. Inspeksi petugas tidak mengubah harga yang telah dikunci."
                )

                Spacer(Modifier.height(24.dp))

                if (isTowing) {
                    TembusRouteSummary(
                        data = TembusRouteSummaryData(
                            pickup = TembusAddressData("Pickup kendaraan", uiState.customerAddress.ifBlank { "Lokasi GPS" }),
                            dropoff = TembusAddressData("Tujuan towing", uiState.dropoffAddress),
                            distanceLabel = "Jarak ${"%.1f".format(estimate.distanceKm)} km",
                            providerLabel = route?.provider?.ifBlank { "Belum tersedia" } ?: "Belum tersedia",
                        )
                    )
                    Spacer(Modifier.height(10.dp))
                    TowingRoutePreviewCard(
                        pickupLabel = uiState.customerAddress.ifBlank { "Lokasi GPS" },
                        dropoffLabel = uiState.dropoffAddress,
                        distanceLabel = "Jarak ${"%.1f".format(estimate.distanceKm)} km",
                    )
                    Spacer(Modifier.height(16.dp))
                }

                if (!isTowing) {
                    // Submit button for Tambal Ban remains in the scroll flow.
                    Button(
                        onClick = {
                            submitSelectedServiceOrder()
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = courierId != null && !uiState.isLoading && uiState.photoUploadError == null &&
                            uiState.priceEstimate != null,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = OrangeCta,
                            contentColor = OnOrangeCta,
                        )
                    ) {
                        Text(
                            when {
                                uiState.isLoading -> "Membuat pesanan..."
                                courierId == null -> "Pilih Petugas Dulu"
                                else -> "Konfirmasi & kunci penawaran"
                            },
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            } else {
                if (!isTowing) {
                    // Check price button for Tambal Ban remains in the scroll flow.
                    Button(
                        onClick = {
                            if (uiState.customerLat != 0.0) {
                                viewModel.fetchEstimate(
                                    serviceSubType = serviceSubType,
                                    lat = uiState.customerLat,
                                    lng = uiState.customerLng,
                                    courierId = courierId,
                                    requestedHoleCount = initialRequestedHoleCount,
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = uiState.customerLat != 0.0 && courierId != null && !uiState.isLoading,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = OrangeCta,
                            contentColor = OnOrangeCta,
                        )
                    ) {
                        Text(
                            when {
                                uiState.isLoading -> "Menghitung..."
                                courierId == null -> "Pilih Penawaran Petugas Dulu"
                                else -> "Cek Harga"
                            },
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // Error handling
            uiState.error?.let { error ->
                Spacer(Modifier.height(8.dp))
                Text(
                    error,
                    color = MaterialTheme.colorScheme.error,
                    fontSize = 14.sp
                )
            }
        }
    }
}

@Composable
private fun RoadsideRequestReviewCard(
    serviceSubType: String,
    vehicleType: String,
    issueLabel: String,
    conditionLabel: String,
    notes: String,
    photoCount: Int,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Ringkasan permintaan", fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("Siap dikunci", fontSize = 11.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            }
            ReviewFactRow("Layanan", formatServiceName(serviceSubType))
            ReviewFactRow("Kendaraan", vehicleType)
            issueLabel.takeIf { it.isNotBlank() }?.let { ReviewFactRow("Masalah", it) }
            conditionLabel.takeIf { it.isNotBlank() }?.let { ReviewFactRow("Kondisi untuk petugas", it) }
            ReviewFactRow("Catatan", notes.ifBlank { "Tidak ada catatan tambahan" })
            ReviewFactRow("Foto kondisi", if (photoCount > 0) "$photoCount foto dari kamera" else "Belum ada foto")
            Text(
                "Detail diambil dari formulir sebelumnya. Untuk mengubahnya, kembali ke halaman input sebelum memilih petugas.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun ReviewFactRow(label: String, value: String) {
    Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(2.dp)) {
        Text(label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
    }
}

private fun roadsideVehicleType(serviceSubType: String): String = when {
    serviceSubType.endsWith("_motor") -> "Sepeda motor"
    serviceSubType.endsWith("_mobil") -> "Mobil penumpang"
    else -> "Kendaraan roadside"
}

private fun formatServiceName(serviceSubType: String): String {
    return when (serviceSubType) {
        "tambal_ban_motor" -> "Tambal Ban Motor"
        "tambal_ban_mobil" -> "Tambal Ban Mobil"
        "towing_motor" -> "Towing Motor"
        "towing_mobil" -> "Towing Mobil"
        else -> serviceSubType
    }
}

@Composable
private fun TowingRoutePreviewCard(
    pickupLabel: String,
    dropoffLabel: String,
    distanceLabel: String,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = androidx.compose.ui.graphics.Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Rute evakuasi & lokasi bengkel", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(distanceLabel, fontSize = 11.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold)
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(116.dp)
                    .background(androidx.compose.ui.graphics.Color(0xFFE7F1EA), RoundedCornerShape(14.dp))
                    .border(1.dp, androidx.compose.ui.graphics.Color(0xFFD2E4D8), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(3.dp)) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    Text("Peta menunggu rute server", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    Text("Tidak ada jalur contoh yang ditampilkan", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
                Text("Pickup: $pickupLabel", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f), maxLines = 2)
                Text("Drop-off: $dropoffLabel", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f), maxLines = 2)
            }
        }
    }
}

private fun formatRupiah(amount: Long): String {
    return amount.toString().reversed().chunked(3).joinToString(".").reversed()
}
