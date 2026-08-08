package com.tembus.merchant.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.tembus.merchant.ui.screens.home.HomeScreen
import com.tembus.merchant.ui.screens.menu.MenuScreen
import com.tembus.merchant.ui.screens.profile.ProfileScreen
import com.tembus.merchant.ui.screens.promo.PromoScreen

private data class MainTab(val label: String, val icon: ImageVector)

private val tabs = listOf(
    MainTab("Pesanan", Icons.Filled.Home),
    MainTab("Menu", Icons.Filled.RestaurantMenu),
    MainTab("Promo", Icons.Filled.LocalOffer),
    MainTab("Profil", Icons.Filled.Person)
)

/**
 * MainScreen — container 4 tab: Pesanan / Menu / Promo / Profil (bottom navigation).
 */
@Composable
fun MainScreen(
    onOpenStruk: (String) -> Unit,
    onGoToRegistration: () -> Unit
) {
    var selectedTab by rememberSaveable { mutableStateOf(0) }

    Column(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.weight(1f)) {
            when (selectedTab) {
                0 -> HomeScreen(
                    onOpenStruk = onOpenStruk,
                    onGoToRegistration = onGoToRegistration
                )
                1 -> MenuScreen()
                2 -> PromoScreen()
                3 -> ProfileScreen(
                    onGoToRegistration = onGoToRegistration,
                    onLoggedOut = { /* logout di-handle NavHost via session flow */ }
                )
            }
        }

        NavigationBar {
            tabs.forEachIndexed { index, tab ->
                NavigationBarItem(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    icon = { Icon(tab.icon, contentDescription = tab.label) },
                    label = { Text(tab.label) }
                )
            }
        }
    }
}
