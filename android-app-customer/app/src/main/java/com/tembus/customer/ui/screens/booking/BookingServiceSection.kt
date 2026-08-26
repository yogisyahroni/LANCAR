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

import com.tembus.customer.ui.screens.booking.*

@Composable
internal fun ServiceInlinePreview(
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
                    .clip(RoundedCornerShape(TembusRadius.Card))
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
internal fun SelectedServiceBar(
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
            .clip(RoundedCornerShape(topStart = TembusRadius.Sheet, topEnd = TembusRadius.Sheet))
            .background(MaterialTheme.colorScheme.surface)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(18.dp)
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .size(width = 42.dp, height = 4.dp)
                .clip(CircleShape)
                .background(OutlineStrong)
        )
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
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
            shape = RoundedCornerShape(TembusRadius.Button),
            colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = MaterialTheme.colorScheme.onPrimary)
        ) {
            Text(buttonLabel, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
            Spacer(Modifier.width(8.dp))
            Icon(Icons.Default.Navigation, null)
        }
    }
}

@Composable
internal fun ServicePickerSheet(
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
                .background(OutlineStrong)
        )
        Text("Pilih layanan TEMBUS", fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Harga final dihitung dari jarak, berat, dan fitur tambahan.", color = Muted, lineHeight = 20.sp)
        if (state.isCalculatingRoute) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = SoftGreen),
                shape = RoundedCornerShape(TembusRadius.Card)
            ) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Menghitung harga dari rute jalan", color = Ink, fontWeight = FontWeight.ExtraBold)
                    RoadPricingProgressBar(
                        trackColor = MaterialTheme.colorScheme.surface,
                        indicatorColor = LcGreen
                    )
                }
            }
        } else if (!state.isPackageReady()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = SoftBlue),
                shape = RoundedCornerShape(TembusRadius.Card)
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
                shape = RoundedCornerShape(TembusRadius.Card)
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
internal fun ServiceRow(
    service: DeliveryServiceProduct,
    price: PriceBreakdown?,
    selected: Boolean,
    onClick: () -> Unit
) {
    val selectable = price != null
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(TembusRadius.Card))
            .background(
                when {
                    selected -> SoftGreen
                    selectable -> MaterialTheme.colorScheme.surface
                    else -> SurfaceVariant
                }
            )
            .border(BorderStroke(1.dp, if (selected) LcGreen else Outline), RoundedCornerShape(TembusRadius.Card))
            .clickable(enabled = selectable) { onClick() }
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(58.dp)
                .clip(RoundedCornerShape(TembusRadius.Card))
                .background(if (selected) MaterialTheme.colorScheme.surface else SoftBlue),
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
internal fun GeocodeResultRow(
    result: MapsGeocodeResult,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(TembusRadius.Card))
            .background(FieldBg)
            .clickable { onClick() }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(TembusRadius.Card))
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
