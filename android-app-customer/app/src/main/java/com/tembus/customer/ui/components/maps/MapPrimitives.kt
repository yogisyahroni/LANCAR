package com.tembus.customer.ui.components.maps

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

data class LatLng(
    val latitude: Double,
    val longitude: Double
)

data class CameraPosition(
    val target: LatLng,
    val zoom: Float
) {
    companion object {
        fun fromLatLngZoom(target: LatLng, zoom: Float): CameraPosition = CameraPosition(target, zoom)
    }
}

data class CameraUpdate(val position: CameraPosition)

object CameraUpdateFactory {
    fun newCameraPosition(position: CameraPosition): CameraUpdate = CameraUpdate(position)
}

class CameraPositionState(initialPosition: CameraPosition) {
    var position by mutableStateOf(initialPosition)

    @Suppress("UNUSED_PARAMETER")
    suspend fun animate(update: CameraUpdate, durationMs: Int = 0) {
        position = update.position
    }
}

@Composable
fun rememberCameraPositionState(init: CameraPositionState.() -> Unit = {}): CameraPositionState {
    // This primitive is only a state holder; callers must provide an
    // authoritative camera position through `init` before rendering a map.
    val initial = remember { CameraPositionState(CameraPosition.fromLatLngZoom(LatLng(0.0, 0.0), 1f)) }
    initial.init()
    return initial
}

data class MapProperties(
    val isMyLocationEnabled: Boolean = false
)

data class MapUiSettings(
    val zoomControlsEnabled: Boolean = false,
    val myLocationButtonEnabled: Boolean = false,
    val mapToolbarEnabled: Boolean = false,
    val compassEnabled: Boolean = false,
    val scrollGesturesEnabled: Boolean = true,
    val zoomGesturesEnabled: Boolean = true,
    val tiltGesturesEnabled: Boolean = true,
    val rotationGesturesEnabled: Boolean = true
)

data class MarkerState(val position: LatLng)

data class BitmapDescriptor(val color: Int = 0)

object BitmapDescriptorFactory {
    const val HUE_GREEN: Float = 120f

    @Suppress("UNUSED_PARAMETER")
    fun defaultMarker(hue: Float = HUE_GREEN): BitmapDescriptor = BitmapDescriptor()

    @Suppress("UNUSED_PARAMETER")
    fun fromBitmap(bitmap: android.graphics.Bitmap): BitmapDescriptor = BitmapDescriptor()
}

/** Compatibility shims for legacy imports. Use RuntimeMapRenderer for maps. */
@Composable
@Suppress("UNUSED_PARAMETER")
fun RuntimeMap(
    modifier: Modifier = Modifier,
    cameraPositionState: CameraPositionState,
    properties: MapProperties = MapProperties(),
    uiSettings: MapUiSettings = MapUiSettings(),
    onMapLoaded: () -> Unit = {},
    onMapClick: (LatLng) -> Unit = {},
    content: @Composable () -> Unit = {}
) {
    Box(modifier = modifier) { content() }
    onMapLoaded()
}

@Composable
@Suppress("UNUSED_PARAMETER")
fun MapMarker(
    state: MarkerState,
    title: String? = null,
    snippet: String? = null,
    icon: BitmapDescriptor? = null
) = Unit

@Composable
@Suppress("UNUSED_PARAMETER")
fun MapPolyline(
    points: List<LatLng>,
    color: Color,
    width: Float
) = Unit
