package com.tembus.courier.ui.screens

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Badge
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.tembus.courier.data.model.Order
import com.tembus.courier.R

/**
 * Regular courier bottom navigation (non-on-demand).
 * Extracted from MainScreen.kt to reduce god-file complexity.
 * 2026-08-30.
 */
@Composable
internal fun MainScreenBottomNavBar(
    selectedTab: Int,
    pendingOrders: List<Order>,
    onTabChange: (Int) -> Unit,
) {
    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
        NavigationBarItem(
            icon = { Icon(Icons.Default.Home, contentDescription = stringResource(R.string.courier_tab_home)) },
            label = { Text(stringResource(R.string.courier_tab_home)) },
            selected = selectedTab == 0,
            onClick = { onTabChange(0) }
        )
        NavigationBarItem(
            icon = {
                BadgedBox(badge = {
                    if (pendingOrders.isNotEmpty()) Badge { Text("${pendingOrders.size}") }
                }) { Icon(Icons.Default.LocalShipping, contentDescription = stringResource(R.string.courier_tab_orders)) }
            },
            label = { Text(stringResource(R.string.courier_tab_orders)) },
            selected = selectedTab == 1,
            onClick = { onTabChange(1) }
        )
        NavigationBarItem(
            icon = { Icon(Icons.Default.Person, contentDescription = stringResource(R.string.courier_tab_profile)) },
            label = { Text(stringResource(R.string.courier_tab_profile)) },
            selected = selectedTab == 2,
            onClick = { onTabChange(2) }
        )
    }
}
