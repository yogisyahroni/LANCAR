package com.tembus.merchant.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import com.tembus.merchant.ui.localization.MerchantText as Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.key
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import com.tembus.merchant.R
import com.tembus.merchant.data.repository.ExperienceConfigRepository
import com.tembus.merchant.featureflag.FeatureFlagManager
import com.tembus.merchant.ui.components.MerchantExperienceSlot
import com.tembus.merchant.ui.screens.home.MerchantHomeDashboardScreen
import com.tembus.merchant.ui.screens.home.StitchOrdersDashboardScreen
import com.tembus.merchant.ui.screens.menu.ManageMenuZipScreen
import com.tembus.merchant.ui.screens.profile.StoreProfileZipScreen
import com.tembus.merchant.ui.screens.settlement.SettlementZipScreen
import com.tembus.merchant.util.MerchantNetworkRecoveryBanner
import com.tembus.merchant.util.rememberNetworkAvailable

private data class MainTab(val labelRes: Int, val icon: ImageVector, val key: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(
    experienceConfigRepository: ExperienceConfigRepository,
    onOpenStruk: (String) -> Unit,
    onOpenChat: (String, String) -> Unit, // FB-119
    onCallCustomer: (String) -> Unit, // FB-124: telepon pelanggan
    onOpenNotifications: () -> Unit,
    onOpenSettlement: () -> Unit,
    onOpenStoreInformation: () -> Unit,
    onOpenPaymentSettings: () -> Unit,
    onOpenOperatingHours: () -> Unit,
    onOpenEditPublicProfile: () -> Unit,
    onOpenCustomerReviews: () -> Unit,
    onOpenEnforcement: () -> Unit,
    onOpenOrderHistory: () -> Unit,
    onOpenLanguage: () -> Unit,
    onOpenCreatePromo: () -> Unit,
    onOpenAds: () -> Unit,
    onOpenCreateMenu: () -> Unit,
    onOpenEditMenu: (String) -> Unit,
    onGoToRegistration: () -> Unit,
    onOpenStaff: () -> Unit,
    onOpenIntegrations: () -> Unit
) {
    val featureFlags by FeatureFlagManager.snapshot.collectAsState()
    val menuEntryEnabled = featureFlags["merchant_menu_entry"]?.enabled ?: true
    val isOnline by rememberNetworkAvailable()
    var networkRetryNonce by rememberSaveable { mutableStateOf(0) }
    var slowNetwork by rememberSaveable { mutableStateOf(false) }
    var isRetrying by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(networkRetryNonce) {
        if (networkRetryNonce == 0) return@LaunchedEffect
        isRetrying = true
        slowNetwork = false
        delay(5_000L)
        slowNetwork = isOnline
        isRetrying = false
    }

    // Tab dasar mengikuti beranda merchant: Beranda, Pesanan, Menu, Keuangan, Akun.
    val baseTabs = listOf(
        MainTab(R.string.merchant_tab_home, Icons.Filled.Home, "home"),
        MainTab(R.string.merchant_tab_orders, Icons.Filled.ReceiptLong, "orders"),
        *if (menuEntryEnabled) arrayOf(MainTab(R.string.merchant_tab_menu, Icons.Filled.RestaurantMenu, "menu")) else emptyArray(),
        MainTab(R.string.merchant_tab_insights, Icons.Filled.Assessment, "report"),
        MainTab(R.string.merchant_tab_profile, Icons.Filled.Storefront, "profile")
    )
    // Staff management is a Profile destination, not a sixth bottom tab.
    // This keeps the five-item navigation identical for individual and corporate merchants.
    val tabs = baseTabs

    var selectedTab by rememberSaveable { mutableStateOf(0) }
    val safeSelected = if (selectedTab >= tabs.size) 0 else selectedTab

    val renderScreen: @Composable () -> Unit = {
        when (tabs[safeSelected].key) {
                "home" -> MerchantHomeDashboardScreen(
                    onOpenOrders = {
                        selectedTab = tabs.indexOfFirst { it.key == "orders" }.coerceAtLeast(0)
                    },
                    onOpenOrder = onOpenStruk,
                    onOpenNotifications = onOpenNotifications,
                    onOpenMenu = {
                        val menuIndex = tabs.indexOfFirst { it.key == "menu" }
                        if (menuIndex >= 0) selectedTab = menuIndex else onOpenCreateMenu()
                    },
                    onOpenSettlement = onOpenSettlement,
                    onOpenReviews = onOpenCustomerReviews,
                    onOpenProfile = {
                        selectedTab = tabs.indexOfFirst { it.key == "profile" }.coerceAtLeast(0)
                    }
                )
                "orders" -> StitchOrdersDashboardScreen(
                    onOpenOrder = onOpenStruk,
                    onOpenNotifications = onOpenNotifications,
                    onOpenChat = onOpenChat,
                    onCallCustomer = onCallCustomer
                )
                "menu" -> ManageMenuZipScreen(
                    onOpenAddMenu = onOpenCreateMenu,
                    onOpenEditMenu = onOpenEditMenu,
                    onOpenOperatingHours = onOpenOperatingHours,
                    onOpenCreatePromo = onOpenCreatePromo,
                    onOpenNotifications = onOpenNotifications
                )
                "report" -> SettlementZipScreen(
                    onOpenNotifications = onOpenNotifications,
                    onOpenProfile = {
                        selectedTab = tabs.indexOfFirst { it.key == "profile" }.coerceAtLeast(0)
                    },
                    onOpenBankSettings = onOpenPaymentSettings
                )
                "profile" -> StoreProfileZipScreen(
                    onOpenNotifications = onOpenNotifications,
                    onOpenStoreInformation = onOpenStoreInformation,
                    onOpenOperatingHours = onOpenOperatingHours,
                    onOpenPaymentSettings = onOpenPaymentSettings,
                    onOpenEditPublicProfile = onOpenEditPublicProfile,
                    onOpenCustomerReviews = onOpenCustomerReviews,
                    onOpenEnforcement = onOpenEnforcement,
                    onOpenOrderHistory = onOpenOrderHistory,
                    onOpenLanguage = onOpenLanguage,
                    onOpenStaff = onOpenStaff,
                    onOpenIntegrations = onOpenIntegrations,
                    onGoToRegistration = onGoToRegistration
                )
            }
    }

    @Composable
    fun MerchantMainContent() {
        Column {
            // Experience cards belong to Beranda. Rendering this slot above
            // every tab reserves vertical space before operational headers.
            if (tabs[safeSelected].key == "home") {
                MerchantExperienceSlot(experienceConfigRepository, Modifier.padding(12.dp))
            }
            MerchantNetworkRecoveryBanner(
                isOnline = isOnline,
                isSlow = !isOnline || slowNetwork,
                isRetrying = isRetrying,
                onRetry = { networkRetryNonce += 1 },
            )
            Box(Modifier.weight(1f)) {
                key(networkRetryNonce) { renderScreen() }
            }
        }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val useNavigationRail = maxWidth >= 600.dp
        // Keep navigation lifecycle-local. SharedTransitionLayout retained
        // Compose snapshot observers after activity recreation in debug builds
        // (LeakCanary reported MainActivity -> SharedTransitionObserverDelegate).
        Box(modifier = Modifier.fillMaxSize()) {
            if (useNavigationRail) {
                Row(Modifier.fillMaxSize()) {
                    MerchantNavigation(
                        tabs = tabs,
                        selectedTab = safeSelected,
                        onSelect = { selectedTab = it },
                        useNavigationRail = true
                    )
                    Box(Modifier.weight(1f).fillMaxHeight()) {
                        MerchantMainContent()
                    }
                }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.weight(1f)) {
                        MerchantMainContent()
                    }
                    MerchantNavigation(
                        tabs = tabs,
                        selectedTab = safeSelected,
                        onSelect = { selectedTab = it },
                        useNavigationRail = false
                    )
                }
            }
        }
    }
}

@Composable
private fun MerchantNavigation(
    tabs: List<MainTab>,
    selectedTab: Int,
    onSelect: (Int) -> Unit,
    useNavigationRail: Boolean
) {
    // Keep the selected-state animation local to the navigation bar. A shared
    // element is unnecessary here and can outlive MainActivity on recreation.
    AnimatedContent(targetState = selectedTab, label = "merchant-navigation-selection") { selected ->
        if (useNavigationRail) {
            NavigationRail(modifier = Modifier.fillMaxHeight()) {
                tabs.forEachIndexed { index, tab ->
                    NavigationRailItem(
                        selected = selected == index,
                        onClick = { onSelect(index) },
                        icon = {
                            Icon(
                                tab.icon,
                                contentDescription = stringResource(tab.labelRes),
                                modifier = Modifier
                            )
                        },
                        label = { Text(stringResource(tab.labelRes)) }
                    )
                }
            }
        } else {
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding(),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(68.dp)
                        .padding(horizontal = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(2.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    tabs.forEachIndexed { index, tab ->
                        val isSelected = selected == index
                        val itemColor = if (isSelected) {
                            com.tembus.merchant.ui.theme.Accent
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        }
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clickable(onClick = { onSelect(index) })
                                .padding(vertical = 5.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(2.dp)
                        ) {
                            Icon(
                                tab.icon,
                                contentDescription = stringResource(tab.labelRes),
                                tint = itemColor,
                                modifier = Modifier.size(21.dp)
                            )
                            Text(
                                stringResource(tab.labelRes),
                                color = itemColor,
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }
    }
}
