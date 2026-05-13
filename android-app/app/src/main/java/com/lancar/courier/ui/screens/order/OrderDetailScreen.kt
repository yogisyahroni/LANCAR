package com.lancar.courier.ui.screens.order

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.view.WindowManager
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
import com.lancar.courier.data.model.Order

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
                title = { Text("Order Details") },
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
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
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
private fun OrderInfoCard(order: Order) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Order Information",
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
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Actions",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(16.dp))

            ActionButton(
                icon = Icons.Default.LocationOn,
                label = "View Map",
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
                label = "Chat In-App",
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
                label = "Capture PoD",
                onClick = onCapturePod
            )

            ActionButton(
                icon = Icons.Default.Update,
                label = "Update Status",
                onClick = onStatusClick
            )
        }
    }
}

@Composable
private fun ActionButton(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth()
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
