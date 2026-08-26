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
internal fun BookingReviewSheet(
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
                .background(OutlineStrong)
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
                .clip(RoundedCornerShape(TembusRadius.Card))
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
            shape = RoundedCornerShape(TembusRadius.Button),
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
internal fun ReviewRouteSnapshotBlock(state: BookingState, price: PriceBreakdown?) {
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
            .clip(RoundedCornerShape(TembusRadius.Card))
            .border(BorderStroke(1.dp, Outline), RoundedCornerShape(TembusRadius.Card))
            .background(PrimaryPale)
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
            Surface(color = SoftGreen, shape = RoundedCornerShape(TembusRadius.Card)) {
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
                .clip(RoundedCornerShape(TembusRadius.Card))
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
internal fun ReviewRouteBlock(state: BookingState) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(TembusRadius.Card))
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
internal fun ReviewInfoRow(title: String, primary: String, secondary: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(TembusRadius.Card))
            .border(BorderStroke(1.dp, Outline), RoundedCornerShape(TembusRadius.Card))
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
