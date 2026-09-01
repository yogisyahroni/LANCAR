package com.tembus.merchant.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import com.tembus.merchant.ui.localization.MerchantText as Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.tembus.merchant.R
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.ui.screens.home.StitchOrdersDashboardScreen
import com.tembus.merchant.ui.screens.menu.ManageMenuZipScreen
import com.tembus.merchant.ui.screens.profile.StoreProfileZipScreen
import com.tembus.merchant.ui.screens.report.BusinessInsightsZipScreen
import com.tembus.merchant.ui.screens.staff.StaffScreen
import kotlinx.coroutines.launch

private data class MainTab(val labelRes: Int, val icon: ImageVector, val key: String)

@OptIn(ExperimentalSharedTransitionApi::class)
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
    onOpenLanguage: () -> Unit,
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
        MainTab(R.string.merchant_tab_orders, Icons.Filled.ReceiptLong, "orders"),
        MainTab(R.string.merchant_tab_menu, Icons.Filled.RestaurantMenu, "menu"),
        MainTab(R.string.merchant_tab_insights, Icons.Filled.Assessment, "report"),
        MainTab(R.string.merchant_tab_profile, Icons.Filled.Storefront, "profile")
    )
    // M1: tab Staff HANYA untuk corporate (perusahaan). Individual TIDAK punya.
    val staffTab = MainTab(R.string.merchant_tab_staff, Icons.Filled.Groups, "staff")
    val tabs = if (isCorporate) baseTabs + staffTab else baseTabs

    var selectedTab by rememberSaveable { mutableStateOf(0) }
    // Jaga agar index valid saat tab Staff hilang (berubah corporate→individual jarang,
    // tapi amankan agar tidak out-of-range).
    val safeSelected = if (selectedTab >= tabs.size) 0 else selectedTab

    val renderScreen: @Composable () -> Unit = {
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
                    onOpenLanguage = onOpenLanguage,
                    onGoToRegistration = onGoToRegistration
                )
                "staff" -> StaffScreen(
                    merchantId = merchantId,
                    repository = merchantRepository
                )
            }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val useNavigationRail = maxWidth >= 600.dp
        SharedTransitionLayout(modifier = Modifier.fillMaxSize()) {
            if (useNavigationRail) {
                Row(Modifier.fillMaxSize()) {
                    MerchantNavigation(
                        tabs = tabs,
                        selectedTab = safeSelected,
                        onSelect = { selectedTab = it },
                        useNavigationRail = true
                    )
                    Box(Modifier.weight(1f).fillMaxHeight()) { renderScreen() }
                }
            } else {
                Column(modifier = Modifier.fillMaxSize()) {
                    Box(modifier = Modifier.weight(1f)) { renderScreen() }
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

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun SharedTransitionScope.MerchantNavigation(
    tabs: List<MainTab>,
    selectedTab: Int,
    onSelect: (Int) -> Unit,
    useNavigationRail: Boolean
) {
    // AnimatedContent keeps the outgoing and incoming selected icons in the
    // same SharedTransitionLayout, so the selection visibly travels between
    // destinations instead of simply fading at its old position.
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
                                modifier = if (selected == index) Modifier.sharedElement(
                                    rememberSharedContentState("merchant-selected-tab-icon"),
                                    this@AnimatedContent
                                ) else Modifier
                            )
                        },
                        label = { Text(stringResource(tab.labelRes)) }
                    )
                }
            }
        } else {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
                tonalElevation = 1.dp
            ) {
                tabs.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        selected = selected == index,
                        onClick = { onSelect(index) },
                        icon = {
                            Icon(
                                tab.icon,
                                contentDescription = stringResource(tab.labelRes),
                                modifier = if (selected == index) Modifier.sharedElement(
                                    rememberSharedContentState("merchant-selected-tab-icon"),
                                    this@AnimatedContent
                                ) else Modifier
                            )
                        },
                        label = { Text(stringResource(tab.labelRes)) },
                        colors = com.tembus.merchant.ui.theme.TembusComponentDefaults.bottomNavItemColors()
                    )
                }
            }
        }
    }
}
