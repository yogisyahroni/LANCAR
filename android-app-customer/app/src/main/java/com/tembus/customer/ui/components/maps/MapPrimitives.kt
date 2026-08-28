package com.tembus.customer.ui.components.maps

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import com.tembus.customer.ui.theme.Primary

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

    suspend fun animate(update: CameraUpdate, durationMs: Int = 0) {
        position = update.position
    }
}

@Composable
fun rememberCameraPositionState(init: CameraPositionState.() -> Unit = {}): CameraPositionState {
    val initial = remember { CameraPositionState(CameraPosition.fromLatLngZoom(LatLng(-6.2088, 106.8456), 12f)) }
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

data class BitmapDescriptor(val color: Int = Primary.toArgb())

object BitmapDescriptorFactory {
    const val HUE_GREEN: Float = 120f

    fun defaultMarker(hue: Float = HUE_GREEN): BitmapDescriptor = BitmapDescriptor()
    fun fromBitmap(bitmap: android.graphics.Bitmap): BitmapDescriptor = BitmapDescriptor()
}

@Composable
fun RuntimeMap(
    modifier: Modifier = Modifier,
    cameraPositionState: CameraPositionState,
    properties: MapProperties = MapProperties(),
    uiSettings: MapUiSettings = MapUiSettings(),
    onMapLoaded: () -> Unit = {},
    onMapClick: (LatLng) -> Unit = {},
    content: @Composable () -> Unit = {}
) {
    Box(modifier = modifier.background(Color(0xFFEFF7F1))) {
        content()
    }
    onMapLoaded()
}

@Composable
fun MapMarker(
    state: MarkerState,
    title: String? = null,
    snippet: String? = null,
    icon: BitmapDescriptor? = null
) = Unit

@Composable
fun MapPolyline(
    points: List<LatLng>,
    color: Color,
    width: Float
) {
    if (points.size < 2) return
    Canvas(modifier = Modifier) {
        val strokeWidth = width.dp.toPx()
        drawLine(
            color = color,
            start = center.copy(x = center.x - 24.dp.toPx()),
            end = center.copy(x = center.x + 24.dp.toPx()),
            strokeWidth = strokeWidth,
            cap = StrokeCap.Round
        )
    }
}
