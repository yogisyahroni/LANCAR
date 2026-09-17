package com.tembus.customer.ui.screens.main

import android.Manifest
import android.app.Activity
import android.os.Build
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalSharedTransitionApi
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import com.tembus.customer.ui.components.TembusServiceIcons
import com.tembus.customer.ui.designsystem.TembusBottomNavigation
import com.tembus.customer.ui.designsystem.TembusNavigationItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.tembus.customer.R
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.featureflag.FeatureFlagManager
import com.tembus.customer.ui.experience.DynamicHomeRenderer
import com.tembus.customer.domain.config.shouldRenderLegacyGlobalBanner
import com.tembus.customer.ui.navigation.RemoteDeepLinkTarget
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.AccentLight
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.CustomerHeroEnd
import com.tembus.customer.ui.theme.CustomerHeroStart
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryDark
import com.tembus.customer.ui.theme.PrimaryLight
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.SecondaryLight
import com.tembus.customer.ui.theme.Success
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.util.CustomerNetworkRecoveryBanner
import com.tembus.customer.util.rememberNetworkAvailable
import kotlinx.coroutines.delay

internal val Ink @Composable get() = MaterialTheme.colorScheme.onSurface
internal val Muted @Composable get() = MaterialTheme.colorScheme.onSurfaceVariant
internal val LcGreen @Composable get() = MaterialTheme.colorScheme.primary
internal val LcGreenDark @Composable get() = MaterialTheme.colorScheme.onPrimaryContainer
internal val SoftGreen @Composable get() = MaterialTheme.colorScheme.primaryContainer
internal val SoftBlue @Composable get() = MaterialTheme.colorScheme.secondaryContainer
internal val SoftOrange @Composable get() = MaterialTheme.colorScheme.tertiaryContainer
internal val SurfaceLine @Composable get() = MaterialTheme.colorScheme.outline

@Composable
private fun HomeStatusBarIcons() {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
}

@OptIn(ExperimentalPermissionsApi::class, ExperimentalMaterial3Api::class, ExperimentalSharedTransitionApi::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    onNotificationsClick: () -> Unit = {},
    onBookingClick: (String?) -> Unit = {},
    onTrackingClick: (String) -> Unit = {},
    onChatClick: (String) -> Unit = {},
    onHistoryClick: () -> Unit = {},
    onBusinessClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
    onHomeClick: () -> Unit = {},
    onFoodClick: () -> Unit = {},
    onIncomingClick: () -> Unit = {},
    onSearchClick: () -> Unit = {},
    onRemoteAction: (RemoteDeepLinkTarget) -> Unit = {},
) {
    HomeStatusBarIcons()

    val customerName by viewModel.customerName.collectAsState()
    val activeOrders by viewModel.activeOrders.collectAsState()
    val incomingPackages by viewModel.incomingPackages.collectAsState()
    val dataError by viewModel.dataError.collectAsState()
    val notificationUnreadCount by viewModel.notificationUnreadCount.collectAsState()
    val notificationUnreadByCategory by viewModel.notificationUnreadByCategory.collectAsState()
    val banners by viewModel.banners.collectAsState()
    val services by viewModel.services.collectAsState()
    val experienceSnapshot by viewModel.experienceSnapshot.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val isOnline by rememberNetworkAvailable()
    val featureFlags by FeatureFlagManager.snapshot.collectAsState()
    val foodEntryEnabled = featureFlags["customer_food_entry"]?.enabled ?: true
    val visibleServices = if (foodEntryEnabled) services else services.filterNot {
        it.code.equals("food", ignoreCase = true) || it.code.equals("food_delivery", ignoreCase = true)
    }
    val showLegacyGlobalBanner = shouldRenderLegacyGlobalBanner(experienceSnapshot)
    val hasUnreadMessages = (notificationUnreadByCategory["message"] ?: 0) > 0
    val notificationPermissionState = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        rememberPermissionState(Manifest.permission.POST_NOTIFICATIONS)
    } else {
        null
    }
    var showNotificationPermissionPrompt by rememberSaveable { mutableStateOf(true) }
    val shouldShowNotificationPermissionPrompt = notificationPermissionState != null &&
        !notificationPermissionState.status.isGranted &&
        showNotificationPermissionPrompt

    var isRefreshing by remember { mutableStateOf(false) }
    var slowNetwork by remember { mutableStateOf(false) }

    LaunchedEffect(isLoading) {
        slowNetwork = false
        if (isLoading) {
            delay(5_000L)
            slowNetwork = true
        }
    }

    if (isRefreshing) {
        LaunchedEffect(Unit) {
            viewModel.refreshData()
            isRefreshing = false
        }
    }

    var selectedDestination by rememberSaveable { mutableStateOf("home") }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val useNavigationRail = maxWidth >= 600.dp
        SharedTransitionLayout(Modifier.fillMaxSize()) {
            Scaffold(
                containerColor = MaterialTheme.colorScheme.background,
                bottomBar = {
                    if (!useNavigationRail) {
                        CustomerNavigation(
                            selectedDestination = selectedDestination,
                            onSelect = { selectedDestination = it },
                            useNavigationRail = false,
                            onHomeClick = onHomeClick,
                            onHistoryClick = onHistoryClick,
                            onBusinessClick = onBusinessClick,
                            onProfileClick = onProfileClick
                        )
                    }
                }
            ) { paddingValues ->
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(bottom = paddingValues.calculateBottomPadding())
                ) {
                    if (useNavigationRail) {
                        CustomerNavigation(
                            selectedDestination = selectedDestination,
                            onSelect = { selectedDestination = it },
                            useNavigationRail = true,
                            onHomeClick = onHomeClick,
                            onHistoryClick = onHistoryClick,
                            onBusinessClick = onBusinessClick,
                            onProfileClick = onProfileClick
                        )
                    }
                    PullToRefreshBox(
                        isRefreshing = isRefreshing,
                        onRefresh = { isRefreshing = true },
                        modifier = Modifier.weight(1f).fillMaxHeight()
                    ) {
            Box(modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = 30.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    item {
                        val heroSection = experienceSnapshot.manifest.sections
                            .firstOrNull { it.enabled && it.component == "hero_banner" }

                        UnifiedHeroHeader(
                            customerName = customerName.orEmpty().ifBlank { "Pelanggan" },
                            notificationUnreadCount = notificationUnreadCount,
                            heroSection = heroSection,
                            manifestRevision = experienceSnapshot.manifest.revision,
                            marketCode = experienceSnapshot.scope?.marketCode ?: experienceSnapshot.manifest.marketCode,
                            manifestId = experienceSnapshot.manifest.manifestId,
                            resolveAssetPath = { assetId -> viewModel.resolveExperienceAsset(experienceSnapshot, assetId) },
                            onNotificationsClick = onNotificationsClick,
                            onProfileClick = onProfileClick,
                            onSearchClick = onSearchClick,
                            onBookingClick = onBookingClick,
                            onRemoteAction = onRemoteAction,
                            onBannerEvent = viewModel::recordExperienceBannerEvent,
                            networkBanner = {
                                CustomerNetworkRecoveryBanner(
                                    isOnline = isOnline,
                                    isSlow = slowNetwork || (isOnline && dataError != null),
                                    isRetrying = isLoading,
                                    onRetry = viewModel::refreshData,
                                )
                            }
                        )
                    }

                    item {
                        val hasCustomServiceGrid = experienceSnapshot.manifest.sections
                            .any { it.enabled && it.component == "service_grid" }

                        if (!hasCustomServiceGrid) {
                            TembusHomeServiceGrid(
                                onPickupClick = { onBookingClick("pickup") }, // Gabung ambil/kirim
                                onFoodClick = onFoodClick,
                                showFood = foodEntryEnabled,
                                onAggregatorClick = { onBookingClick("aggregator") },
                                onTambalBanClick = { onBookingClick("tambal_ban") },
                                onTowingClick = { onBookingClick("towing") }
                            )
                        }

                        if (experienceSnapshot.manifest.sections.isNotEmpty()) {
                            DynamicHomeRenderer(
                                snapshot = experienceSnapshot,
                                services = visibleServices,
                                onServiceClick = { serviceCode ->
                                    if (foodEntryEnabled ||
                                        (!serviceCode.equals("food", ignoreCase = true) && !serviceCode.equals("food_delivery", ignoreCase = true))) {
                                        onBookingClick(serviceCode)
                                    }
                                },
                                onRemoteAction = onRemoteAction,
                                onBannerEvent = viewModel::recordExperienceBannerEvent,
                                resolveAssetPath = { assetId -> viewModel.resolveExperienceAsset(experienceSnapshot, assetId) },
                                onHistoryClick = onHistoryClick,
                                onFavoritesClick = { onBookingClick("food_favorites") },
                                excludeHeroBanner = true,
                            )
                        }
                    }

                    if (activeOrders.isNotEmpty()) {
                        item {
                            CompactActiveOrdersSummaryCard(
                                orders = activeOrders,
                                hasUnreadMessage = hasUnreadMessages,
                                onTrackingClick = onTrackingClick,
                                onViewAllClick = onHistoryClick,
                            )
                        }
                    }

                    item {
                        if (incomingPackages.isNotEmpty()) {
                            IncomingPackagesSection(
                                packages = incomingPackages,
                                hasUnreadMessage = hasUnreadMessages,
                                onTrackingClick = onTrackingClick,
                                onChatClick = onChatClick,
                                onViewAllClick = onIncomingClick,
                            )
                        }
                    }

                // A4: global banner (pengumuman in-app platform-wide dari super_admin).
                if (showLegacyGlobalBanner && banners.isNotEmpty()) {
                    item {
                        GlobalBannerCard(banners = banners)
                    }
                }

                if (shouldShowNotificationPermissionPrompt) {
                    item {
                        NotificationPermissionPromptCard(
                            onEnable = { notificationPermissionState?.launchPermissionRequest() },
                            onDismiss = { showNotificationPermissionPrompt = false }
                        )
                    }
                }

                dataError?.let { message ->
                    item {
                        DashboardDataErrorCard(
                            message = message,
                            onRetry = viewModel::refreshData
                        )
                    }
                }
            }
                    }
                }
            }
        }
    }
}
}

@OptIn(ExperimentalSharedTransitionApi::class)
@Composable
private fun SharedTransitionScope.CustomerNavigation(
    selectedDestination: String,
    onSelect: (String) -> Unit,
    useNavigationRail: Boolean,
    onHomeClick: () -> Unit,
    onHistoryClick: () -> Unit,
    onBusinessClick: () -> Unit,
    onProfileClick: () -> Unit
) {
    data class NavItem(val key: String, val label: String, val icon: ImageVector, val onClick: () -> Unit)
    val items = listOf(
        NavItem("home", "Beranda", Icons.Default.LocalShipping, onHomeClick),
        NavItem("history", "Riwayat", Icons.Default.History, onHistoryClick),
        NavItem("business", "Bisnis", Icons.Default.Store, onBusinessClick),
        NavItem("profile", "Profil", Icons.Default.Person, onProfileClick)
    )
    AnimatedContent(targetState = selectedDestination, label = "customer-navigation-selection") { selected ->
        if (useNavigationRail) {
            NavigationRail(Modifier.fillMaxHeight()) {
                items.forEach { item ->
                    NavigationRailItem(
                        selected = selected == item.key,
                        onClick = { onSelect(item.key); item.onClick() },
                        icon = {
                            Icon(
                                item.icon,
                                contentDescription = item.label,
                                modifier = if (selected == item.key) Modifier.sharedElement(
                                    rememberSharedContentState("customer-selected-tab-icon"),
                                    this@AnimatedContent
                                ) else Modifier
                            )
                        },
                        label = { Text(item.label) }
                    )
                }
            }
        } else {
            TembusBottomNavigation(
                items = items.map { item ->
                    TembusNavigationItem(
                        label = item.label,
                        icon = item.icon,
                        selected = selected == item.key,
                        onClick = { onSelect(item.key); item.onClick() },
                    )
                },
            )
        }
    }
}

