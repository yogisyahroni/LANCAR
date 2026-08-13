package com.tembus.merchant.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.tembus.merchant.ui.screens.dashboard.DashboardScreen
import com.tembus.merchant.ui.screens.home.HomeScreen
import com.tembus.merchant.ui.screens.menu.MenuScreen
import com.tembus.merchant.ui.screens.profile.ProfileScreen
import com.tembus.merchant.ui.screens.report.ReportScreen
import com.tembus.merchant.ui.theme.NavBackground

private data class MainTab(val label: String, val icon: ImageVector)

private val tabs = listOf(
    MainTab("Dashboard", Icons.Filled.Home),
    MainTab("Pesanan", Icons.Filled.ReceiptLong),
    MainTab("Menu", Icons.Filled.RestaurantMenu),
    MainTab("Laporan", Icons.Filled.Assessment),
    MainTab("Profil", Icons.Filled.Person)
)

/**
 * MainScreen — container 5 tab: Dashboard / Pesanan / Menu / Laporan / Profil
 * (bottom navigation gelap, sesuai design merchant 2026).
 */
@Composable
fun MainScreen(
    onOpenStruk: (String) -> Unit,
    onOpenChat: (String, String) -> Unit, // FB-119
    onCallCustomer: (String) -> Unit, // FB-124: telepon pelanggan
    onOpenVariants: (String) -> Unit, // FB-108
    onOpenEditOrder: (String) -> Unit, // FB-087
    onGoToRegistration: () -> Unit
) {
    var selectedTab by rememberSaveable { mutableStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.weight(1f)) {
            when (selectedTab) {
                0 -> DashboardScreen(
                    onGoToOrders = { selectedTab = 1 },
                    onOpenStruk = onOpenStruk,
                    onOpenChat = onOpenChat, // FB-119
                    onGoToRegistration = onGoToRegistration
                )
                1 -> HomeScreen(
                    onOpenStruk = onOpenStruk,
                    onOpenChat = onOpenChat, // FB-119
                    onCallCustomer = onCallCustomer, // FB-124
                    onOpenEditOrder = onOpenEditOrder, // FB-087
                    onGoToRegistration = onGoToRegistration
                )
                2 -> MenuScreen(onOpenVariants = onOpenVariants) // FB-108
                3 -> ReportScreen()
                4 -> ProfileScreen(
                    onGoToRegistration = onGoToRegistration,
                    onLoggedOut = { /* logout di-handle NavHost via session flow */ }
                )
            }
        }

        NavigationBar(containerColor = NavBackground) {
            tabs.forEachIndexed { index, tab ->
                NavigationBarItem(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    icon = { Icon(tab.icon, contentDescription = tab.label) },
                    label = { Text(tab.label) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = MaterialTheme.colorScheme.primary,
                        selectedTextColor = MaterialTheme.colorScheme.primary,
                        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                )
            }
        }
    }
}
