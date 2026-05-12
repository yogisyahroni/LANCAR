package com.lancar.customer.ui.screens.booking

import android.Manifest
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import com.lancar.customer.ui.theme.Primary
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Composable
fun BookingScreen(
    viewModel: BookingViewModel,
    onBackClick: () -> Unit,
    onBookingSuccess: (String) -> Unit
) {
    val uiState by viewModel.bookingState.collectAsState()
    val context = LocalContext.current
    
    // Default starting position (Jakarta center) if GPS not available yet
    val defaultJakarta = remember { LatLng(-6.2088, 106.8456) }
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(defaultJakarta, 14f)
    }

    // Handle Location Permission runtime check gracefully
    val locationPermissionState = rememberPermissionState(Manifest.permission.ACCESS_FINE_LOCATION)

    LaunchedEffect(Unit) {
        if (!locationPermissionState.status.isGranted) {
            locationPermissionState.launchPermissionRequest()
        }
    }

    // Listen for booking success navigation
    LaunchedEffect(viewModel) {
        viewModel.bookingSuccess.collectLatest { orderId ->
            Toast.makeText(context, "Order berhasil dibuat!", Toast.LENGTH_SHORT).show()
            onBookingSuccess(orderId)
        }
    }

    // Error handling
    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            Toast.makeText(context, error, Toast.LENGTH_LONG).show()
            viewModel.clearError()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        // THE BASE LAYER: Google Map rendering
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(
                isMyLocationEnabled = locationPermissionState.status.isGranted,
                mapStyleOptions = null
            ),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                myLocationButtonEnabled = true
            ),
            onMapClick = { latLng ->
                // In a real app, this selects the active input.
                // For demo logic: if pickup is null set pickup, else set destination
                if (uiState.pickupLocation == null) {
                    viewModel.setPickup(latLng, "Lokasi Dipilih (${latLng.latitude.toString().take(7)}, ${latLng.longitude.toString().take(7)})")
                } else {
                    viewModel.setDestination(latLng, "Tujuan Dipilih (${latLng.latitude.toString().take(7)}, ${latLng.longitude.toString().take(7)})")
                }
            }
        ) {
            // Marker injection based on VM state
            uiState.pickupLocation?.let { loc ->
                Marker(
                    state = MarkerState(position = loc),
                    title = "Titik Jemput",
                    snippet = uiState.pickupAddress
                )
            }
            uiState.destinationLocation?.let { loc ->
                Marker(
                    state = MarkerState(position = loc),
                    title = "Titik Antar",
                    snippet = uiState.destinationAddress
                )
            }
        }

        // TOP LAYER: Navigation and Back controls
        TopControls(onBackClick = onBackClick)

        // BOTTOM LAYER: Premium Booking Input Card
        FloatingBookingCard(
            modifier = Modifier.align(Alignment.BottomCenter),
            uiState = uiState,
            onConfirmClick = { viewModel.confirmBooking() }
        )

        // Loading overlay during API interaction
        if (uiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.4f)),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Color.White)
            }
        }
    }
}

@Composable
private fun TopControls(onBackClick: () -> Unit) {
    SafeArea {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.Top
        ) {
            IconButton(
                onClick = onBackClick,
                modifier = Modifier
                    .size(45.dp)
                    .clip(CircleShape)
                    .shadow(8.dp, CircleShape)
                    .background(MaterialTheme.colorScheme.surface)
            ) {
                Icon(
                    imageVector = Icons.Default.ArrowBack,
                    contentDescription = "Kembali",
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

@Composable
private fun FloatingBookingCard(
    modifier: Modifier = Modifier,
    uiState: BookingState,
    onConfirmClick: () -> Unit
) {
    AnimatedVisibility(
        visible = true,
        enter = slideInVertically(initialOffsetY = { it }, animationSpec = tween(500)),
        exit = slideOutVertically(targetOffsetY = { it }),
        modifier = modifier
    ) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .shadow(20.dp, RoundedCornerShape(24.dp)),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
        ) {
            Column(
                modifier = Modifier.padding(20.dp)
            ) {
                Text(
                    text = "Konfirmasi Rute Anda",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    letterSpacing = (-0.3).sp
                )
                
                Spacer(modifier = Modifier.height(16.dp))

                // Pickup Row
                LocationInputRow(
                    icon = Icons.Default.LocationOn,
                    iconColor = Primary,
                    label = if (uiState.pickupAddress.isEmpty()) "Ketuk peta untuk titik jemput" else uiState.pickupAddress,
                    placeholder = uiState.pickupAddress.isEmpty()
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Destination Row (Active Search)
                LocationInputRow(
                    icon = Icons.Default.Search,
                    iconColor = Color.Gray,
                    label = if (uiState.destinationAddress.isEmpty()) "Ketuk peta untuk tujuan" else uiState.destinationAddress,
                    placeholder = uiState.destinationAddress.isEmpty(),
                    active = true
                )

                Spacer(modifier = Modifier.height(16.dp))

                if (uiState.estimatedPrice > 0) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Estimasi Harga:", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                        Text(
                            "Rp ${uiState.estimatedPrice}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 18.sp,
                            color = Primary
                        )
                    }
                    Spacer(modifier = Modifier.height(16.dp))
                }

                // Dynamic CTA Button
                Button(
                    onClick = onConfirmClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    enabled = uiState.pickupLocation != null && uiState.destinationLocation != null,
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Text(
                        text = if (uiState.estimatedPrice > 0) "Pesan Sekarang" else "Pilih di Peta",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }
    }
}

@Composable
private fun LocationInputRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    iconColor: Color,
    label: String,
    placeholder: Boolean,
    active: Boolean = false
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = iconColor,
            modifier = Modifier.size(20.dp)
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = label,
            fontSize = 14.sp,
            color = if (placeholder) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            fontWeight = if (active) FontWeight.Medium else FontWeight.Normal,
            maxLines = 2
        )
    }
}

@Composable
private fun SafeArea(content: @Composable () -> Unit) {
    Box(modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars)) {
        content()
    }
}

