package com.tembus.customer.ui.components.maps

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.widget.Toast
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import coil.compose.AsyncImage
import com.tembus.customer.ui.components.maps.MapProperties
import com.tembus.customer.ui.components.maps.MapUiSettings
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.BuildConfig
import com.tembus.customer.R
import com.tembus.customer.data.model.MapsProviderConfig
import com.tomtom.sdk.location.GeoPoint
import com.tomtom.sdk.map.display.MapOptions
import com.tomtom.sdk.map.display.TomTomMap
import com.tomtom.sdk.map.display.camera.CameraOptions
import com.tomtom.sdk.map.display.common.WidthByZoom
import com.tomtom.sdk.map.display.gesture.MapClickListener
import com.tomtom.sdk.map.display.image.ImageFactory
import com.tomtom.sdk.map.display.marker.MarkerOptions
import com.tomtom.sdk.map.display.polyline.PolylineOptions
import com.tomtom.sdk.map.display.ui.MapReadyCallback
import com.tomtom.sdk.map.display.ui.MapView
import com.tomtom.sdk.map.display.style.StandardStyles
import com.tomtom.sdk.map.display.style.StyleLoadingCallback
import com.tomtom.sdk.map.display.style.LoadingStyleFailure
import android.util.Log
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
import java.util.Locale

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
    mapProperties: MapProperties = MapProperties(),
    mapUiSettings: MapUiSettings = MapUiSettings(
        zoomControlsEnabled = false,
        myLocationButtonEnabled = false,
        mapToolbarEnabled = false
    ),
    routeColor: Color = Color(0xFF0B7A53),
    fallbackTitle: String = "Peta sedang disiapkan",
    fallbackMessage: String = "Pelacakan tetap berjalan dan akan tampil otomatis saat konfigurasi peta aktif.",
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

    val is64Bit = remember { android.os.Process.is64Bit() }

    when {
        providerConfig.activeProvider == "tomtom_maps" && hasTomTomSdkKey() && is64Bit -> {
            TomTomSdkMapRenderer(
                markers = validMarkers,
                routePoints = validRoutePoints,
                viewport = viewport,
                modifier = modifier,
                routeColor = routeColor,
                onMapClick = onMapClick,
                statusMessage = null
            )
        }

        providerConfig.activeProvider == "tomtom_maps" && hasTomTomSdkKey() && !is64Bit -> {
            RuntimeMapFallback(
                title = "Visual 3D Tidak Didukung",
                message = "Sistem perangkat ini (32-bit) tidak mendukung modul Peta 3D TomTom terbaru. Namun jangan khawatir, pencarian lokasi dan order tetap berfungsi 100% normal.",
                center = viewport.center,
                modifier = modifier
            )
        }

        providerConfig.activeProvider == "tomtom_maps" -> {
            RuntimeMapFallback(
                title = "Peta sedang disiapkan",
                message = "Visual peta belum tersedia di versi aplikasi ini. Pencarian alamat dan pelacakan tetap berjalan.",
                center = viewport.center,
                modifier = modifier
            )
        }

        providerConfig.activeProvider == "openstreetmap" && providerConfig.enabled -> {
            OpenStreetMapTileRenderer(
                providerConfig = providerConfig,
                markers = validMarkers,
                routePoints = validRoutePoints,
                viewport = viewport,
                modifier = modifier,
                routeColor = routeColor,
                onMapClick = onMapClick,
                statusMessage = providerConfig.recoveryMessageOrNull()
            )
        }

        else -> {
            RuntimeMapFallback(
                title = providerConfig.fallbackTitleOrDefault(fallbackTitle),
                message = providerConfig.fallbackMessageOrDefault(fallbackMessage),
                center = viewport.center,
                modifier = modifier
            )
        }
    }
}

@Composable
private fun TomTomSdkMapRenderer(
    markers: List<RuntimeMapMarker>,
    routePoints: List<LatLng>,
    viewport: RuntimeMapViewport,
    modifier: Modifier,
    routeColor: Color,
    onMapClick: ((LatLng) -> Unit)?,
    statusMessage: String? = null
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val clickHandlerState = rememberUpdatedState(onMapClick)
    var mapView by remember { mutableStateOf<MapView?>(null) }
    var tomTomMap by remember { mutableStateOf<TomTomMap?>(null) }
    val mapKey = remember { BuildConfig.TOMTOM_API_KEY.trim() }
    val routeColorArgb = routeColor.toArgb()

        val isDark = androidx.compose.foundation.isSystemInDarkTheme()
    Box(modifier = modifier) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                MapView(
                    viewContext,
                    MapOptions(
                        mapKey = mapKey,
                        cameraOptions = CameraOptions(
                            viewport.center.toGeoPoint(),
                            viewport.zoom.toDouble(),
                            null,
                            null,
                            null
                        )
                    )
                ).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    onCreate(null)
                    // Lifecycle is managed by DisposableEffect below.
                    // Just request the map asynchronously.
                    getMapAsync(object : MapReadyCallback {
                        override fun onMapReady(map: TomTomMap) {
                            Log.d("TomTomMap", "onMapReady triggered, loading style...")
                            map.loadStyle(
                                StandardStyles.BROWSING,
                                object : StyleLoadingCallback {
                                    override fun onSuccess() {
                                        Log.d("TomTomMap", "Style loaded successfully!")
                                        configureTomTomMap(map, clickHandlerState)
                                        tomTomMap = map
                                        hideTomTomWatermarks(this@apply)
                                    }
                                    override fun onFailure(failure: LoadingStyleFailure) {
                                        Log.e("TomTomMap", "Style FAILED: ${failure::class.simpleName} | $failure")
                                        // Fallback: set map anyway so we can draw markers
                                        configureTomTomMap(map, clickHandlerState)
                                        tomTomMap = map
                                        hideTomTomWatermarks(this@apply)
                                    }
                                }
                            )
                        }
                    })
                    mapView = this
                    hideTomTomWatermarks(this)
                }
            },
            onRelease = { view ->
                try {
                    view.onPause()
                    view.onStop()
                    view.onDestroy()
                } catch (e: Exception) {
                    // Ignore already destroyed
                }
            },
            update = { _ ->
                // Called on recomposition. We use the saved tomTomMap instance.
                tomTomMap?.let { map ->
                    renderTomTomMapContent(
                        tomTomMap = map,
                        markers = markers,
                        routePoints = routePoints,
                        viewport = viewport,
                        routeColorArgb = routeColorArgb
                    )
                }
            }
        )

        if (!statusMessage.isNullOrBlank()) {
            MapStatusCard(statusMessage = statusMessage)
        }
    }

    DisposableEffect(lifecycleOwner, mapView) {
        val currentMapView = mapView ?: return@DisposableEffect onDispose {}
        val lifecycle = lifecycleOwner.lifecycle

        val observer = LifecycleEventObserver { _, event ->
            try {
                when (event) {
                    Lifecycle.Event.ON_START -> currentMapView.onStart()
                    Lifecycle.Event.ON_RESUME -> currentMapView.onResume()
                    Lifecycle.Event.ON_PAUSE -> currentMapView.onPause()
                    Lifecycle.Event.ON_STOP -> currentMapView.onStop()
                    else -> Unit
                }
            } catch (e: Exception) {
                Log.w("TomTomMap", "Lifecycle event error: ${e.message}")
            }
        }
        lifecycle.addObserver(observer)
        onDispose {
            lifecycle.removeObserver(observer)
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
    onMapClick: ((LatLng) -> Unit)?,
    statusMessage: String? = null
) {
    val tileTemplate = remember(
        providerConfig.activeProvider,
        providerConfig.openStreetMap.tileUrlTemplate
    ) {
        normalizeRuntimeTileTemplate(providerConfig)
    }
    val attribution = providerConfig.openStreetMap.attribution ?: "© OpenStreetMap contributors"
    val zoom = viewport.zoom
    val tileSizeDp = 256.dp
    val tileSizePx = with(LocalDensity.current) { tileSizeDp.toPx() }
    val centerTile = remember(viewport.center.latitude, viewport.center.longitude, zoom) {
        viewport.center.toOsmTileCoordinate(zoom)
    }

    BoxWithConstraints(
        modifier = modifier
            .background(Color(0xFFEAF3FF))
            .pointerInput(centerTile.x, centerTile.y, zoom, tileSizePx, onMapClick) {
                detectTapGestures { tap ->
                    onMapClick?.invoke(tap.toLatLng(centerTile, size.width.toFloat(), size.height.toFloat(), zoom, tileSizePx))
                }
            }
    ) {
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
            MapStatusCard(statusMessage = statusMessage)
        }
    }
}

private fun configureTomTomMap(
    tomTomMap: TomTomMap,
    clickHandlerState: State<((LatLng) -> Unit)?>
) {
    tomTomMap.addMapClickListener(object : MapClickListener {
        override fun onMapClicked(coordinate: GeoPoint): Boolean {
            clickHandlerState.value?.invoke(LatLng(coordinate.latitude, coordinate.longitude))
            return clickHandlerState.value != null
        }
    })
}

private fun renderTomTomMapContent(
    tomTomMap: TomTomMap,
    markers: List<RuntimeMapMarker>,
    routePoints: List<LatLng>,
    viewport: RuntimeMapViewport,
    routeColorArgb: Int
) {
    tomTomMap.clear()
    tomTomMap.moveCamera(
        CameraOptions(
            viewport.center.toGeoPoint(),
            viewport.zoom.toDouble(),
            null,
            null,
            null
        )
    )

    if (routePoints.size > 1) {
        tomTomMap.addPolyline(
            PolylineOptions(
                coordinates = routePoints.map { it.toGeoPoint() },
                lineColor = routeColorArgb,
                lineWidths = listOf(WidthByZoom(5.0, 0.0)),
                outlineColor = Color.White.copy(alpha = 0.5f).toArgb(),
                outlineWidths = listOf(WidthByZoom(2.0, 0.0)),
                tag = "runtime-route"
            )
        )
    }

    val markerImage = ImageFactory.fromResource(R.drawable.ic_tomtom_runtime_marker)
    markers.forEach { marker ->
        tomTomMap.addMarker(
            MarkerOptions(
                coordinate = marker.position.toGeoPoint(),
                pinImage = markerImage,
                tag = marker.id,
                balloonText = marker.title
            )
        )
    }
}

private fun hideTomTomWatermarks(viewGroup: android.view.ViewGroup) {
    for (i in 0 until viewGroup.childCount) {
        val child = viewGroup.getChildAt(i)
        val className = child.javaClass.simpleName.lowercase()
        if (className.contains("logo") || className.contains("compass") || className.contains("currentlocation") || className.contains("watermark")) {
            child.visibility = android.view.View.GONE
        } else if (child is android.view.ViewGroup) {
            hideTomTomWatermarks(child)
        }
    }
}

@Composable
private fun BoxScope.MapStatusCard(statusMessage: String) {
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

private fun hasTomTomSdkKey(): Boolean = BuildConfig.TOMTOM_API_KEY.trim().isNotBlank()

private fun LatLng.toGeoPoint(): GeoPoint = GeoPoint(latitude, longitude)

private fun MapsProviderConfig.recoveryMessageOrNull(): String? {
    val normalizedReason = reason?.trim()?.lowercase(Locale.US).orEmpty()
    val providerDowngraded = requestedProvider == "tomtom_maps" && activeProvider == "openstreetmap"
    return if (
        providerDowngraded ||
        normalizedReason == "maps_provider_health_critical" ||
        normalizedReason == "tomtom_quota_near_limit" ||
        normalizedReason == "tomtom_server_key_missing"
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

private fun Offset.toLatLng(centerTile: OsmTileCoordinate, widthPx: Float, heightPx: Float, zoom: Int, tileSizePx: Float): LatLng {
    val worldX = centerTile.x + (x - widthPx / 2f) / tileSizePx
    val worldY = centerTile.y + (y - heightPx / 2f) / tileSizePx
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

private fun normalizeRuntimeTileTemplate(providerConfig: MapsProviderConfig): String {
    val gatewayBase = BuildConfig.BASE_URL
        .substringBefore("/api/v1")
        .trimEnd('/')
    val gatewayProxyTemplate = "$gatewayBase/api/v1/maps/tiles/{z}/{x}/{y}.png"
    val candidate = providerConfig.openStreetMap.tileUrlTemplate?.trim().orEmpty()
    return when {
        candidate.isBlank() -> gatewayProxyTemplate
        candidate.startsWith("/") -> "$gatewayBase$candidate"
        candidate.contains("tile.openstreetmap.org", ignoreCase = true) -> gatewayProxyTemplate
        else -> candidate
    }
}
