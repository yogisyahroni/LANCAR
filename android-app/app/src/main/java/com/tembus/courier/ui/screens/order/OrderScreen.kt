package com.tembus.courier.ui.screens.order

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.estimatedNetEarningsIdr
import com.tembus.courier.data.model.normalizedWorkflowRole
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.Warning
import com.tembus.courier.ui.theme.Success
import com.tembus.courier.ui.theme.Info
import com.tembus.courier.ui.theme.OnPrimary

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
    courierRole: String,
    onOrderClick: (Order) -> Unit,
    onSync: () -> Unit,
    isSyncing: Boolean = false
) {
    var showSyncDialog by remember { mutableStateOf(false) }
    val lockedRole = courierRole.toCourierWorkRole()
    var selectedRole by remember(lockedRole) { mutableStateOf(lockedRole) }
    val roleTabs = listOf(
        "on_demand" to "On Demand",
        "regular" to "Regular"
    )
    val roleOrders = orders.filter { it.normalizedWorkflowRole() == selectedRole }
    val isRoleLocked = courierRole != "all"

    if (showSyncDialog) {
        AlertDialog(
            onDismissRequest = { showSyncDialog = false },
            title = { Text("Sinkronisasi Pesanan") },
            text = { Text("Pesanan tertunda sedang disinkronkan.") },
            confirmButton = {
                TextButton(onClick = { showSyncDialog = false }) {
                    Text("OK")
                }
            }
        )
    }

    PullToRefreshBox(
        isRefreshing = isSyncing,
        onRefresh = onSync,
        modifier = Modifier.fillMaxSize()
    ) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column {
                Text(roleTitle(selectedRole), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text(
                        text = "${roleOrders.size} pesanan ${roleTabs.first { it.first == selectedRole }.second.lowercase()}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            IconButton(onClick = { onSync() }) {
                Icon(
                    imageVector = Icons.Default.Sync,
                    contentDescription = CourierTextCatalog.translate("Sinkronkan order"),
                    tint = if (isSyncing) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        if (!isRoleLocked) {
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
        } else {
            AssistChip(
                onClick = { },
                label = { Text(roleTabs.first { it.first == selectedRole }.second) },
                leadingIcon = { Icon(roleIcon(selectedRole), contentDescription = null, modifier = Modifier.size(16.dp)) }
            )
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
                        text = order.customerName.ifBlank { "Nama pelanggan sedang disinkronkan" },
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
                    OrderStatusChip(order = order)
                }
            }

            RouteRow(icon = Icons.Default.Storefront, label = "Pickup", value = order.pickupAddress)
            RouteRow(icon = Icons.Default.LocationOn, label = "Tujuan", value = order.dropAddress)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CompactInfo(icon = Icons.Default.Payments, text = order.estimatedNetEarningsIdr().toRupiahCompact())
                CompactInfo(icon = Icons.Default.Route, text = order.distance.ifBlank { "Jarak dihitung" })
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
                        text = "Menunggu sinkronisasi",
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
    val serviceCode = order.serviceCode.orEmpty().lowercase()
    val serviceCategory = order.serviceCategory.orEmpty().lowercase()
    val hasFoodPayload = order.foodItems.isNotEmpty() ||
        serviceCode.startsWith("food") ||
        serviceCategory in setOf("food", "food_delivery")
    val isKnownPackage = serviceCategory in setOf("package_on_demand", "regular", "on_demand") ||
        serviceCode in setOf("tembus_instant", "p2p", "regular") ||
        order.model.lowercase() in setOf("p2p", "on_demand", "regular")
    val (label, color, icon) = when {
        serviceCode.startsWith("tambal_ban") || serviceCategory == "tambal_ban" ->
            Triple("TAMBAL BAN", Warning, Icons.Default.Build)
        serviceCode.startsWith("towing") || serviceCategory == "towing" ->
            Triple("TOWING", Info, Icons.Default.LocalShipping)
        serviceCode == "tembus_aggregator" || serviceCategory == "aggregator" ->
            Triple("AGGREGATOR", Info, Icons.Default.LocalShipping)
        hasFoodPayload ->
            Triple("FOOD", Success, Icons.Default.Storefront)
        isKnownPackage && order.normalizedWorkflowRole() == "regular" ->
            Triple("REGULAR", Success, Icons.Default.LocalShipping)
        else ->
            Triple("LAYANAN BELUM DIKENAL", Warning, Icons.Default.HelpOutline)
    }

    AssistChip(
        onClick = { },
        label = { Text(label) },
        leadingIcon = {
            Icon(
                imageVector = icon,
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

private fun String.toCourierWorkRole(): String = when (this) {
    "regular", "pickup_only", "pickup", "delivery_only", "delivery" -> "regular"
    "all" -> "on_demand"
    else -> "on_demand"
}

private fun roleTitle(role: String): String = when (role) {
    "regular" -> "Order Regular"
    else -> "Pekerjaan On Demand"
}

private fun roleIcon(role: String) = when (role) {
    "regular" -> Icons.Default.LocalShipping
    else -> Icons.Default.Bolt
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
private fun OrderStatusChip(order: Order) {
    val status = order.status
    val role = order.normalizedWorkflowRole()
    val label = courierOrderStatusLabel(status, role)
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
        label = { Text(label) },
        colors = AssistChipDefaults.assistChipColors(
            containerColor = containerColor,
            labelColor = contentColor
        )
    )
}

private fun courierOrderStatusLabel(status: String, role: String): String {
    return when (role) {
        "on_demand" -> when (status) {
            "pending" -> "TAWARAN"
            "assigned" -> "SIAP PICKUP"
            "picked_up" -> "SIAP ANTAR"
            "in_transit" -> "MENGANTAR"
            "delivered" -> "SELESAI"
            "failed" -> "PERLU REVIEW"
            else -> status.replace("_", " ").uppercase()
        }
        "regular" -> when (status) {
            "assigned" -> "SIAP PICKUP"
            "picked_up" -> "PICKUP SELESAI"
            "in_transit" -> "MENGANTAR"
            "delivered" -> "SELESAI"
            "failed" -> "PERLU REVIEW"
            else -> status.replace("_", " ").uppercase()
        }
        else -> status.replace("_", " ").uppercase()
    }
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
