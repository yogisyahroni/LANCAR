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
    onCapturePod: () -> Unit
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
                onCapturePod = onCapturePod
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
    onCapturePod: () -> Unit
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
                    val gmmIntentUri = Uri.parse("geo:0,0?q=${Uri.encode(order.dropAddress)}")
                    val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri)
                    mapIntent.setPackage("com.google.android.apps.maps")
                    if (mapIntent.resolveActivity(context.packageManager) != null) {
                        context.startActivity(mapIntent)
                    }
                }
            )

            ActionButton(
                icon = Icons.Default.Phone,
                label = "Call Customer",
                onClick = {
                    val phone = order.phoneNumber ?: ""
                    if (phone.isNotBlank()) {
                        val callIntent = Intent(Intent.ACTION_DIAL).apply {
                            data = Uri.parse("tel:$phone")
                        }
                        context.startActivity(callIntent)
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
