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


@Composable
internal fun tembusLightTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedTextColor = Ink,
    unfocusedTextColor = Ink,
    disabledTextColor = Muted,
    focusedContainerColor = TembusSurface,
    unfocusedContainerColor = TembusSurface,
    disabledContainerColor = SurfaceVariant,
    cursorColor = Primary,
    focusedBorderColor = Primary,
    unfocusedBorderColor = OutlineStrong,
    disabledBorderColor = Outline,
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

internal fun BookingState.isRouteComplete(): Boolean {
    return pickupLocation != null && pickupAddress.isNotBlank() && destinationLocation != null && destinationAddress.isNotBlank()
}

internal fun BookingState.isPackageReady(): Boolean {
    return isPackageSizeSelected &&
        sizeTier.isNotBlank() &&
        packageWeight > 0.0 &&
        packageLength > 0 &&
        packageWidth > 0 &&
        packageHeight > 0
}

internal fun BookingState.selectedService(): DeliveryServiceProduct? {
    return services.firstOrNull { it.code == selectedServiceCode }
}

internal fun BookingState.selectedSizeTier(): ServiceSizeTier? {
    return services
        .flatMap { it.sizeTiers }
        .firstOrNull { it.code == sizeTier }
}

internal fun ServiceSizeTier.defaultDimensionsPayload(): DimensionsPayload {
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

internal fun PriceBreakdown.hasRoadRouteSnapshot(): Boolean {
    val snapshot = routeSnapshot
    val routePolyline = snapshot?.routePolyline?.trim().orEmpty()
    val provider = snapshot?.provider.orEmpty()
    return routePolyline.isNotBlank() &&
        decodeRoutePolyline(routePolyline).size > 1 &&
        !provider.contains("haversine", ignoreCase = true) &&
        (snapshot?.distanceKm?.takeIf { it > 0.0 } ?: distanceKm) > 0.0
}

internal fun BookingState.selectedPrice(): PriceBreakdown? {
    return priceBreakdowns[selectedServiceCode]?.takeIf { it.hasRoadRouteSnapshot() }
}

internal fun BookingState.isRecipientReady(): Boolean {
    return recipientName.trim().length >= 2 &&
        recipientPhone.trim().length >= 8 &&
        itemDescription.trim().length >= 3
}

internal fun decodeRoutePolyline(encoded: String?): List<LatLng> {
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
