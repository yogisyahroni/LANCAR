package com.tembus.merchant.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.ui.screens.dashboard.DashboardScreen
import com.tembus.merchant.ui.screens.home.HomeScreen
import com.tembus.merchant.ui.screens.menu.MenuScreen
import com.tembus.merchant.ui.screens.profile.ProfileScreen
import com.tembus.merchant.ui.screens.report.ReportScreen
import com.tembus.merchant.ui.screens.staff.StaffScreen
import com.tembus.merchant.ui.theme.NavBackground
import kotlinx.coroutines.launch

private data class MainTab(val label: String, val icon: ImageVector, val key: String)

@Composable
fun MainScreen(
    merchantRepository: MerchantRepository,
    onOpenStruk: (String) -> Unit,
    onOpenChat: (String, String) -> Unit, // FB-119
    onCallCustomer: (String) -> Unit, // FB-124: telepon pelanggan
    onOpenVariants: (String) -> Unit, // FB-108
    onOpenEditOrder: (String) -> Unit, // FB-087
    onGoToRegistration: () -> Unit
) {
    // X1/M1: ambil profil → merchantId + isCorporate (conditional tab Staff).
    var merchantId by rememberSaveable { mutableStateOf("") }
    var isCorporate by rememberSaveable { mutableStateOf(false) }
    var profileLoaded by rememberSaveable { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        scope.launch {
            merchantRepository.getProfile()
                .onSuccess { m: Merchant ->
                    merchantId = m.id
                    isCorporate = m.isCorporate
                    profileLoaded = true
                }
                .onFailure { profileLoaded = true }
        }
    }

    // Tab dasar selalu ada.
    val baseTabs = listOf(
        MainTab("Dashboard", Icons.Filled.Home, "dashboard"),
        MainTab("Pesanan", Icons.Filled.ReceiptLong, "orders"),
        MainTab("Menu", Icons.Filled.RestaurantMenu, "menu"),
        MainTab("Laporan", Icons.Filled.Assessment, "report"),
        MainTab("Profil", Icons.Filled.Person, "profile")
    )
    // M1: tab Staff HANYA untuk corporate (perusahaan). Individual TIDAK punya.
    val staffTab = MainTab("Staff", Icons.Filled.Groups, "staff")
    val tabs = if (isCorporate) baseTabs + staffTab else baseTabs

    var selectedTab by rememberSaveable { mutableStateOf(0) }
    // Jaga agar index valid saat tab Staff hilang (berubah corporate→individual jarang,
    // tapi amankan agar tidak out-of-range).
    val safeSelected = if (selectedTab >= tabs.size) 0 else selectedTab

    Column(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.weight(1f)) {
            when (tabs[safeSelected].key) {
                "dashboard" -> DashboardScreen(
                    onGoToOrders = { selectedTab = 1 },
                    onOpenStruk = onOpenStruk,
                    onOpenChat = onOpenChat, // FB-119
                    onGoToRegistration = onGoToRegistration
                )
                "orders" -> HomeScreen(
                    onOpenStruk = onOpenStruk,
                    onOpenChat = onOpenChat, // FB-119
                    onCallCustomer = onCallCustomer, // FB-124
                    onOpenEditOrder = onOpenEditOrder, // FB-087
                    onGoToRegistration = onGoToRegistration
                )
                "menu" -> MenuScreen(onOpenVariants = onOpenVariants) // FB-108
                "report" -> ReportScreen()
                "profile" -> ProfileScreen(
                    onGoToRegistration = onGoToRegistration,
                    onLoggedOut = { /* logout di-handle NavHost via session flow */ }
                )
                "staff" -> StaffScreen(
                    merchantId = merchantId,
                    repository = merchantRepository
                )
            }
        }

        NavigationBar(containerColor = NavBackground) {
            tabs.forEachIndexed { index, tab ->
                NavigationBarItem(
                    selected = safeSelected == index,
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
