package com.tembus.courier.ui.components.maps

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapProperties
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.tembus.courier.BuildConfig
import com.tembus.courier.data.model.MapsProviderConfig
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sinh
import kotlin.math.tan
import java.util.Locale

data class RuntimeMapMarker(
    val id: String,
    val position: LatLng,
    val title: String,
    val snippet: String? = null
)

@Composable
fun RuntimeMapRenderer(
    providerConfig: MapsProviderConfig,
    markers: List<RuntimeMapMarker>,
    routePoints: List<LatLng>,
    modifier: Modifier = Modifier,
    followLocation: LatLng? = markers.firstOrNull()?.position,
    googleProperties: MapProperties = MapProperties(),
    googleUiSettings: MapUiSettings = MapUiSettings(
        zoomControlsEnabled = false,
        myLocationButtonEnabled = false,
        mapToolbarEnabled = false
    ),
    routeColor: Color = Color(0xFF0B7A53),
    fallbackTitle: String = "Peta sedang disiapkan",
    fallbackMessage: String = "Navigasi tetap memakai alamat dan koordinat order saat konfigurasi peta aktif."
) {
    val validMarkers = remember(markers) { markers.filter { it.position.isValidLatLng() } }
    val validRoutePoints = remember(routePoints) { routePoints.filter { it.isValidLatLng() } }
    val center = remember(validMarkers, validRoutePoints, followLocation) {
        when {
            followLocation?.isValidLatLng() == true -> followLocation
            validRoutePoints.isNotEmpty() -> validRoutePoints[validRoutePoints.lastIndex / 2]
            validMarkers.isNotEmpty() -> validMarkers.first().position
            else -> LatLng(-6.2088, 106.8456)
        }
    }

    when {
        providerConfig.activeProvider == "google_maps" -> {
            val cameraPositionState = rememberCameraPositionState {
                position = CameraPosition.fromLatLngZoom(center, if (validRoutePoints.size > 1) 13f else 15f)
            }
            var googleMapLoaded by remember(providerConfig.activeProvider, center.latitude, center.longitude) {
                mutableStateOf(false)
            }
            var googleMapTimedOut by remember(providerConfig.activeProvider, center.latitude, center.longitude) {
                mutableStateOf(false)
            }
            LaunchedEffect(providerConfig.activeProvider, center.latitude, center.longitude) {
                googleMapLoaded = false
                googleMapTimedOut = false
                delay(GoogleMapLoadTimeoutMs)
                if (!googleMapLoaded) {
                    googleMapTimedOut = true
                }
            }
            LaunchedEffect(center.latitude, center.longitude) {
                cameraPositionState.animate(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.fromLatLngZoom(center, cameraPositionState.position.zoom.coerceIn(12f, 17f))
                    ),
                    800
                )
            }
            if (googleMapTimedOut && providerConfig.fallbackProvider == "openstreetmap") {
                OpenStreetMapTileRenderer(
                    providerConfig = providerConfig,
                    markers = validMarkers,
                    routePoints = validRoutePoints,
                    center = center,
                    modifier = modifier,
                    routeColor = routeColor,
                    statusMessage = MapRecoveryMessage
                )
            } else if (googleMapTimedOut) {
                RuntimeMapFallback(
                    title = MapRecoveryTitle,
                    message = MapRecoveryMessage,
                    center = center,
                    modifier = modifier
                )
            } else {
                GoogleMap(
                    modifier = modifier,
                    cameraPositionState = cameraPositionState,
                    properties = googleProperties,
                    uiSettings = googleUiSettings,
                    onMapLoaded = { googleMapLoaded = true }
                ) {
                    validMarkers.forEach { marker ->
                        Marker(
                            state = MarkerState(marker.position),
                            title = marker.title,
                            snippet = marker.snippet
                        )
                    }
                    if (validRoutePoints.size > 1) {
                        Polyline(points = validRoutePoints, color = routeColor, width = 8f)
                    }
                }
            }
        }

        providerConfig.activeProvider == "openstreetmap" && providerConfig.enabled -> {
            OpenStreetMapTileRenderer(
                providerConfig = providerConfig,
                markers = validMarkers,
                routePoints = validRoutePoints,
                center = center,
                modifier = modifier,
                routeColor = routeColor,
                statusMessage = providerConfig.recoveryMessageOrNull()
            )
        }

        else -> {
            RuntimeMapFallback(
                title = providerConfig.fallbackTitleOrDefault(fallbackTitle),
                message = providerConfig.fallbackMessageOrDefault(fallbackMessage),
                center = center,
                modifier = modifier
            )
        }
    }
}

@Composable
private fun OpenStreetMapTileRenderer(
    providerConfig: MapsProviderConfig,
    markers: List<RuntimeMapMarker>,
    routePoints: List<LatLng>,
    center: LatLng,
    modifier: Modifier,
    routeColor: Color,
    statusMessage: String? = null
) {
    val tileTemplate = remember(providerConfig.openStreetMap.tileUrlTemplate) {
        normalizeOpenStreetMapTileTemplate(providerConfig.openStreetMap.tileUrlTemplate)
    }
    val attribution = providerConfig.openStreetMap.attribution
        ?: "© OpenStreetMap contributors"
    val zoom = if (routePoints.size > 1) 12 else 15
    val centerTile = remember(center.latitude, center.longitude, zoom) {
        center.toOsmTileCoordinate(zoom)
    }

    BoxWithConstraints(
        modifier = modifier.background(Color(0xFFEAF3FF))
    ) {
        val tileSizeDp = 256.dp
        val tileSizePx = with(LocalDensity.current) { tileSizeDp.toPx() }
        val widthPx = constraints.maxWidth.toFloat()
        val heightPx = constraints.maxHeight.toFloat()
        val baseTileX = floor(centerTile.x).toInt()
        val baseTileY = floor(centerTile.y).toInt()
        val tileSpanX = (widthPx / tileSizePx).roundToInt().coerceAtLeast(2) + 3
        val tileSpanY = (heightPx / tileSizePx).roundToInt().coerceAtLeast(2) + 3

        for (dx in (-tileSpanX / 2)..(tileSpanX / 2)) {
            for (dy in (-tileSpanY / 2)..(tileSpanY / 2)) {
                val tileX = baseTileX + dx
                val tileY = baseTileY + dy
                if (!isValidOsmTileY(tileY, zoom)) continue
                val left = widthPx / 2f + (tileX - centerTile.x) * tileSizePx
                val top = heightPx / 2f + (tileY - centerTile.y) * tileSizePx
                AsyncImage(
                    model = tileTemplate.toOsmTileUrl(tileX, tileY, zoom),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(tileSizeDp)
                        .offset { IntOffset(left.roundToInt(), top.roundToInt()) }
                )
            }
        }

        if (routePoints.size > 1) {
            Canvas(Modifier.fillMaxSize()) {
                val path = Path()
                routePoints.forEachIndexed { index, point ->
                    val projected = point.toOsmTileCoordinate(zoom)
                    val x = (widthPx / 2f + (projected.x - centerTile.x) * tileSizePx).toFloat()
                    val y = (heightPx / 2f + (projected.y - centerTile.y) * tileSizePx).toFloat()
                    if (index == 0) {
                        path.moveTo(x, y)
                    } else {
                        path.lineTo(x, y)
                    }
                }
                drawPath(
                    path = path,
                    color = routeColor,
                    style = Stroke(width = 7f, cap = StrokeCap.Round)
                )
            }
        }

        markers.forEach { marker ->
            val projected = marker.position.toOsmTileCoordinate(zoom)
            val left = widthPx / 2f + (projected.x - centerTile.x) * tileSizePx
            val top = heightPx / 2f + (projected.y - centerTile.y) * tileSizePx
            Box(
                modifier = Modifier
                    .offset { IntOffset(left.roundToInt() - 22, top.roundToInt() - 44) }
                    .size(44.dp),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Place,
                    contentDescription = marker.title,
                    tint = Color(0xFF0B7A53),
                    modifier = Modifier.size(44.dp)
                )
            }
        }

        Text(
            text = attribution,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .background(Color.White.copy(alpha = 0.82f))
                .padding(horizontal = 8.dp, vertical = 4.dp),
            color = Color(0xFF4B5563),
            style = MaterialTheme.typography.labelSmall
        )

        if (!statusMessage.isNullOrBlank()) {
            Card(
                modifier = Modifier
                    .align(Alignment.TopCenter)
                    .padding(14.dp)
                    .fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White.copy(alpha = 0.94f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Text(
                    text = statusMessage,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF0B3D2E)
                )
            }
        }
    }
}

@Composable
private fun RuntimeMapFallback(
    title: String,
    message: String,
    center: LatLng,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    Box(
        modifier = modifier.background(Color(0xFFEFF6FF)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .padding(20.dp)
                .fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(modifier = Modifier.padding(20.dp)) {
                Text(title, fontWeight = FontWeight.Bold, color = Color(0xFF0B3D2E))
                Spacer(modifier = Modifier.height(8.dp))
                Text(message, style = MaterialTheme.typography.bodyMedium, color = Color(0xFF4B5563))
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    "Koordinat referensi: ${String.format(Locale.US, "%.5f, %.5f", center.latitude, center.longitude)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color(0xFF6B7280)
                )
                Spacer(modifier = Modifier.height(14.dp))
                Button(
                    onClick = { openExternalMap(context, center) },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF0B7A53)),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Text("Buka Maps", fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

private fun MapsProviderConfig.recoveryMessageOrNull(): String? {
    val normalizedReason = reason?.trim()?.lowercase(Locale.US).orEmpty()
    val googleDowngraded = requestedProvider == "google_maps" && activeProvider == "openstreetmap"
    return if (
        googleDowngraded ||
        normalizedReason == "maps_provider_health_critical" ||
        normalizedReason == "google_maps_quota_near_limit" ||
        normalizedReason == "google_maps_server_key_missing"
    ) {
        MapRecoveryMessage
    } else {
        null
    }
}

private fun MapsProviderConfig.fallbackTitleOrDefault(defaultTitle: String): String =
    if (recoveryMessageOrNull() != null) MapRecoveryTitle else defaultTitle

private fun MapsProviderConfig.fallbackMessageOrDefault(defaultMessage: String): String =
    recoveryMessageOrNull() ?: defaultMessage

private fun openExternalMap(context: Context, center: LatLng) {
    val latitude = String.format(Locale.US, "%.6f", center.latitude)
    val longitude = String.format(Locale.US, "%.6f", center.longitude)
    val intent = Intent(
        Intent.ACTION_VIEW,
        Uri.parse("geo:$latitude,$longitude?q=$latitude,$longitude")
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    try {
        context.startActivity(Intent.createChooser(intent, "Buka Maps"))
    } catch (_: ActivityNotFoundException) {
        Toast.makeText(context, "Aplikasi Maps tidak tersedia di perangkat ini.", Toast.LENGTH_SHORT).show()
    }
}

private fun LatLng.isValidLatLng(): Boolean {
    return latitude in -90.0..90.0 && longitude in -180.0..180.0 && !(latitude == 0.0 && longitude == 0.0)
}

private const val GoogleMapLoadTimeoutMs = 12_000L
private const val MapRecoveryTitle = "Peta sedang dipulihkan"
private const val MapRecoveryMessage = "Peta sedang dipulihkan. Alamat dan navigasi tetap tersedia."

private data class OsmTileCoordinate(val x: Double, val y: Double)

private fun LatLng.toOsmTileCoordinate(zoom: Int): OsmTileCoordinate {
    val safeLatitude = latitude.coerceIn(-85.05112878, 85.05112878)
    val scale = 2.0.pow(zoom)
    val latRad = Math.toRadians(safeLatitude)
    val x = (longitude + 180.0) / 360.0 * scale
    val y = (1.0 - ln(tan(latRad) + 1.0 / kotlin.math.cos(latRad)) / PI) / 2.0 * scale
    return OsmTileCoordinate(x, y)
}

private fun isValidOsmTileY(tileY: Int, zoom: Int): Boolean {
    val scale = 1 shl zoom
    return tileY in 0 until scale
}

private fun String.toOsmTileUrl(tileX: Int, tileY: Int, zoom: Int): String {
    val scale = 1 shl zoom
    val wrappedX = ((tileX % scale) + scale) % scale
    return replace("{z}", zoom.toString())
        .replace("{x}", wrappedX.toString())
        .replace("{y}", tileY.toString())
}

private fun normalizeOpenStreetMapTileTemplate(rawTemplate: String?): String {
    val gatewayBase = BuildConfig.BASE_URL
        .substringBefore("/api/v1")
        .trimEnd('/')
    val gatewayProxyTemplate = "$gatewayBase/api/v1/maps/tiles/{z}/{x}/{y}.png"
    val candidate = rawTemplate?.trim().orEmpty()
    return when {
        candidate.isBlank() -> gatewayProxyTemplate
        candidate.startsWith("/") -> "$gatewayBase$candidate"
        candidate.contains("tile.openstreetmap.org", ignoreCase = true) -> gatewayProxyTemplate
        else -> candidate
    }
}
