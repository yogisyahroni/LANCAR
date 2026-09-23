package com.tembus.customer.ui.screens.booking

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.tembus.customer.data.model.LogisticsProviderOption
import com.tembus.customer.ui.components.createCameraCaptureUri
import com.tembus.customer.ui.a11y.criticalAction
import com.tembus.customer.ui.designsystem.TembusAppBar
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.theme.AccentSoft
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.CustomerHomeCanvas
import com.tembus.customer.ui.theme.OnOrangeCta
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.OutlineStrong
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimarySoft
import com.tembus.customer.ui.theme.SurfaceVariant
import com.tembus.customer.ui.theme.TembusRadius
import kotlinx.coroutines.flow.collectLatest
import java.util.Locale

private val AggregatorInk = OnSurface
private val AggregatorMuted = OnSurfaceVariant
private val AggregatorStepAccent = Color(0xFFF36B21)

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun AggregatorScreen(
    viewModel: BookingViewModel,
    onBackClick: () -> Unit,
    onHelpClick: () -> Unit = {},
    onBookingSuccess: (String) -> Unit
) {
    val state by viewModel.bookingState.collectAsState()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val locationPermissionState = rememberPermissionState(Manifest.permission.ACCESS_FINE_LOCATION)
    var showPickupSheet by remember { mutableStateOf(false) }
    var showDestinationSheet by remember { mutableStateOf(false) }
    var showLocationRequestSheet by remember { mutableStateOf(false) }
    var showReviewSheet by remember { mutableStateOf(false) }
    var packagePhotos by remember { mutableStateOf<List<LocalAggregatorPackagePhoto>>(emptyList()) }

    fun updatePackagePhotos(next: List<LocalAggregatorPackagePhoto>) {
        val prepared = prepareAggregatorPackagePhotoUploads(context, next)
        prepared.fold(
            onSuccess = { uploads ->
                packagePhotos = next
                viewModel.setPackagePhotoUploads(uploads)
            },
            onFailure = { error ->
                Toast.makeText(context, error.localizedMessage ?: "Foto paket belum dapat dibaca.", Toast.LENGTH_LONG).show()
            }
        )
    }

    LaunchedEffect(Unit) {
        if (!locationPermissionState.status.isGranted) locationPermissionState.launchPermissionRequest()
    }
    BackHandler(onBack = onBackClick)
    LaunchedEffect(viewModel) {
        viewModel.bookingSuccess.collectLatest { orderId ->
            showReviewSheet = false
            Toast.makeText(context, "Order berhasil dibuat", Toast.LENGTH_SHORT).show()
            onBookingSuccess(orderId)
        }
    }
    LaunchedEffect(state.error) {
        state.error?.let { error ->
            Toast.makeText(context, error, Toast.LENGTH_LONG).show()
            viewModel.clearError()
        }
    }

    fun continueAggregator() {
        when {
            !state.isRouteComplete() -> Toast.makeText(context, "Pilih alamat pickup dan tujuan dulu.", Toast.LENGTH_SHORT).show()
            !state.isPackageReady() -> Toast.makeText(context, "Lengkapi berat dan dimensi paket dulu.", Toast.LENGTH_SHORT).show()
            state.aggregatorOriginCode.isBlank() || state.aggregatorDestinationCode.isBlank() ->
                Toast.makeText(context, "Pilih area asal dan tujuan untuk mendapatkan tarif ekspedisi.", Toast.LENGTH_SHORT).show()
            state.isCalculatingRoute || state.aggregatorQuoteLoading ->
                Toast.makeText(context, "Tarif ekspedisi sedang dihitung.", Toast.LENGTH_SHORT).show()
            state.selectedPrice() == null ->
                Toast.makeText(context, "Pilih tipe servis ekspedisi.", Toast.LENGTH_SHORT).show()
            !state.isRecipientReady() ->
                Toast.makeText(context, "Lengkapi data penerima dan isi paket.", Toast.LENGTH_SHORT).show()
            else -> showReviewSheet = true
        }
    }

    Scaffold(
        containerColor = CustomerHomeCanvas,
        topBar = {
            TembusAppBar(
                title = "Kirim Paket & Pilihan Ekspedisi",
                navigationIcon = {
                    IconButton(onClick = onBackClick, modifier = Modifier.criticalAction("Kembali dari pilih ekspedisi")) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
                actions = {
                    TextButton(
                        onClick = onHelpClick,
                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    ) {
                        Text("Bantuan", color = Primary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            )
        },
        bottomBar = { AggregatorCheckoutBar(state = state, onContinue = ::continueAggregator) }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(top = 8.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item { AggregatorIntroBanner() }
            item {
                AggregatorPickupLocationCard(
                    state = state,
                    onPickupClick = { showPickupSheet = true },
                )
            }
            item {
                AggregatorDestinationCard(
                    state = state,
                    onDestinationClick = { showDestinationSheet = true },
                    onRequestLocationClick = { showLocationRequestSheet = true },
                )
            }
            item {
                AggregatorProviderStep(
                    state = state,
                    onProviderSelected = viewModel::selectAggregatorProvider,
                    onRetry = viewModel::loadAggregatorProviders
                )
            }
            item { AggregatorServiceStep(state = state, onQuoteSelected = viewModel::selectAggregatorQuote) }
            item {
                AggregatorPackageCard(
                    state = state,
                    onPackageChanged = viewModel::setCustomPackage,
                    onCategorySelected = viewModel::setPackageCategory,
                    onQuantityChange = viewModel::setPackageQuantity,
                    photos = packagePhotos,
                    onPhotosChanged = ::updatePackagePhotos,
                    insuranceEnabled = state.insuranceEnabled,
                    insurancePremiumIdr = state.selectedPrice()?.insurancePremiumIdr ?: 0,
                    onInsuranceChange = viewModel::toggleInsurance,
                    photoUploadError = state.packagePhotoUploadError,
                    onRetryPhotoUploads = viewModel::retryPackagePhotoUploads
                )
            }
            item {
                AggregatorRecipientCard(
                    state = state,
                    onNameChange = viewModel::setRecipientName,
                    onPhoneChange = viewModel::setRecipientPhone,
                    onItemChange = viewModel::setItemDescription,
                    onItemValueChange = viewModel::setItemValue,
                    onFragileChange = viewModel::setPackageFragile,
                    onProhibitedChange = viewModel::setPackageProhibited
                )
            }
            item { AggregatorPickupPolicyCard(state) }
            item { AggregatorPaymentSummary(state) }
            item { AggregatorSafetyNote() }
        }
    }

    BookingModalSheets(
        state = state,
        viewModel = viewModel,
        context = context,
        clipboardManager = clipboardManager,
        showServiceSheet = false,
        showPickupSheet = showPickupSheet,
        showDestinationSheet = showDestinationSheet,
        showLocationRequestSheet = showLocationRequestSheet,
        showReviewSheet = showReviewSheet,
        onServiceSheetDismiss = {},
        onPickupSheetDismiss = { showPickupSheet = false },
        onDestinationSheetDismiss = { showDestinationSheet = false },
        onLocationRequestSheetDismiss = { showLocationRequestSheet = false },
        onReviewSheetDismiss = { showReviewSheet = false }
    )

    if (state.isLoading) {
        Box(
            modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.16f)),
            contentAlignment = Alignment.Center
        ) {
            Card(shape = RoundedCornerShape(TembusRadius.Card)) {
                Text("Menyiapkan pengiriman...", modifier = Modifier.padding(22.dp), fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun AggregatorIntroBanner() {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(TembusRadius.Card))
            .background(Brush.horizontalGradient(listOf(Color(0xFF002B18), Color(0xFF07522F))))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Security, contentDescription = null, tint = Color(0xFF96F7B5), modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(4.dp))
            Text("Garansi Tepat Waktu", color = Color(0xFF96F7B5), fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Text("Layanan Ekspedisi & Pick-up Pintu", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold, lineHeight = 24.sp)
        Text(
            "Bandingkan ekspedisi terbaik, pilih tarif sesuai kebutuhan, dan kurir jemput paket langsung ke tempat Anda.",
            color = Color(0xFFE0EBE2),
            fontSize = 12.sp,
            lineHeight = 18.sp,
        )
    }
}

@Composable
private fun AggregatorPickupLocationCard(
    state: BookingState,
    onPickupClick: () -> Unit,
) {
    val pickupPoint = state.pickupPoint
    AggregatorCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(32.dp).clip(CircleShape).background(PrimarySoft), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.Store, contentDescription = null, tint = Primary, modifier = Modifier.size(17.dp))
                }
                Spacer(Modifier.width(8.dp))
                Column {
                    Text("LOKASI JEMPUT", color = AggregatorMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text("Titik Penjemputan", color = AggregatorInk, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                }
            }
            TextButton(
                onClick = onPickupClick,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                colors = ButtonDefaults.textButtonColors(contentColor = Primary),
                modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(PrimarySoft),
            ) {
                Icon(Icons.Default.Place, contentDescription = null, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text("Ubah Peta", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
        Surface(color = CustomerHomeCanvas, shape = RoundedCornerShape(28.dp)) {
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                AggregatorAddressValue(
                    label = pickupPoint?.label ?: state.pickupAddress.ifBlank { "Pilih titik penjemputan" },
                    address = pickupPoint?.address?.takeIf { it != pickupPoint.label } ?: state.pickupAddress,
                    selected = state.pickupAddress.isNotBlank(),
                )
                val pickupContact = listOfNotNull(
                    pickupPoint?.receiverName?.takeIf { it.isNotBlank() },
                    pickupPoint?.contactPhone?.takeIf { it.isNotBlank() },
                ).joinToString("  •  ")
                if (pickupContact.isNotBlank()) {
                    Text(pickupContact, color = AggregatorMuted, fontSize = 12.sp)
                }
            }
        }
        pickupPoint?.instruction?.takeIf { it.isNotBlank() }?.let { instruction ->
            Text("Catatan Driver / Patokan", color = AggregatorMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Surface(color = CustomerHomeCanvas, shape = RoundedCornerShape(28.dp)) {
                Text(instruction, color = AggregatorInk, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), maxLines = 2)
            }
        }
    }
}

@Composable
private fun AggregatorDestinationCard(
    state: BookingState,
    onDestinationClick: () -> Unit,
    onRequestLocationClick: () -> Unit,
) {
    val destinationPoint = state.destinationPoint
    AggregatorCard {
        AggregatorSectionHeader(Icons.Default.Place, "TUJUAN KIRIM", "Tujuan Pengantaran", "Wajib")
        AggregatorAddressValue(
            label = destinationPoint?.label ?: state.destinationAddress.ifBlank { "Pilih alamat tujuan" },
            address = destinationPoint?.address?.takeIf { it != destinationPoint.label } ?: state.destinationAddress,
            selected = state.destinationAddress.isNotBlank(),
            onClick = onDestinationClick,
        )
        Row(
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(TembusRadius.Input)).background(PrimarySoft)
                .clickable(onClick = onRequestLocationClick).padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Place, contentDescription = null, tint = Primary, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Minta lokasi tujuan dari penerima", color = Primary, fontWeight = FontWeight.Bold, fontSize = 12.sp)
            Spacer(Modifier.weight(1f))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Primary)
        }
    }
}

@Composable
private fun AggregatorAddressValue(
    label: String,
    address: String,
    selected: Boolean,
    onClick: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Default.Place, contentDescription = null, tint = Primary, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = if (selected) AggregatorInk else OutlineStrong, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            if (address.isNotBlank() && address != label) Text(address, color = AggregatorMuted, fontSize = 12.sp, maxLines = 2)
        }
        if (onClick != null) Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Ubah alamat", tint = OutlineStrong)
    }
}

@Composable
private fun AggregatorProviderStep(state: BookingState, onProviderSelected: (String) -> Unit, onRetry: () -> Unit) {
    AggregatorCard {
        AggregatorSectionHeader(
            Icons.Default.LocalShipping,
            "LANGKAH 1",
            "Pilih Ekspedisi",
            "${state.aggregatorProviders.count { it.available }} aktif"
        )
        if (state.aggregatorProviders.isEmpty()) {
            AggregatorInlineState(state.aggregatorError ?: "Memuat provider dari server...", state.aggregatorError != null, onRetry)
        } else {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(end = 4.dp)) {
                items(items = state.aggregatorProviders, key = { provider: LogisticsProviderOption -> provider.code }) { provider ->
                    AggregatorProviderOptionCard(provider, provider.code == state.aggregatorProvider) { onProviderSelected(provider.code) }
                }
            }
        }
    }
}

@Composable
private fun AggregatorProviderOptionCard(provider: LogisticsProviderOption, selected: Boolean, onClick: () -> Unit) {
    val selectable = provider.available && provider.capabilities.any { it.equals("tariff", ignoreCase = true) }
    val badge = provider.customerBadge?.trim().orEmpty()
    val serviceLabel = provider.customerServiceLabel?.trim().orEmpty()
    val ratingLabel = provider.customerRatingLabel?.trim().orEmpty()
    Column(
        modifier = Modifier.width(102.dp).height(102.dp).clip(RoundedCornerShape(24.dp))
            .background(if (selected) PrimarySoft else Background)
            .border(BorderStroke(if (selected) 1.5.dp else 1.dp, if (selected) Primary else Outline), RoundedCornerShape(24.dp))
            .clickable(enabled = selectable, onClick = onClick).padding(horizontal = 10.dp, vertical = 9.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            if (badge.isNotBlank()) {
                Box(
                    Modifier.weight(1f).clip(RoundedCornerShape(999.dp))
                        .background(if (selected) Primary else SurfaceVariant)
                        .padding(horizontal = 6.dp, vertical = 3.dp)
                ) {
                    Text(
                        badge,
                        color = if (selected) Color.White else AggregatorMuted,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Black,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            } else {
                Spacer(Modifier.weight(1f))
            }
            if (selected) {
                Spacer(Modifier.width(4.dp))
                Icon(Icons.Default.CheckCircle, contentDescription = "Provider terpilih", tint = Primary, modifier = Modifier.size(16.dp))
            }
        }
        Text(
            provider.name.ifBlank { provider.code.uppercase() },
            color = AggregatorInk,
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
        if (provider.available && provider.customerRating != null) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Star, contentDescription = null, tint = AggregatorStepAccent, modifier = Modifier.size(12.dp))
                Spacer(Modifier.width(2.dp))
                Text(
                    String.format(Locale.US, "%.1f", provider.customerRating),
                    color = AggregatorMuted,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                )
                if (ratingLabel.isNotBlank()) {
                    Text(" · $ratingLabel", color = AggregatorMuted, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        } else if (!provider.available) {
            Text("Belum tersedia", color = AggregatorStepAccent, fontSize = 8.sp, maxLines = 1)
        }
        if (provider.available && serviceLabel.isNotBlank()) {
            Text(
                serviceLabel,
                color = AggregatorMuted,
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun AggregatorServiceStep(state: BookingState, onQuoteSelected: (String) -> Unit) {
    val providerName = state.aggregatorProviders.firstOrNull { it.code == state.aggregatorProvider }?.name
        ?: state.aggregatorProvider.uppercase().ifBlank { "provider" }
    AggregatorCard {
        AggregatorSectionHeader(Icons.Default.AccessTime, "LANGKAH 2", "Pilih Tipe Servis Ekspedisi", providerName)
        when {
            state.aggregatorQuotes.isNotEmpty() -> state.aggregatorQuotes.forEach { quote ->
                AggregatorQuoteOption(
                    quote = quote,
                    selected = quote.quoteId == state.aggregatorSelectedQuoteId,
                    chargeableWeight = state.priceBreakdowns[quote.quoteId]?.chargeableWeightKg ?: 0.0,
                    onClick = { onQuoteSelected(quote.quoteId) }
                )
            }
            state.aggregatorQuoteLoading -> AggregatorInlineState("Mengambil tipe servis dan tarif dari provider...", false, null)
            state.aggregatorError != null -> AggregatorInlineState(state.aggregatorError, true, null)
            else -> AggregatorInlineState("Pilih alamat, area, dan detail muatan untuk melihat servis provider.", false, null)
        }
    }
}

@Composable
private fun AggregatorQuoteOption(
    quote: com.tembus.customer.data.model.AggregatorTariffService,
    selected: Boolean,
    chargeableWeight: Double,
    onClick: () -> Unit
) {
    val serviceLabel = quote.serviceName.ifBlank { quote.serviceCode.ifBlank { "Servis provider" } }
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 100.dp).clip(RoundedCornerShape(999.dp))
            .background(if (selected) PrimarySoft else Background)
            .border(BorderStroke(if (selected) 1.5.dp else 1.dp, if (selected) Primary else Color.Transparent), RoundedCornerShape(999.dp))
            .clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(24.dp).clip(CircleShape).background(if (selected) Primary else AggregatorMuted.copy(alpha = 0.18f)), contentAlignment = Alignment.Center) {
            if (selected) Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(17.dp))
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(serviceLabel, color = AggregatorInk, fontSize = 16.sp, fontWeight = FontWeight.Black, maxLines = 2, modifier = Modifier.weight(1f))
                val badge = quote.displayBadge?.takeIf { it.isNotBlank() }
                if (badge != null) {
                    Box(
                        Modifier.clip(RoundedCornerShape(999.dp)).background(if (selected) PrimarySoft else AccentSoft)
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(badge, color = if (selected) Primary else AggregatorStepAccent, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                }
            }
            Text(if (quote.etd.isBlank()) "Estimasi dari provider" else "Estimasi tiba ${quote.etd}", color = AggregatorMuted, fontSize = 13.sp, maxLines = 2)
            val description = quote.displayDescription?.takeIf { it.isNotBlank() }
            if (description != null) {
                Text(description, color = AggregatorMuted, fontSize = 12.sp, maxLines = 2)
            } else if (chargeableWeight > 0.0) {
                Text("Berat tagihan ${formatWeightKg(chargeableWeight)} kg", color = AggregatorMuted, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.width(8.dp))
        Text(formatRupiah(quote.customerTariffIdr), color = Primary, fontSize = 20.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun AggregatorPackageCard(
    state: BookingState,
    onPackageChanged: (String, String, String, String) -> Unit,
    onCategorySelected: (String) -> Unit,
    onQuantityChange: (String) -> Unit,
    photos: List<LocalAggregatorPackagePhoto>,
    onPhotosChanged: (List<LocalAggregatorPackagePhoto>) -> Unit,
    insuranceEnabled: Boolean,
    insurancePremiumIdr: Long,
    onInsuranceChange: (Boolean) -> Unit,
    photoUploadError: String?,
    onRetryPhotoUploads: () -> Unit
) {
    var weight by rememberSaveable { mutableStateOf(if (state.packageWeight > 0) formatWeightKg(state.packageWeight) else "") }
    var length by rememberSaveable { mutableStateOf(state.packageLength.takeIf { it > 0 }?.toString().orEmpty()) }
    var width by rememberSaveable { mutableStateOf(state.packageWidth.takeIf { it > 0 }?.toString().orEmpty()) }
    var height by rememberSaveable { mutableStateOf(state.packageHeight.takeIf { it > 0 }?.toString().orEmpty()) }
    AggregatorCard {
        AggregatorSectionHeader(
            Icons.Default.Inventory2,
            "MUATAN",
            "Spesifikasi Paket",
            state.services.firstOrNull()?.maxWeightKg?.takeIf { it > 0 }?.let { "Maks ${formatWeightKg(it)} kg" } ?: "Sesuai provider"
        )
        Text("Kategori Barang", color = AggregatorMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        if (state.aggregatorPackageCategories.isNotEmpty()) {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(end = 4.dp)) {
                items(items = state.aggregatorPackageCategories, key = { category: com.tembus.customer.data.model.AggregatorPackageCategory -> category.code }) { category ->
                    val selected = state.packageCategory == category.code
                    Box(
                        modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(if (selected) Primary else SurfaceVariant)
                            .border(BorderStroke(1.dp, if (selected) Primary else Outline), RoundedCornerShape(999.dp))
                            .clickable { onCategorySelected(category.code) }.padding(horizontal = 12.dp, vertical = 9.dp)
                    ) {
                        Text(category.label, color = if (selected) Color.White else AggregatorInk, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        } else {
            AggregatorInlineState(
                state.aggregatorPackageCategoriesError ?: "Memuat kategori paket dari CMS...",
                state.aggregatorPackageCategoriesError != null,
                null
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                AggregatorNumberField("Berat (kg)", weight, Modifier.fillMaxWidth(), KeyboardType.Decimal) { weight = it; onPackageChanged(weight, length, width, height) }
                Text("Jumlah koli/paket", color = AggregatorMuted, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Row(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(TembusRadius.Input)).background(SurfaceVariant)
                        .border(BorderStroke(1.dp, Outline), RoundedCornerShape(TembusRadius.Input)).padding(horizontal = 4.dp, vertical = 3.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    IconButton(
                        onClick = { onQuantityChange((state.packageQuantity - 1).coerceAtLeast(1).toString()) },
                        enabled = state.packageQuantity > 1,
                        modifier = Modifier.size(34.dp)
                    ) { Icon(Icons.Default.Remove, contentDescription = "Kurangi jumlah", tint = if (state.packageQuantity > 1) Primary else AggregatorMuted) }
                    Text(state.packageQuantity.toString(), color = AggregatorInk, fontSize = 16.sp, fontWeight = FontWeight.Black)
                    IconButton(
                        onClick = { onQuantityChange((state.packageQuantity + 1).coerceAtMost(100).toString()) },
                        enabled = state.packageQuantity < 100,
                        modifier = Modifier.size(34.dp)
                    ) { Icon(Icons.Default.Add, contentDescription = "Tambah jumlah", tint = Primary) }
                }
            }
            AggregatorPackagePhotoPicker(
                photos = photos,
                onPhotosChanged = onPhotosChanged,
                modifier = Modifier.weight(1f)
            )
        }
        Text("Ukuran paket untuk perhitungan quote", color = AggregatorMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            AggregatorNumberField("Panjang (cm)", length, Modifier.weight(1f), KeyboardType.Number) { length = it; onPackageChanged(weight, length, width, height) }
            AggregatorNumberField("Lebar (cm)", width, Modifier.weight(1f), KeyboardType.Number) { width = it; onPackageChanged(weight, length, width, height) }
            AggregatorNumberField("Tinggi (cm)", height, Modifier.weight(1f), KeyboardType.Number) { height = it; onPackageChanged(weight, length, width, height) }
        }
        photoUploadError?.let { error -> AggregatorInlineState(error, true, onRetryPhotoUploads) }
        AggregatorInsuranceOption(
            enabled = insuranceEnabled,
            premiumIdr = insurancePremiumIdr,
            onEnabledChange = onInsuranceChange
        )
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(TembusRadius.Input)).background(if (state.isPackageReady()) PrimarySoft else SurfaceVariant).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Inventory2, contentDescription = null, tint = Primary, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(if (state.isPackageReady()) "Berat dan dimensi siap dihitung provider" else "Lengkapi berat dan dimensi paket", color = AggregatorInk, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun AggregatorPackagePhotoPicker(
    photos: List<LocalAggregatorPackagePhoto>,
    onPhotosChanged: (List<LocalAggregatorPackagePhoto>) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    var cameraError by remember { mutableStateOf<String?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { captured ->
        val uri = pendingCameraUri
        pendingCameraUri = null
        if (captured && uri != null) {
            val mimeType = context.contentResolver.getType(uri) ?: "image/jpeg"
            onPhotosChanged(photos + LocalAggregatorPackagePhoto(uri, mimeType))
            cameraError = null
        } else if (uri != null) {
            context.contentResolver.delete(uri, null, null)
            cameraError = "Foto dari kamera belum tersimpan. Coba lagi."
        }
    }
    fun launchCamera() {
        val uri = createCameraCaptureUri(context, "tembus-package")
        if (uri == null) {
            cameraError = "Kamera belum dapat disiapkan. Coba lagi."
            return
        }
        pendingCameraUri = uri
        cameraLauncher.launch(uri)
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchCamera() else cameraError = "Izin kamera diperlukan untuk mengambil foto paket."
    }

    fun requestCamera() {
        if (photos.size >= 3) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            launchCamera()
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Foto Paket (Opsional)", color = AggregatorInk, fontSize = 11.sp, fontWeight = FontWeight.Black)
                Text("Bantu driver mengenali paket", color = AggregatorMuted, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Text("${photos.size}/3", color = AggregatorMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        Surface(
            onClick = ::requestCamera,
            enabled = photos.size < 3,
            color = SurfaceVariant,
            shape = RoundedCornerShape(24.dp),
            border = BorderStroke(1.dp, Outline),
            modifier = Modifier.fillMaxWidth().heightIn(min = 92.dp),
        ) {
            if (photos.isEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Box(Modifier.size(48.dp).clip(CircleShape).background(PrimarySoft), contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null, tint = Primary, modifier = Modifier.size(21.dp))
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Ambil dari kamera", color = Primary, fontSize = 10.sp, fontWeight = FontWeight.Black)
                        Text("Maks. 3 foto · 5 MB/foto", color = AggregatorMuted, fontSize = 8.sp, maxLines = 2)
                    }
                }
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(7.dp),
                ) {
                    Box(Modifier.size(58.dp)) {
                        AsyncImage(
                            model = photos.first().uri,
                            contentDescription = "Foto paket",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize().clip(CircleShape),
                        )
                        IconButton(
                            onClick = { onPhotosChanged(photos.drop(1)) },
                            modifier = Modifier.align(Alignment.TopEnd).size(22.dp)
                                .background(MaterialTheme.colorScheme.scrim.copy(alpha = 0.7f), CircleShape),
                        ) {
                            Icon(Icons.Default.Close, contentDescription = "Hapus foto paket", tint = Color.White, modifier = Modifier.size(13.dp))
                        }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Foto terpasang", color = AggregatorInk, fontSize = 10.sp, fontWeight = FontWeight.Black)
                        Text("Bantu driver mengenali paket", color = AggregatorMuted, fontSize = 8.sp, maxLines = 2)
                        Text(if (photos.size < 3) "Tambah dari kamera" else "Maksimal 3 foto", color = Primary, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
        cameraError?.let { message ->
            Text(message, color = MaterialTheme.colorScheme.error, fontSize = 10.sp)
        }
    }
}

private data class LocalAggregatorPackagePhoto(val uri: Uri, val mimeType: String)

private fun prepareAggregatorPackagePhotoUploads(
    context: Context,
    photos: List<LocalAggregatorPackagePhoto>
): Result<List<PackagePhotoUploadPayload>> = runCatching {
    photos.mapIndexed { index, photo ->
        val bytes = context.contentResolver.openInputStream(photo.uri)?.use { it.readBytes() }
            ?: error("Foto paket ke-${index + 1} tidak dapat dibaca")
        if (bytes.isEmpty()) error("Foto paket ke-${index + 1} kosong")
        if (bytes.size > 5 * 1024 * 1024) error("Foto paket ke-${index + 1} melebihi batas 5 MB")
        if (!photo.mimeType.startsWith("image/")) error("Format foto paket ke-${index + 1} tidak didukung")
        PackagePhotoUploadPayload(bytes, photo.mimeType, "package-${index + 1}.jpg")
    }
}

@Composable
private fun AggregatorNumberField(label: String, value: String, modifier: Modifier, keyboardType: KeyboardType, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = { next -> onValueChange(next.filter { it.isDigit() || (keyboardType == KeyboardType.Decimal && it == '.') }) },
        modifier = modifier,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        shape = RoundedCornerShape(TembusRadius.Input),
        colors = tembusLightTextFieldColors()
    )
}

@Composable
private fun AggregatorInsuranceOption(
    enabled: Boolean,
    premiumIdr: Long,
    onEnabledChange: (Boolean) -> Unit
) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(TembusRadius.Input))
            .background(if (enabled) PrimarySoft else Background)
            .border(BorderStroke(1.dp, if (enabled) Primary else Outline), RoundedCornerShape(TembusRadius.Input))
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.Security, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text("Proteksi Nilai Barang (Asuransi)", color = AggregatorInk, fontSize = 12.sp, fontWeight = FontWeight.Black)
            Text(
                when {
                    premiumIdr > 0 -> "Premi ${formatRupiah(premiumIdr)} dari quote server"
                    enabled -> "Premi sedang dihitung oleh server"
                    else -> "Opsional · mengikuti nilai barang"
                },
                color = AggregatorMuted,
                fontSize = 10.sp
            )
        }
        Switch(checked = enabled, onCheckedChange = onEnabledChange)
    }
}

@Composable
private fun AggregatorPickupPolicyCard(state: BookingState) {
    AggregatorCard {
        AggregatorSectionHeader(Icons.Default.AccessTime, "KESIAPAN", "Waktu Penjemputan", if (state.scheduleType == "now") "Instan" else "Terjadwal")
        AggregatorPolicyOption("Jemput Sekarang", "Permintaan diteruskan setelah pembayaran dikonfirmasi.", state.scheduleType == "now")
        AggregatorPolicyOption("Jadwalkan Penjemputan", "Jadwal mengikuti slot yang tersedia dari provider.", state.scheduleType == "scheduled")
    }
}

@Composable
private fun AggregatorPolicyOption(title: String, body: String, selected: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(TembusRadius.Input)).background(if (selected) PrimarySoft else Background)
            .border(BorderStroke(1.dp, if (selected) Primary else Outline), RoundedCornerShape(TembusRadius.Input)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(if (selected) Primary else SurfaceVariant), contentAlignment = Alignment.Center) {
            if (selected) Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
        }
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = AggregatorInk, fontSize = 12.sp, fontWeight = FontWeight.Black)
            Text(body, color = AggregatorMuted, fontSize = 10.sp, lineHeight = 14.sp)
        }
    }
}

@Composable
private fun AggregatorPaymentSummary(state: BookingState) {
    val price = state.selectedPrice()
    AggregatorCard {
        AggregatorSectionHeader(Icons.Default.Security, "PEMBAYARAN", "Rincian Pembayaran", "Tarif server")
        if (price == null) {
            Text("Total akan tampil setelah tipe servis ekspedisi dipilih.", color = AggregatorMuted, fontSize = 12.sp)
        } else {
            AggregatorPriceRow("Ongkir provider", formatPrice(price), false)
            if (price.insurancePremiumIdr > 0) AggregatorPriceRow("Proteksi paket", formatRupiah(price.insurancePremiumIdr), false)
            HorizontalDivider(color = Outline)
            AggregatorPriceRow("Total tagihan", formatPrice(price), true)
            Text("Harga dan masa berlaku quote ditentukan oleh server.", color = AggregatorMuted, fontSize = 10.sp)
        }
    }
}

@Composable
private fun AggregatorPriceRow(label: String, value: String, emphasized: Boolean) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = if (emphasized) AggregatorInk else AggregatorMuted, fontSize = if (emphasized) 14.sp else 12.sp, fontWeight = if (emphasized) FontWeight.Black else FontWeight.Normal)
        Text(value, color = if (emphasized) Primary else AggregatorInk, fontSize = if (emphasized) 16.sp else 12.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun AggregatorSafetyNote() {
    Row(Modifier.padding(horizontal = 20.dp).fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Icon(Icons.Default.Security, contentDescription = null, tint = Primary, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(8.dp))
        Text("Dengan melanjutkan, kamu menyetujui detail paket dan ketentuan layanan provider yang dipilih.", color = AggregatorMuted, fontSize = 10.sp, lineHeight = 15.sp)
    }
}

@Composable
private fun AggregatorRecipientCard(
    state: BookingState,
    onNameChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onItemChange: (String) -> Unit,
    onItemValueChange: (String) -> Unit,
    onFragileChange: (Boolean) -> Unit,
    onProhibitedChange: (Boolean) -> Unit
) {
    AggregatorCard {
        AggregatorSectionHeader(Icons.Default.Person, "PENERIMA", "Detail penerima", "Wajib")
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = state.recipientName,
                onValueChange = onNameChange,
                modifier = Modifier.weight(1.1f),
                label = { Text("Nama penerima") },
                singleLine = true,
                shape = RoundedCornerShape(TembusRadius.Input),
                colors = tembusLightTextFieldColors()
            )
            OutlinedTextField(
                value = state.recipientPhone,
                onValueChange = onPhoneChange,
                modifier = Modifier.weight(0.9f),
                label = { Text("No. HP") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                shape = RoundedCornerShape(TembusRadius.Input),
                colors = tembusLightTextFieldColors()
            )
        }
        OutlinedTextField(
            value = state.itemDescription,
            onValueChange = onItemChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Catatan isi paket") },
            singleLine = true,
            leadingIcon = { Icon(Icons.Default.EditNote, contentDescription = null, tint = Primary) },
            shape = RoundedCornerShape(TembusRadius.Input),
            colors = tembusLightTextFieldColors()
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = if (state.itemValue == 0L) "" else state.itemValue.toString(),
                onValueChange = onItemValueChange,
                modifier = Modifier.weight(1f),
                label = { Text("Nilai barang (opsional)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                shape = RoundedCornerShape(TembusRadius.Input),
                colors = tembusLightTextFieldColors()
            )
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Checkbox(checked = state.packageIsFragile, onCheckedChange = onFragileChange)
                    Text("Rapuh", color = AggregatorMuted, fontSize = 11.sp)
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Checkbox(checked = state.packageIsProhibited, onCheckedChange = onProhibitedChange)
                    Text("Terlarang", color = AggregatorMuted, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun AggregatorCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, Outline)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
    }
}

@Composable
private fun AggregatorSectionHeader(icon: ImageVector, eyebrow: String, title: String, trailing: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(AccentSoft), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = AggregatorStepAccent, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(eyebrow, color = AggregatorStepAccent, fontSize = 9.sp, fontWeight = FontWeight.Black)
            Text(title, color = AggregatorInk, fontSize = 17.sp, fontWeight = FontWeight.Black)
        }
        Text(trailing, color = AggregatorMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 2)
    }
}

@Composable
private fun AggregatorAddressRow(icon: ImageVector, label: String, value: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(TembusRadius.Input)).clickable(onClick = onClick).padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(PrimarySoft), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(18.dp))
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = AggregatorMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text(value, color = if (selected) AggregatorInk else OutlineStrong, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 2)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = OutlineStrong)
    }
}

@Composable
private fun AggregatorRouteConnector() {
    Box(Modifier.padding(start = 17.dp).height(12.dp).width(2.dp).background(Outline))
}

@Composable
private fun AggregatorInlineState(message: String, isError: Boolean, onRetry: (() -> Unit)?) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(TembusRadius.Input)).background(if (isError) AccentSoft else SurfaceVariant).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(if (isError) Icons.Default.Warning else Icons.Default.AccessTime, contentDescription = null, tint = if (isError) AggregatorStepAccent else Primary, modifier = Modifier.size(17.dp))
        Spacer(Modifier.width(8.dp))
        Text(message, color = AggregatorInk, fontSize = 11.sp, modifier = Modifier.weight(1f))
        if (onRetry != null) TextButton(onClick = onRetry) { Text("Coba lagi", color = Primary, fontWeight = FontWeight.Bold) }
    }
}

@Composable
private fun AggregatorCheckoutBar(state: BookingState, onContinue: () -> Unit) {
    val price = state.selectedPrice()
    val enabled = state.isRouteComplete() && state.isPackageReady() && price != null && !state.isLoading && !state.isCalculatingRoute
    Column(
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(topStart = TembusRadius.Sheet, topEnd = TembusRadius.Sheet))
            .background(MaterialTheme.colorScheme.surface).windowInsetsPadding(WindowInsets.navigationBars).padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Total pembayaran", color = AggregatorMuted, fontSize = 10.sp)
                Text(price?.let(::formatPrice) ?: "Pilih servis ekspedisi", color = AggregatorInk, fontSize = 17.sp, fontWeight = FontWeight.Black)
            }
            Text(if (state.aggregatorQuoteLoading) "Menghitung…" else if (price == null) "Belum siap" else "Quote server", color = AggregatorMuted, fontSize = 10.sp)
        }
        Spacer(Modifier.height(9.dp))
        Button(
            onClick = onContinue,
            enabled = enabled,
            modifier = Modifier.fillMaxWidth().height(52.dp).criticalAction("Review dan lanjutkan pembayaran aggregator"),
            shape = RoundedCornerShape(TembusRadius.Button),
            colors = ButtonDefaults.buttonColors(containerColor = OrangeCta, contentColor = OnOrangeCta, disabledContainerColor = Outline)
        ) {
            Text(if (price == null) "Pilih tipe servis" else "Konfirmasi & lanjut pembayaran", fontWeight = FontWeight.Black)
            Spacer(Modifier.width(7.dp))
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null)
        }
    }
}
