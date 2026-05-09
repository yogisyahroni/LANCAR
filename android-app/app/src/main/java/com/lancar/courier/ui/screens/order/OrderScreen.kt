package com.lancar.courier.ui.screens.order

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lancar.courier.data.model.Order
import com.lancar.courier.ui.theme.Primary

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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Orders") },
                actions = {
                    IconButton(onClick = { onSync() }) {
                        Icon(
                            imageVector = Icons.Default.Sync,
                            contentDescription = "Sync orders",
                            tint = if (isSyncing) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onPrimary
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        if (orders.isEmpty()) {
            EmptyState(paddingValues = paddingValues)
        } else {
            OrderList(
                orders = orders,
                onOrderClick = onOrderClick,
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
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
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items(orders, key = { it.orderId }) { order ->
            OrderCard(order = order, onClick = { onOrderClick(order) })
        }
    }
}

@Composable
private fun OrderCard(order: Order, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = order.orderId,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                OrderStatusChip(status = order.status)
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.LocationOn,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = order.dropAddress,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Fee: ${order.fee}",
                    style = MaterialTheme.typography.bodySmall,
                    color = Primary
                )
                Text(
                    text = "Distance: ${order.distance}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (order.needsSync) {
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.SyncDisabled,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = MaterialTheme.colorScheme.warning
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Pending sync",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.warning
                    )
                }
            }
        }
    }
}

@Composable
private fun OrderStatusChip(status: String) {
    val (containerColor, contentColor) = when (status) {
        "pending" -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        "assigned" -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
        "picked_up" -> MaterialTheme.colorScheme.infoContainer to MaterialTheme.colorScheme.onInfoContainer
        "in_transit" -> MaterialTheme.colorScheme.primary to MaterialTheme.colorScheme.onPrimary
        "delivered" -> MaterialTheme.colorScheme.successContainer to MaterialTheme.colorScheme.onSuccessContainer
        "failed" -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
        else -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    }

    AssistChip(
        onClick = { },
        label = { Text(status.replace("_", " ").uppercase()) },
        colors = AssistChipDefaults.assistChipColors(
            containerColor = containerColor,
            labelContentColor = contentColor
        )
    )
}

@Composable
private fun EmptyState(paddingValues: PaddingValues) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(paddingValues)
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
            text = "No Orders",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "New orders will appear here",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
