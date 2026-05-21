package com.lancar.customer.ui.components.maps

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
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
import com.lancar.customer.BuildConfig
import com.lancar.customer.data.model.MapsProviderConfig
import kotlin.math.PI
import kotlin.math.atan
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sinh
import kotlin.math.tan

data class RuntimeMapMarker(
    val id: String,
    val position: LatLng,
    val title: String,
    val snippet: String? = null
)

private data class RuntimeMapViewport(
    val center: LatLng,
    val zoom: Int
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
    fallbackTitle: String = "Peta belum tersedia",
    fallbackMessage: String = "Tracking tetap berjalan. Admin dapat mengaktifkan Google Maps atau OpenStreetMap tanpa install ulang aplikasi.",
    onMapClick: ((LatLng) -> Unit)? = null
) {
    val validMarkers = remember(markers) { markers.filter { it.position.isValidLatLng() } }
    val validRoutePoints = remember(routePoints) { routePoints.filter { it.isValidLatLng() } }
    val viewport = remember(validMarkers, validRoutePoints, followLocation) {
        resolveViewport(
            markers = validMarkers,
            routePoints = validRoutePoints,
            followLocation = followLocation
        )
    }

    when {
        providerConfig.activeProvider == "google_maps" -> {
            val cameraPositionState = rememberCameraPositionState {
                position = CameraPosition.fromLatLngZoom(viewport.center, viewport.zoom.toFloat())
            }
            LaunchedEffect(viewport.center.latitude, viewport.center.longitude, viewport.zoom) {
                cameraPositionState.animate(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.fromLatLngZoom(viewport.center, viewport.zoom.toFloat())
                    ),
                    800
                )
            }
            GoogleMap(
                modifier = modifier,
                cameraPositionState = cameraPositionState,
                properties = googleProperties,
                uiSettings = googleUiSettings,
                onMapClick = { point -> onMapClick?.invoke(point) }
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

        providerConfig.activeProvider == "openstreetmap" && providerConfig.enabled -> {
            OpenStreetMapTileRenderer(
                providerConfig = providerConfig,
                markers = validMarkers,
                routePoints = validRoutePoints,
                viewport = viewport,
                modifier = modifier,
                routeColor = routeColor,
                onMapClick = onMapClick
            )
        }

        else -> {
            RuntimeMapFallback(
                title = fallbackTitle,
                message = providerConfig.reason?.replace("_", " ") ?: fallbackMessage,
                provider = providerConfig.activeProvider,
                center = viewport.center,
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
    viewport: RuntimeMapViewport,
    modifier: Modifier,
    routeColor: Color,
    onMapClick: ((LatLng) -> Unit)?
) {
    val tileTemplate = remember(providerConfig.openStreetMap.tileUrlTemplate) {
        normalizeOpenStreetMapTileTemplate(providerConfig.openStreetMap.tileUrlTemplate)
    }
    val attribution = providerConfig.openStreetMap.attribution
        ?: "© OpenStreetMap contributors"
    val zoom = viewport.zoom
    val centerTile = remember(viewport.center.latitude, viewport.center.longitude, zoom) {
        viewport.center.toOsmTileCoordinate(zoom)
    }

    BoxWithConstraints(
        modifier = modifier
            .background(Color(0xFFEAF3FF))
            .pointerInput(centerTile.x, centerTile.y, zoom, onMapClick) {
                detectTapGestures { tap ->
                    onMapClick?.invoke(tap.toLatLng(centerTile, size.width.toFloat(), size.height.toFloat(), zoom))
                }
            }
    ) {
        val widthPx = constraints.maxWidth.toFloat()
        val heightPx = constraints.maxHeight.toFloat()
        val baseTileX = floor(centerTile.x).toInt()
        val baseTileY = floor(centerTile.y).toInt()
        val tileSpanX = (widthPx / OsmTileSizePx).roundToInt().coerceAtLeast(2) + 3
        val tileSpanY = (heightPx / OsmTileSizePx).roundToInt().coerceAtLeast(2) + 3

        for (dx in (-tileSpanX / 2)..(tileSpanX / 2)) {
            for (dy in (-tileSpanY / 2)..(tileSpanY / 2)) {
                val tileX = baseTileX + dx
                val tileY = baseTileY + dy
                if (!isValidOsmTileY(tileY, zoom)) continue
                val left = widthPx / 2f + (tileX - centerTile.x) * OsmTileSizePx
                val top = heightPx / 2f + (tileY - centerTile.y) * OsmTileSizePx
                AsyncImage(
                    model = tileTemplate.toOsmTileUrl(tileX, tileY, zoom),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(256.dp)
                        .offset { IntOffset(left.roundToInt(), top.roundToInt()) }
                )
            }
        }

        if (routePoints.size > 1) {
            Canvas(Modifier.fillMaxSize()) {
                val path = Path()
                routePoints.forEachIndexed { index, point ->
                    val projected = point.toOsmTileCoordinate(zoom)
                    val x = (widthPx / 2f + (projected.x - centerTile.x) * OsmTileSizePx).toFloat()
                    val y = (heightPx / 2f + (projected.y - centerTile.y) * OsmTileSizePx).toFloat()
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
            val left = widthPx / 2f + (projected.x - centerTile.x) * OsmTileSizePx
            val top = heightPx / 2f + (projected.y - centerTile.y) * OsmTileSizePx
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
    }
}

@Composable
private fun RuntimeMapFallback(
    title: String,
    message: String,
    provider: String,
    center: LatLng,
    modifier: Modifier = Modifier
) {
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
                    "Provider: ${provider.ifBlank { "disabled" }} • ${"%.5f".format(center.latitude)}, ${"%.5f".format(center.longitude)}",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color(0xFF6B7280)
                )
            }
        }
    }
}

private fun LatLng.isValidLatLng(): Boolean {
    return latitude in -90.0..90.0 && longitude in -180.0..180.0 && !(latitude == 0.0 && longitude == 0.0)
}

private fun resolveViewport(
    markers: List<RuntimeMapMarker>,
    routePoints: List<LatLng>,
    followLocation: LatLng?
): RuntimeMapViewport {
    val allPoints = (routePoints + markers.map { it.position })
        .filter { it.isValidLatLng() }
        .distinctBy { point -> "${"%.6f".format(point.latitude)}:${"%.6f".format(point.longitude)}" }

    if (allPoints.size >= 2) {
        var minLatitude = allPoints.first().latitude
        var maxLatitude = allPoints.first().latitude
        var minLongitude = allPoints.first().longitude
        var maxLongitude = allPoints.first().longitude

        allPoints.forEach { point ->
            minLatitude = min(minLatitude, point.latitude)
            maxLatitude = max(maxLatitude, point.latitude)
            minLongitude = min(minLongitude, point.longitude)
            maxLongitude = max(maxLongitude, point.longitude)
        }

        val latitudeSpan = maxLatitude - minLatitude
        val longitudeSpan = maxLongitude - minLongitude
        val largestSpan = max(latitudeSpan, longitudeSpan)
        val zoom = when {
            largestSpan > 2.0 -> 8
            largestSpan > 1.0 -> 9
            largestSpan > 0.5 -> 10
            largestSpan > 0.25 -> 11
            largestSpan > 0.04 -> 12
            largestSpan > 0.02 -> 13
            largestSpan > 0.01 -> 14
            else -> 15
        }

        return RuntimeMapViewport(
            center = LatLng(
                (minLatitude + maxLatitude) / 2.0,
                (minLongitude + maxLongitude) / 2.0
            ),
            zoom = zoom
        )
    }

    return RuntimeMapViewport(
        center = when {
            followLocation?.isValidLatLng() == true -> followLocation
            allPoints.isNotEmpty() -> allPoints.first()
            else -> LatLng(-6.2088, 106.8456)
        },
        zoom = 15
    )
}

private const val OsmTileSizePx = 256f

private data class OsmTileCoordinate(val x: Double, val y: Double)

private fun LatLng.toOsmTileCoordinate(zoom: Int): OsmTileCoordinate {
    val safeLatitude = latitude.coerceIn(-85.05112878, 85.05112878)
    val scale = 2.0.pow(zoom)
    val latRad = Math.toRadians(safeLatitude)
    val x = (longitude + 180.0) / 360.0 * scale
    val y = (1.0 - ln(tan(latRad) + 1.0 / kotlin.math.cos(latRad)) / PI) / 2.0 * scale
    return OsmTileCoordinate(x, y)
}

private fun Offset.toLatLng(centerTile: OsmTileCoordinate, widthPx: Float, heightPx: Float, zoom: Int): LatLng {
    val worldX = centerTile.x + (x - widthPx / 2f) / OsmTileSizePx
    val worldY = centerTile.y + (y - heightPx / 2f) / OsmTileSizePx
    return osmTileToLatLng(worldX, worldY, zoom)
}

private fun osmTileToLatLng(tileX: Double, tileY: Double, zoom: Int): LatLng {
    val scale = 2.0.pow(zoom)
    val longitude = tileX / scale * 360.0 - 180.0
    val latitude = Math.toDegrees(atan(sinh(PI * (1 - 2 * tileY / scale))))
    return LatLng(latitude.coerceIn(-85.05112878, 85.05112878), longitude.coerceIn(-180.0, 180.0))
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
