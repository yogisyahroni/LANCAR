package com.lancar.courier.ui.screens.order

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lancar.courier.data.model.Order
import com.lancar.courier.ui.theme.Primary
import com.lancar.courier.ui.theme.Warning
import com.lancar.courier.ui.theme.Success
import com.lancar.courier.ui.theme.Info
import com.lancar.courier.ui.theme.OnPrimary

/**
 * Order List Screen
 * 
 * Displays list of orders with status indicators.
 * Supports offline queue visualization.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderScreen(
    orders: List<Order>,
    onOrderClick: (Order) -> Unit,
    onSync: () -> Unit,
    isSyncing: Boolean = false
) {
    var showSyncDialog by remember { mutableStateOf(false) }
    var selectedRole by remember { mutableStateOf("on_demand") }
    val roleTabs = listOf(
        "on_demand" to "On Demand",
        "pickup" to "Pickup",
        "delivery" to "Delivery"
    )
    val roleOrders = orders.filter { it.normalizedWorkflowRole() == selectedRole }

    if (showSyncDialog) {
        AlertDialog(
            onDismissRequest = { showSyncDialog = false },
            title = { Text("Sync Orders") },
            text = { Text("Syncing pending orders with backend...") },
            confirmButton = {
                TextButton(onClick = { showSyncDialog = false }) {
                    Text("OK")
                }
            }
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text("Tugas Kurir", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    text = "${roleOrders.size} ${roleTabs.first { it.first == selectedRole }.second.lowercase()} tersedia",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            IconButton(onClick = { onSync() }) {
                Icon(
                    imageVector = Icons.Default.Sync,
                    contentDescription = "Sync orders",
                    tint = if (isSyncing) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            roleTabs.forEachIndexed { index, tab ->
                SegmentedButton(
                    selected = selectedRole == tab.first,
                    onClick = { selectedRole = tab.first },
                    shape = SegmentedButtonDefaults.itemShape(index = index, count = roleTabs.size),
                    label = { Text(tab.second, maxLines = 1) }
                )
            }
        }

        if (roleOrders.isEmpty()) {
            EmptyState(role = roleTabs.first { it.first == selectedRole }.second)
        } else {
            OrderList(
                orders = roleOrders,
                onOrderClick = onOrderClick,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
}

@Composable
private fun OrderList(
    orders: List<Order>,
    onOrderClick: (Order) -> Unit,
    modifier: Modifier = Modifier
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        itemsIndexed(orders, key = { index, order -> "${order.orderId}-$index" }) { _, order ->
            OrderCard(order = order, onClick = { onOrderClick(order) })
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun OrderCard(order: Order, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = order.customerName.ifBlank { "Customer" },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                    )
                    Text(
                        text = order.orderId.ifBlank { "Order tanpa ID" },
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                    )
                }
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    RoleChip(order = order)
                    OrderStatusChip(status = order.status)
                }
            }

            RouteRow(icon = Icons.Default.Storefront, label = "Pickup", value = order.pickupAddress)
            RouteRow(icon = Icons.Default.LocationOn, label = "Dropoff", value = order.dropAddress)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CompactInfo(icon = Icons.Default.Payments, text = order.fee.ifBlank { "Fee -" })
                CompactInfo(icon = Icons.Default.Route, text = order.distance.ifBlank { "0 km" })
                val pickupTime = order.pickupTime.takeIf { it.isNotBlank() }?.take(16)
                if (pickupTime != null) {
                    CompactInfo(icon = Icons.Default.Schedule, text = pickupTime)
                }
            }

            if (order.needsSync) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.SyncDisabled,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = Warning
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Pending sync",
                        style = MaterialTheme.typography.labelSmall,
                        color = Warning
                    )
                }
            }
        }
    }
}

@Composable
private fun RoleChip(order: Order) {
    val (label, color) = when (order.normalizedWorkflowRole()) {
        "pickup" -> "PICKUP" to Warning
        "delivery" -> "DELIVERY" to Success
        else -> "ON DEMAND" to Primary
    }

    AssistChip(
        onClick = { },
        label = { Text(label) },
        leadingIcon = {
            Icon(
                imageVector = when (order.normalizedWorkflowRole()) {
                    "pickup" -> Icons.Default.Storefront
                    "delivery" -> Icons.Default.Navigation
                    else -> Icons.Default.Bolt
                },
                contentDescription = null,
                modifier = Modifier.size(14.dp)
            )
        },
        colors = AssistChipDefaults.assistChipColors(
            containerColor = color.copy(alpha = 0.12f),
            labelColor = color,
            leadingIconContentColor = color
        )
    )
}

private fun Order.normalizedWorkflowRole(): String {
    val modelValue = model.lowercase()
    return when {
        workflowRole == "pickup" || workflowRole == "delivery" || workflowRole == "on_demand" -> workflowRole
        modelValue == "p2p" || modelValue == "on_demand" || modelValue == "ondemand" -> "on_demand"
        legNumber <= 1 -> "pickup"
        else -> "delivery"
    }
}

@Composable
private fun RouteRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(18.dp))
        Column {
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                text = value.ifBlank { "-" },
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
            )
        }
    }
}

@Composable
private fun CompactInfo(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String
) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(14.dp))
            Text(text, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
    }
}

@Composable
private fun OrderStatusChip(status: String) {
    val (containerColor, contentColor) = when (status) {
        "pending" -> Warning.copy(alpha = 0.16f) to Warning
        "assigned" -> Info.copy(alpha = 0.14f) to Info
        "picked_up" -> Primary.copy(alpha = 0.12f) to Primary
        "in_transit" -> MaterialTheme.colorScheme.primary to MaterialTheme.colorScheme.onPrimary
        "delivered" -> Success.copy(alpha = 0.14f) to Success
        "failed" -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
        else -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    }

    AssistChip(
        onClick = { },
        label = { Text(status.replace("_", " ").uppercase()) },
        colors = AssistChipDefaults.assistChipColors(
            containerColor = containerColor,
            labelColor = contentColor
        )
    )
}

@Composable
private fun EmptyState(role: String = "Order") {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.LocalShipping,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Belum Ada $role",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Tugas baru akan muncul di antrian ini",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
