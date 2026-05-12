package com.lancar.customer.ui.screens.booking

import android.Manifest
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

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class)
@Composable
fun BookingScreen(
    viewModel: BookingViewModel,
    onBackClick: () -> Unit
) {
    val uiState by viewModel.bookingState.collectAsState()
    
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

    Box(modifier = Modifier.fillMaxSize()) {
        // THE BASE LAYER: Google Map rendering
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            properties = MapProperties(
                isMyLocationEnabled = locationPermissionState.status.isGranted,
                mapStyleOptions = null // Optional: Custom Dark mode map style can go here
            ),
            uiSettings = MapUiSettings(
                zoomControlsEnabled = false,
                myLocationButtonEnabled = false // Custom floating button later
            )
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
            uiState = uiState
        )
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
            // Circular Shadowed Back Button
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
    uiState: BookingState
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
                    text = "Mau kirim kemana hari ini?",
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
                    label = if (uiState.pickupAddress.isEmpty()) "Lokasi Saya Saat Ini" else uiState.pickupAddress,
                    placeholder = true
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Destination Row (Active Search)
                LocationInputRow(
                    icon = Icons.Default.Search,
                    iconColor = Color.Gray,
                    label = if (uiState.destinationAddress.isEmpty()) "Masukkan Alamat Tujuan" else uiState.destinationAddress,
                    placeholder = uiState.destinationAddress.isEmpty(),
                    active = true
                )

                Spacer(modifier = Modifier.height(20.dp))

                // Dynamic CTA Button based on flow
                Button(
                    onClick = { /* Trigger address search flow modal */ },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary)
                ) {
                    Text(
                        text = "Pilih di Peta",
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
            .clickable { /* Open Address Autocomplete */ }
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
            fontSize = 15.sp,
            color = if (placeholder) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            fontWeight = if (active) FontWeight.Medium else FontWeight.Normal,
            maxLines = 1
        )
    }
}

@Composable
private fun SafeArea(content: @Composable () -> Unit) {
    // Simple placeholder wrapper since standard system windows inset depends on outer theme config
    Box(modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars)) {
        content()
    }
}
