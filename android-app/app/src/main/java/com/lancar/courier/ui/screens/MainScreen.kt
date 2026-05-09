package com.lancar.courier.ui.screens

import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.lancar.courier.data.model.Order
import com.lancar.courier.ui.screens.order.OrderDetailScreen
import com.lancar.courier.ui.screens.order.OrderScreen
import com.lancar.courier.ui.screens.pod.ProofOfDeliveryScreen
import com.lancar.courier.ui.theme.Primary

/**
 * Main Screen - Dashboard for the Courier App
 * 
 * Shows available orders and notification status.
 * This is the entry point after notification handling.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(navController: NavHostController? = null) {
    var selectedTab by remember { mutableStateOf(0) }
    var showPodScreen by remember { mutableStateOf(false) }
    var showOrderDetail by remember { mutableStateOf(false) }
    var selectedOrder by remember { mutableStateOf<Order?>(null) }
    
    // Handle PoD screen
    if (showPodScreen && selectedOrder != null) {
        ProofOfDeliveryScreen(
            orderId = selectedOrder!!.orderId,
            onImageConfirmed = { uri ->
                // Handle the confirmed PoD image
                // In production, this would upload to backend
                showPodScreen = false
                selectedOrder = null
            },
            onBack = {
                showPodScreen = false
                selectedOrder = null
            }
        )
        return
    }
    
    // Handle Order Detail screen
    if (showOrderDetail && selectedOrder != null) {
        OrderDetailScreen(
            order = selectedOrder!!,
            onBack = {
                showOrderDetail = false
                selectedOrder = null
            },
            onUpdateStatus = { newStatus ->
                // Update order status
                // In production, this would update locally and sync with backend
                selectedOrder = selectedOrder?.copy(status = newStatus)
            },
            onCapturePod = {
                showOrderDetail = false
                showPodScreen = true
            }
        )
        return
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Text(
                        text = "LANCAR Courier",
                        fontWeight = FontWeight.Bold
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                ),
                actions = {
                    IconButton(onClick = { /* Notifications */ }) {
                        Icon(
                            imageVector = Icons.Default.Notifications,
                            contentDescription = "Notifications",
                            tint = MaterialTheme.colorScheme.onPrimary
                        )
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                    label = { Text("Home") },
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.LocalShipping, contentDescription = "Orders") },
                    label = { Text("Orders") },
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Person, contentDescription = "Profile") },
                    label = { Text("Profile") },
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 }
                )
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when (selectedTab) {
                0 -> HomeContent(
                    onCapturePod = { orderId ->
                        selectedOrder = createDemoOrder(orderId)
                        showPodScreen = true
                    },
                    onViewOrders = { selectedTab = 1 }
                )
                1 -> OrdersContent(
                    onOrderClick = { order ->
                        selectedOrder = order
                        showOrderDetail = true
                    },
                    onSync = { /* Sync orders */ }
                )
                2 -> ProfileContent()
            }
        }
    }
}

@Composable
private fun HomeContent(
    onCapturePod: (String) -> Unit,
    onViewOrders: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Welcome, Courier!",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Push notifications are enabled for new order assignments.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(16.dp))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                StatCard(title = "Today", value = "0")
                StatCard(title = "Pending", value = "0")
                StatCard(title = "Completed", value = "0")
            }
        }
    }
    
    // Quick PoD capture for demo
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Quick Actions",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = { onCapturePod("DEMO-ORDER-001") },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.CameraAlt, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("Capture Proof of Delivery")
            }
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = onViewOrders,
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text("View Orders")
            }
        }
    }
}

@Composable
private fun StatCard(title: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            style = MaterialTheme.typography.headlineLarge,
            fontWeight = FontWeight.Bold,
            color = Primary
        )
        Text(
            text = title,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun OrdersContent(
    onOrderClick: (Order) -> Unit,
    onSync: () -> Unit
) {
    val demoOrders = listOf(
        createDemoOrder("ORD-2024-001"),
        createDemoOrder("ORD-2024-002"),
        createDemoOrder("ORD-2024-003")
    )
    
    OrderScreen(
        orders = demoOrders,
        onOrderClick = onOrderClick,
        onSync = onSync
    )
}

@Composable
private fun ProfileContent() {
    Column {
        Text(
            text = "Courier Profile",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Text(text = "Name: Courier", style = MaterialTheme.typography.bodyLarge)
                Text(text = "Status: Online", style = MaterialTheme.typography.bodyMedium)
                Text(text = "FCM: Connected", style = MaterialTheme.typography.bodySmall)
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = "Offline Queue: Ready", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun createDemoOrder(orderId: String): Order {
    return Order(
        orderId = orderId,
        pickupAddress = "Jl. Sudirman No. 123, Jakarta",
        pickupTime = "14:00",
        dropAddress = "Jl. Gatot Subroto, Jakarta",
        distance = "5.2 km",
        fee = "Rp 25,000",
        customerName = "John Doe",
        status = "assigned"
    )
}
