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
import com.tembus.merchant.ui.screens.home.StitchOrdersDashboardScreen
import com.tembus.merchant.ui.screens.menu.ManageMenuZipScreen
import com.tembus.merchant.ui.screens.profile.StoreProfileZipScreen
import com.tembus.merchant.ui.screens.report.BusinessInsightsZipScreen
import com.tembus.merchant.ui.screens.staff.StaffScreen
import kotlinx.coroutines.launch

private data class MainTab(val label: String, val icon: ImageVector, val key: String)

@Composable
fun MainScreen(
    merchantRepository: MerchantRepository,
    onOpenStruk: (String) -> Unit,
    onOpenChat: (String, String) -> Unit, // FB-119
    onCallCustomer: (String) -> Unit, // FB-124: telepon pelanggan
    onOpenNotifications: () -> Unit,
    onOpenStoreInformation: () -> Unit,
    onOpenPaymentSettings: () -> Unit,
    onOpenOperatingHours: () -> Unit,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit,
    onOpenOrderHistory: () -> Unit,
    onOpenCreatePromo: () -> Unit,
    onOpenCreateMenu: () -> Unit,
    onOpenEditMenu: (String) -> Unit,
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

    // Tab dasar sesuai desain Stitch (4 tab utama)
    val baseTabs = listOf(
        MainTab("Pesanan", Icons.Filled.ReceiptLong, "orders"),
        MainTab("Menu", Icons.Filled.RestaurantMenu, "menu"),
        MainTab("Wawasan", Icons.Filled.Assessment, "report"),
        MainTab("Profil", Icons.Filled.Storefront, "profile")
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
                "orders" -> StitchOrdersDashboardScreen(
                    onOpenOrder = onOpenStruk,
                    onOpenNotifications = onOpenNotifications,
                    onOpenChat = onOpenChat,
                    onCallCustomer = onCallCustomer
                )
                "menu" -> ManageMenuZipScreen(
                    onOpenAddMenu = onOpenCreateMenu,
                    onOpenEditMenu = onOpenEditMenu
                )
                "report" -> BusinessInsightsZipScreen(
                    onOpenNotifications = onOpenNotifications,
                    onOpenCreatePromo = onOpenCreatePromo,
                    onOpenCustomerReviews = onOpenCustomerReviews
                )
                "profile" -> StoreProfileZipScreen(
                    onOpenNotifications = onOpenNotifications,
                    onOpenStoreInformation = onOpenStoreInformation,
                    onOpenOperatingHours = onOpenOperatingHours,
                    onOpenPaymentSettings = onOpenPaymentSettings,
                    onOpenEditPublicProfile = onOpenEditPublicProfile,
                    onOpenCustomerReviews = onOpenCustomerReviews,
                    onOpenOrderHistory = onOpenOrderHistory,
                    onGoToRegistration = onGoToRegistration
                )
                "staff" -> StaffScreen(
                    merchantId = merchantId,
                    repository = merchantRepository
                )
            }
        }

        NavigationBar(
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.onSurface,
            tonalElevation = 1.dp
        ) {
            tabs.forEachIndexed { index, tab ->
                NavigationBarItem(
                    selected = safeSelected == index,
                    onClick = { selectedTab = index },
                    icon = { Icon(tab.icon, contentDescription = tab.label) },
                    label = { Text(tab.label) },
                    colors = com.tembus.merchant.ui.theme.TembusComponentDefaults.bottomNavItemColors()
                )
            }
        }
    }
}
