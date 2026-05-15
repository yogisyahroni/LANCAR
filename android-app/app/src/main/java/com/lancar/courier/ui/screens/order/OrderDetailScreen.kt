package com.lancar.courier.ui.screens.order

import android.app.Activity
import android.content.Intent
import android.location.Geocoder
import android.net.Uri
import android.view.WindowManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.MapUiSettings
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.Polyline
import com.google.maps.android.compose.rememberCameraPositionState
import com.lancar.courier.data.model.Order
import com.lancar.courier.ui.theme.Primary
import com.lancar.courier.ui.theme.PrimaryLight
import com.lancar.courier.ui.theme.Secondary
import com.lancar.courier.ui.theme.Success
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale

/**
 * Order Detail Screen
 * 
 * Displays detailed information about a specific order.
 * Allows status updates and PoD capture.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    order: Order,
    onBack: () -> Unit,
    onUpdateStatus: (String) -> Unit,
    onCapturePod: () -> Unit,
    onChatClick: () -> Unit
) {
    val context = LocalContext.current
    
    // 🛡️ SECURITY: Prevent customer PII screenshots and background system captures
    val activity = remember(context) { context as? Activity }
    DisposableEffect(activity) {
        activity?.window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            activity?.window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    var showStatusDialog by remember { mutableStateOf(false) }
    var newStatus by remember { mutableStateOf(order.status) }

    if (showStatusDialog) {
        AlertDialog(
            onDismissRequest = { showStatusDialog = false },
            title = { Text("Update Status") },
            text = {
                Column {
                    OrderStatusOptions(newStatus) { status ->
                        newStatus = status
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    onUpdateStatus(newStatus)
                    showStatusDialog = false
                }) {
                    Text("Update")
                }
            },
            dismissButton = {
                TextButton(onClick = { showStatusDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Pengantaran", fontWeight = FontWeight.Bold)
                        Text(
                            order.orderId.ifBlank { "Order aktif" },
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            DeliveryMapCard(order = order)
            OrderInfoCard(order = order)
            OrderActions(
                order = order,
                onStatusClick = { showStatusDialog = true },
                onCapturePod = onCapturePod,
                onChatClick = onChatClick
            )
        }
    }
}

@Composable
private fun DeliveryMapCard(order: Order) {
    val context = LocalContext.current
    val fallbackPickup = remember { LatLng(-6.175392, 106.827153) }
    val fallbackDropoff = remember { LatLng(-6.200000, 106.816666) }
    var pickupLatLng by remember(order.pickupAddress) { mutableStateOf<LatLng?>(null) }
    var dropLatLng by remember(order.dropAddress) { mutableStateOf<LatLng?>(null) }

    LaunchedEffect(order.pickupAddress, order.dropAddress) {
        pickupLatLng = geocodeAddress(context, order.pickupAddress) ?: fallbackPickup
        dropLatLng = geocodeAddress(context, order.dropAddress) ?: fallbackDropoff
    }

    val pickup = pickupLatLng ?: fallbackPickup
    val dropoff = dropLatLng ?: fallbackDropoff
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(pickup, 12f)
    }

    LaunchedEffect(pickup, dropoff) {
        val center = LatLng(
            (pickup.latitude + dropoff.latitude) / 2,
            (pickup.longitude + dropoff.longitude) / 2
        )
        cameraPositionState.position = CameraPosition.fromLatLngZoom(center, 12f)
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(modifier = Modifier.fillMaxWidth().height(230.dp)) {
                GoogleMap(
                    modifier = Modifier.fillMaxSize(),
                    cameraPositionState = cameraPositionState,
                    uiSettings = MapUiSettings(
                        zoomControlsEnabled = false,
                        myLocationButtonEnabled = false,
                        mapToolbarEnabled = false
                    )
                ) {
                    Marker(
                        state = MarkerState(position = pickup),
                        title = "Pickup",
                        snippet = order.pickupAddress
                    )
                    Marker(
                        state = MarkerState(position = dropoff),
                        title = "Dropoff",
                        snippet = order.dropAddress
                    )
                    Polyline(points = listOf(pickup, dropoff), color = Primary, width = 8f)
                }
            }

            Column(
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 2.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text("Rute Pengantaran", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                DeliveryStop(icon = Icons.Default.Storefront, label = "Pickup", value = order.pickupAddress.ifBlank { "Alamat pickup belum tersedia" }, color = Primary)
                DeliveryStop(icon = Icons.Default.LocationOn, label = "Dropoff", value = order.dropAddress.ifBlank { "Alamat tujuan belum tersedia" }, color = Secondary)
            }
        }
    }
}

@Composable
private fun DeliveryStop(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color
) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.padding(8.dp).size(18.dp))
        }
        Column {
            Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2)
        }
    }
}

@Composable
private fun OrderInfoCard(order: Order) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = "Detail Paket",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))

            InfoRow(label = "Order ID", value = order.orderId)
            InfoRow(label = "Customer", value = order.customerName)
            InfoRow(label = "Pickup", value = order.pickupAddress)
            InfoRow(label = "Drop-off", value = order.dropAddress)
            InfoRow(label = "Pickup Time", value = order.pickupTime)
            InfoRow(label = "Distance", value = order.distance)
            InfoRow(label = "Fee", value = order.fee)
            
            if (order.length != null || order.width != null || order.height != null) {
                val dims = "${order.length ?: 0} x ${order.width ?: 0} x ${order.height ?: 0} cm"
                InfoRow(label = "Dimensions", value = dims)
            }
            if (order.weight != null) {
                InfoRow(label = "Weight", value = "${order.weight} kg")
            }

            InfoRow(label = "Status", value = order.status.replace("_", " ").uppercase())
        }
    }
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text = "$label:", style = MaterialTheme.typography.bodyMedium)
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
    Spacer(modifier = Modifier.height(8.dp))
}

@Composable
private fun OrderActions(
    order: Order,
    onStatusClick: () -> Unit,
    onCapturePod: () -> Unit,
    onChatClick: () -> Unit
) {
    val context = LocalContext.current
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text(
                text = "Aksi Kurir",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))

            ActionButton(
                icon = Icons.Default.Navigation,
                label = "Mulai Navigasi",
                prominent = true,
                onClick = {
                    try {
                        val gmmIntentUri = Uri.parse("geo:0,0?q=${Uri.encode(order.dropAddress)}")
                        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                        // Remove Rigid Package Constraint: allow Waze, Google Maps Go, and device default navigators
                        val chooser = Intent.createChooser(mapIntent, "Pilih Aplikasi Peta/Navigasi")
                        context.startActivity(chooser)
                    } catch (e: Exception) {
                        android.widget.Toast.makeText(context, "Tidak ada aplikasi peta terinstall.", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            )

            ActionButton(
                icon = Icons.Default.Chat,
                label = "Chat Customer",
                onClick = onChatClick
            )

            ActionButton(
                icon = Icons.Default.Message,
                label = "Chat WhatsApp",
                onClick = {
                    val phone = order.phoneNumber ?: ""
                    if (phone.isNotBlank()) {
                        try {
                            val clean = phone.replace(Regex("[^0-9]"), "")
                            val formattedPhone = when {
                                clean.startsWith("0") -> "62" + clean.substring(1)
                                clean.startsWith("62") -> clean
                                else -> "62$clean"
                            }
                            val message = "Halo ${order.customerName}, saya Kurir LANCAR sedang menuju ke alamat pengantaran Anda (Pesanan: ${order.orderId})."
                            val waUri = Uri.parse("https://api.whatsapp.com/send?phone=$formattedPhone&text=${Uri.encode(message)}")
                            val waIntent = Intent(Intent.ACTION_VIEW, waUri)
                            context.startActivity(waIntent)
                        } catch (e: Exception) {
                            android.widget.Toast.makeText(context, "WhatsApp tidak terinstall atau nomor tidak valid.", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        android.widget.Toast.makeText(context, "Nomor telepon pelanggan tidak tersedia.", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            )

            ActionButton(
                icon = Icons.Default.Phone,
                label = "Call Customer",
                onClick = {
                    val phone = order.phoneNumber ?: ""
                    if (phone.isNotBlank()) {
                        try {
                            val callIntent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:$phone")
                            }
                            context.startActivity(callIntent)
                        } catch (e: Exception) {
                            android.widget.Toast.makeText(context, "Gagal membuka tombol telepon.", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            )

            ActionButton(
                icon = Icons.Default.CameraAlt,
                label = "Upload Bukti Pengiriman",
                onClick = onCapturePod
            )

            ActionButton(
                icon = Icons.Default.Update,
                label = "Update Status Order",
                onClick = onStatusClick
            )
        }
    }
}

@Composable
private fun ActionButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    prominent: Boolean = false,
    onClick: () -> Unit
) {
    val colors = if (prominent) {
        ButtonDefaults.buttonColors(containerColor = Secondary)
    } else {
        ButtonDefaults.outlinedButtonColors(contentColor = Primary)
    }
    val border = if (prominent) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outline)

    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(8.dp),
        colors = colors,
        border = border
    ) {
        Icon(icon, contentDescription = null)
        Spacer(modifier = Modifier.width(8.dp))
        Text(label)
    }
    Spacer(modifier = Modifier.height(8.dp))
}

@Composable
private fun OrderStatusOptions(currentStatus: String, onSelect: (String) -> Unit) {
    val statuses = listOf("pending", "assigned", "picked_up", "in_transit", "delivered", "failed")
    
    Column {
        statuses.forEach { status ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(text = status.replace("_", " ").uppercase())
                RadioButton(
                    selected = currentStatus == status,
                    onClick = { onSelect(status) }
                )
            }
        }
    }
}

@Suppress("DEPRECATION")
private suspend fun geocodeAddress(context: android.content.Context, address: String): LatLng? {
    if (address.isBlank()) return null

    return withContext(Dispatchers.IO) {
        try {
            val result = Geocoder(context, Locale.getDefault()).getFromLocationName(address, 1)
            result?.firstOrNull()?.let { LatLng(it.latitude, it.longitude) }
        } catch (e: Exception) {
            null
        }
    }
}
