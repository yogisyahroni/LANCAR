package com.lancar.courier.ui.components.maps

import android.os.Bundle
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
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
import com.lancar.courier.data.model.MapsProviderConfig
import org.maplibre.android.MapLibre
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.annotations.PolylineOptions
import org.maplibre.android.camera.CameraUpdateFactory as LibreCameraUpdateFactory
import org.maplibre.android.geometry.LatLng as LibreLatLng
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style

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
    fallbackTitle: String = "Peta belum tersedia",
    fallbackMessage: String = "Navigasi tetap memakai alamat dan koordinat order. Admin dapat mengaktifkan Google Maps atau OpenStreetMap tanpa install ulang aplikasi."
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
            androidx.compose.runtime.LaunchedEffect(center.latitude, center.longitude) {
                cameraPositionState.animate(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.fromLatLngZoom(center, cameraPositionState.position.zoom.coerceIn(12f, 17f))
                    ),
                    800
                )
            }
            GoogleMap(
                modifier = modifier,
                cameraPositionState = cameraPositionState,
                properties = googleProperties,
                uiSettings = googleUiSettings
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
            OpenStreetMapRenderer(
                providerConfig = providerConfig,
                markers = validMarkers,
                routePoints = validRoutePoints,
                center = center,
                modifier = modifier,
                routeColor = routeColor.toArgb()
            )
        }

        else -> {
            RuntimeMapFallback(
                title = fallbackTitle,
                message = providerConfig.reason?.replace("_", " ") ?: fallbackMessage,
                provider = providerConfig.activeProvider,
                center = center,
                modifier = modifier
            )
        }
    }
}

@Composable
private fun OpenStreetMapRenderer(
    providerConfig: MapsProviderConfig,
    markers: List<RuntimeMapMarker>,
    routePoints: List<LatLng>,
    center: LatLng,
    modifier: Modifier,
    routeColor: Int
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val tileTemplate = providerConfig.openStreetMap.tileUrlTemplate
        ?.takeIf { it.isNotBlank() }
        ?: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
    val attribution = providerConfig.openStreetMap.attribution
        ?: "© OpenStreetMap contributors"

    val mapView = remember {
        MapLibre.getInstance(context)
        MapView(context).apply { onCreate(Bundle()) }
    }

    DisposableEffect(lifecycleOwner, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                Lifecycle.Event.ON_DESTROY -> mapView.onDestroy()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onDestroy()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { mapView },
        update = { view ->
            view.getMapAsync { map ->
                map.uiSettings.isCompassEnabled = false
                map.uiSettings.isLogoEnabled = false
                map.uiSettings.isAttributionEnabled = true
                map.setStyle(Style.Builder().fromJson(osmRasterStyle(tileTemplate, attribution))) {
                    map.clear()
                    markers.forEach { marker ->
                        map.addMarker(
                            MarkerOptions()
                                .position(LibreLatLng(marker.position.latitude, marker.position.longitude))
                                .title(marker.title)
                                .snippet(marker.snippet)
                        )
                    }
                    if (routePoints.size > 1) {
                        map.addPolyline(
                            PolylineOptions()
                                .addAll(routePoints.map { LibreLatLng(it.latitude, it.longitude) })
                                .color(routeColor)
                                .width(5f)
                        )
                    }
                    map.animateCamera(
                        LibreCameraUpdateFactory.newLatLngZoom(
                            LibreLatLng(center.latitude, center.longitude),
                            if (routePoints.size > 1) 12.5 else 15.0
                        )
                    )
                }
            }
        }
    )
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

private fun osmRasterStyle(tileTemplate: String, attribution: String): String {
    val safeTiles = tileTemplate.replace("\\", "\\\\").replace("\"", "\\\"")
    val safeAttribution = attribution.replace("\\", "\\\\").replace("\"", "\\\"")
    return """
        {
          "version": 8,
          "sources": {
            "osm": {
              "type": "raster",
              "tiles": ["$safeTiles"],
              "tileSize": 256,
              "attribution": "$safeAttribution"
            }
          },
          "layers": [
            {
              "id": "osm",
              "type": "raster",
              "source": "osm"
            }
          ]
        }
    """.trimIndent()
}
