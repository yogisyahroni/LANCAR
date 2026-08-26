package com.tembus.courier.ui.screens.order


import android.app.Activity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.location.Geocoder
import android.location.Location
import android.net.Uri
import android.view.WindowManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.Message
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.tembus.courier.ui.components.maps.CameraPosition
import com.tembus.courier.ui.components.maps.LatLng
import com.tembus.courier.ui.components.maps.RuntimeMap
import com.tembus.courier.ui.components.maps.MapUiSettings
import com.tembus.courier.ui.components.maps.MapMarker
import com.tembus.courier.ui.components.maps.MarkerState
import com.tembus.courier.ui.components.maps.MapPolyline
import com.tembus.courier.ui.components.maps.rememberCameraPositionState
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.CancelPickupReason
import com.tembus.courier.data.model.OrderStatusTransition
import com.tembus.courier.data.model.isMaintenanceService
import com.tembus.courier.BuildConfig
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.estimatedNetEarningsIdr
import com.tembus.courier.data.model.displayServiceName
import com.tembus.courier.data.model.normalizedWorkflowRole
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.domain.CourierFlowResolver
import com.tembus.courier.domain.CourierFlowState
import com.tembus.courier.domain.CourierNextActionType
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import com.tembus.courier.ui.theme.AccentDark
import com.tembus.courier.ui.theme.DarkAccentLight
import com.tembus.courier.ui.theme.DarkSurface
import com.tembus.courier.ui.theme.DarkSurfaceVariant
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryLight
import com.tembus.courier.ui.theme.Secondary
import com.tembus.courier.ui.theme.Success
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale
import java.io.File
import java.io.FileOutputStream
import coil.compose.AsyncImage
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.draw.clip
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.ui.screens.face.FaceVerificationScreen
import com.tembus.courier.util.NavigationHelper

@Composable
internal fun DeliveryMapCard(
    order: Order,
    routePreview: CourierRoutePreview?,
    mapsProviderConfig: MapsProviderConfig
) {
    val context = LocalContext.current
    var pickupLatLng by remember(order.pickupAddress, order.pickupLatitude, order.pickupLongitude) { mutableStateOf<LatLng?>(null) }
    var dropLatLng by remember(order.dropAddress, order.dropLatitude, order.dropLongitude) { mutableStateOf<LatLng?>(null) }

    LaunchedEffect(order.pickupAddress, order.dropAddress, order.pickupLatitude, order.pickupLongitude, order.dropLatitude, order.dropLongitude) {
        pickupLatLng = when {
            order.pickupLatitude != null && order.pickupLongitude != null -> LatLng(order.pickupLatitude, order.pickupLongitude)
            order.pickupAddress.isNotBlank() -> geocodeAddress(context, order.pickupAddress)
            else -> null
        }
        dropLatLng = when {
            order.dropLatitude != null && order.dropLongitude != null -> LatLng(order.dropLatitude, order.dropLongitude)
            order.dropAddress.isNotBlank() -> geocodeAddress(context, order.dropAddress)
            else -> null
        }
    }

    val firstPoint = pickupLatLng ?: dropLatLng
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(firstPoint ?: LatLng(0.0, 0.0), 12f)
    }

    LaunchedEffect(pickupLatLng, dropLatLng) {
        val pickup = pickupLatLng
        val dropoff = dropLatLng
        val center = when {
            pickup != null && dropoff != null -> LatLng(
                (pickup.latitude + dropoff.latitude) / 2,
                (pickup.longitude + dropoff.longitude) / 2
            )
            pickup != null -> pickup
            dropoff != null -> dropoff
            else -> null
        }
        if (center != null) {
            cameraPositionState.position = CameraPosition.fromLatLngZoom(center, if (pickup != null && dropoff != null) 12f else 13.5f)
        }
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.fillMaxWidth().height(230.dp)) {
                if (firstPoint != null) {
                    val markers = buildList {
                        pickupLatLng?.let { add(RuntimeMapMarker("pickup", it, "Pickup", order.pickupAddress)) }
                        dropLatLng?.let { add(RuntimeMapMarker("dropoff", it, "Tujuan", order.dropAddress)) }
                    }
                    val encodedRoutePoints = decodeRoutePolyline(
                        routePreview?.routePolyline ?: routePreview?.routeSnapshot?.routePolyline
                    )
                    val canShowBackendFallbackLine =
                        routePreview?.fallbackReason?.isNotBlank() == true ||
                            routePreview?.routeSnapshot?.fallbackReason?.isNotBlank() == true
                    val legacyFallbackPoints = if (canShowBackendFallbackLine) {
                        routePreview?.polyline
                            ?.map { LatLng(it.latitude, it.longitude) }
                            .orEmpty()
                    } else {
                        emptyList()
                    }
                    val routePoints = when {
                        encodedRoutePoints.isNotEmpty() -> encodedRoutePoints
                        legacyFallbackPoints.isNotEmpty() -> legacyFallbackPoints
                        canShowBackendFallbackLine && pickupLatLng != null && dropLatLng != null -> listOf(pickupLatLng!!, dropLatLng!!)
                        else -> emptyList()
                    }
                    RuntimeMapRenderer(
                        providerConfig = mapsProviderConfig,
                        markers = markers,
                        routePoints = routePoints,
                        mapUiSettings = MapUiSettings(
                            zoomControlsEnabled = false,
                            myLocationButtonEnabled = false,
                            mapToolbarEnabled = false
                        ),
                        routeColor = Primary,
                        fallbackTitle = "Preview rute siap",
                        fallbackMessage = "Koordinat dan ETA mengikuti data operasional terbaru.",
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(18.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.LocationOff, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(36.dp))
                        Spacer(modifier = Modifier.height(8.dp))
                        Text("Koordinat order sedang disinkronkan", fontWeight = FontWeight.Bold)
                        Text(
                            "Peta tampil otomatis setelah titik pickup atau tujuan valid.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 2.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (order.isMaintenanceService()) {
                    Text("Lokasi Layanan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    DeliveryStop(
                        icon = Icons.Default.Build,
                        label = "Alamat",
                        value = order.pickupAddress.ifBlank { order.dropAddress }.ifBlank { "Alamat lokasi sedang disinkronkan" },
                        color = if (isSystemInDarkTheme()) DarkAccentLight else Primary
                    )
                } else {
                    Text(if (order.normalizedWorkflowRole() == "on_demand") "Rute On Demand" else "Rute Pengantaran", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                    DeliveryStop(icon = Icons.Default.Storefront, label = "Pickup", value = order.pickupAddress.ifBlank { "Alamat pickup sedang disinkronkan" }, color = if (isSystemInDarkTheme()) DarkAccentLight else Primary)
                    DeliveryStop(icon = Icons.Default.LocationOn, label = "Tujuan", value = order.dropAddress.ifBlank { "Alamat tujuan sedang disinkronkan" }, color = Secondary)
                }
            }
        }
    }
}

