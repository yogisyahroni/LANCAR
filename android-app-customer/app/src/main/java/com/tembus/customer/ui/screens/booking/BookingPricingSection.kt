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
internal fun RoutePreviewCard(
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
                .clip(RoundedCornerShape(TembusRadius.Card))
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
internal fun RoadPricingProgressBar(
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
internal fun RoutePricingProgressCard() {
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
internal fun RouteUnavailableCard() {
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
