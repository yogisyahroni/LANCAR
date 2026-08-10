package com.tembus.merchant.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import java.util.Locale

/**
 * FB-093 — pemilih lokasi toko wajib via peta OSM (osmdroid, tanpa API key).
 * - Tap peta → pin di titik itu
 * - Pin bisa digeser (drag)
 * - Koordinat tampil di bawah peta
 * Dipakai di RegistrationScreen (daftar merchant) — lokasi wajib sebelum submit.
 */
@Composable
fun LocationPickerSection(
    lat: Double?,
    lng: Double?,
    onChange: (lat: Double, lng: Double) -> Unit,
    modifier: Modifier = Modifier
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnChange by rememberUpdatedState(onChange)

    // Satu MapView untuk seluruh umur komposable; marker di-update idempotent.
    // Pakai bentuk NON-delegated (mutableStateOf tanpa `by`) supaya `.value`
    // bisa diakses langsung dari dalam lambda AndroidView.update.
    val mapViewState = remember { mutableStateOf<MapView?>(null) }
    val markerState = remember { mutableStateOf<Marker?>(null) }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapViewState.value?.onResume()
                Lifecycle.Event.ON_PAUSE -> mapViewState.value?.onPause()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapViewState.value?.onDetach()
        }
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = "Lokasi Toko*",
            style = MaterialTheme.typography.titleSmall,
            fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
        )
        Text(
            text = "Ketuk peta untuk menandai posisi toko, lalu geser pin untuk menyesuaikan. " +
                "Lokasi ini dipakai menghitung ongkir & menampilkan toko di resto terdekat.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        AndroidView(
            factory = { ctx ->
                MapView(ctx).apply {
                    setTileSource(TileSourceFactory.MAPNIK)
                    setMultiTouchControls(true)
                    controller.setZoom(11.0)
                    controller.setCenter(GeoPoint(-6.2, 106.82)) // default: Jakarta
                    overlays.add(MapEventsOverlay(object : MapEventsReceiver {
                        override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                            currentOnChange(p.latitude, p.longitude)
                            return true
                        }

                        override fun longPressHelper(p: GeoPoint): Boolean = false
                    }))
                }
            },
            update = { mv ->
                mapViewState.value = mv
                val latV = lat
                val lngV = lng
                val existing = markerState.value
                if (latV != null && lngV != null) {
                    if (existing == null) {
                        val m = Marker(mv).apply {
                            position = GeoPoint(latV, lngV)
                            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                            isDraggable = true
                            setOnMarkerDragListener(object : Marker.OnMarkerDragListener {
                                override fun onMarkerDrag(marker: Marker?) {}
                                override fun onMarkerDragEnd(marker: Marker?) {
                                    marker?.position?.let { currentOnChange(it.latitude, it.longitude) }
                                }
                                override fun onMarkerDragStart(marker: Marker?) {}
                            })
                        }
                        mv.overlays.add(m)
                        markerState.value = m
                        mv.controller.setZoom(16.0)
                        mv.controller.animateTo(GeoPoint(latV, lngV))
                    } else {
                        existing.position = GeoPoint(latV, lngV)
                    }
                    mv.invalidate()
                } else if (existing != null) {
                    mv.overlays.remove(existing)
                    markerState.value = null
                    mv.invalidate()
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(240.dp)
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp))
        )

        if (lat != null && lng != null) {
            Text(
                text = String.format(Locale.US, "Pin: %.6f, %.6f — geser pin untuk menyesuaikan", lat, lng),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
        } else {
            Text(
                text = "Belum ditandai — ketuk peta untuk menandai lokasi toko.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
        }
    }
}
