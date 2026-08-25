package com.tembus.courier.ui.screens

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.tembus.courier.data.model.Order

// Extracted from MainScreen.kt (god-file refactor): bottom navigation for non-on_demand couriers.
@Composable
internal fun MainBottomNav(
    selectedTab: Int,
    pendingOrders: List<Order>,
    onSelectTab: (Int) -> Unit
) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        NavigationBarItem(
            icon = { Icon(Icons.Default.Home, contentDescription = "Beranda") },
            label = { Text("Beranda") },
            selected = selectedTab == 0,
            onClick = { onSelectTab(0) }
        )
        NavigationBarItem(
            icon = {
                BadgedBox(
                    badge = {
                        if (pendingOrders.isNotEmpty()) {
                            Badge { Text("${pendingOrders.size}") }
                        }
                    }
                ) {
                    Icon(Icons.Default.LocalShipping, contentDescription = "Order")
                }
            },
            label = { Text("Order") },
            selected = selectedTab == 1,
            onClick = { onSelectTab(1) }
        )
        NavigationBarItem(
            icon = { Icon(Icons.Default.Person, contentDescription = "Profil") },
            label = { Text("Profil") },
            selected = selectedTab == 2,
            onClick = { onSelectTab(2) }
        )
    }
}
