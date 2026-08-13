package com.tembus.customer.ui.navigation

import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tembus.customer.data.model.NotificationRealtimeEvent
import com.tembus.customer.data.session.SessionInvalidationReason
import com.tembus.customer.ui.MainViewModel
import com.tembus.customer.ui.screens.auth.AuthNavGraph
import com.tembus.customer.ui.screens.booking.BookingScreen
import com.tembus.customer.ui.screens.booking.BookingViewModel
import com.tembus.customer.ui.screens.call.InAppCallScreen
import com.tembus.customer.ui.screens.call.InAppCallState
import com.tembus.customer.ui.screens.chat.ChatScreen
import com.tembus.customer.ui.screens.chat.ChatViewModel
import com.tembus.customer.ui.screens.detail.OrderDetailScreen
import com.tembus.customer.ui.screens.detail.OrderDetailViewModel
import com.tembus.customer.ui.screens.food.FoodCartScreen
import com.tembus.customer.ui.screens.food.FoodCheckoutScreen
import com.tembus.customer.ui.screens.food.FoodHomeScreen
import com.tembus.customer.ui.screens.food.MerchantDetailScreen
import com.tembus.customer.ui.screens.history.OrderHistoryScreen
import com.tembus.customer.ui.screens.history.OrderHistoryViewModel
import com.tembus.customer.ui.screens.main.DashboardScreen
import com.tembus.customer.ui.screens.notifications.NotificationCenterScreen
import com.tembus.customer.ui.screens.onboarding.OnboardingScreen
import com.tembus.customer.ui.screens.payment.PaymentScreen
import com.tembus.customer.ui.screens.payment.PaymentViewModel
import com.tembus.customer.ui.screens.profile.ProfileScreen
import com.tembus.customer.ui.screens.profile.ProfileViewModel
import com.tembus.customer.ui.screens.service.NearbyCouriersScreen
import com.tembus.customer.ui.screens.service.ServiceBookingScreen
import com.tembus.customer.ui.screens.service.ServiceCategoryScreen
import com.tembus.customer.ui.screens.service.ServiceReportScreen
import com.tembus.customer.ui.screens.service.ServiceTrackingScreen
import com.tembus.customer.ui.screens.service.SubTypeSelectorScreen
import com.tembus.customer.ui.security.SecureScreenEffect
import com.tembus.customer.ui.screens.rating.CourierRatingViewModel
import com.tembus.customer.ui.screens.rating.MerchantRatingViewModel
import com.tembus.customer.ui.screens.tip.TipViewModel
import com.tembus.customer.ui.screens.tracking.TrackingScreen
import com.tembus.customer.ui.screens.tracking.TrackingViewModel
import kotlinx.coroutines.delay

@Composable
fun RootNavGraph(
    navController: NavHostController = rememberNavController(),
    viewModel: MainViewModel = hiltViewModel(),
    initialDeepLink: Uri? = null,
    onDeepLinkConsumed: () -> Unit = {}
) {
    val isLoading by viewModel.isLoading.collectAsState()
    val startDestination by viewModel.startDestination.collectAsState()
    val sessionInvalidationReason by viewModel.sessionInvalidationReason.collectAsState()
    val context = LocalContext.current
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStackEntry?.destination?.route
    var foregroundNotification by remember { mutableStateOf<NotificationRealtimeEvent?>(null) }
    val lastHandledDeepLink = remember { mutableStateOf<String?>(null) }

    LaunchedEffect(initialDeepLink?.toString()) {
        val deepLink = initialDeepLink ?: return@LaunchedEffect
        val key = deepLink.toString()
        if (lastHandledDeepLink.value == key) return@LaunchedEffect
        lastHandledDeepLink.value = key

        val path = deepLink.pathSegments
        when {
            path.size >= 3 && path[0] == "orders" && path[2] == "chat" -> {
                val orderId = path[1]
                if (orderId.isNotBlank()) {
                    navController.navigate(Screen.Chat.createRoute(orderId, null)) { launchSingleTop = true }
                }
            }
            path.size >= 3 && path[0] == "orders" && path[2] == "tracking" -> {
                val orderId = path[1]
                if (orderId.isNotBlank()) {
                    navController.navigate(Screen.Tracking.createRoute(orderId)) { launchSingleTop = true }
                }
            }
        }
        onDeepLinkConsumed()
    }

    val secureScreenRequired = currentRoute in setOf(
        Screen.AuthGraph.route,
        Screen.Booking.route,
        Screen.Profile.route,
        Screen.Notifications.route,
        Screen.OrderDetail.route,
        Screen.Payment.route,
        Screen.Tracking.route,
        Screen.Chat.route,
        Screen.InAppCall.route,
        Screen.History.route,
        Screen.ServiceCategory.route,
        Screen.SubTypeSelector.route,
        Screen.ServiceBooking.route,
        Screen.ServiceTracking.route,
        Screen.ServiceReport.route,
    )
    SecureScreenEffect(enabled = secureScreenRequired)

    if (isLoading) return

    LaunchedEffect(startDestination) {
        if (startDestination == Screen.AuthGraph.route && navController.currentDestination?.route != Screen.AuthGraph.route) {
            navController.navigate(Screen.AuthGraph.route) { popUpTo(0) { inclusive = true } }
        }
    }

    LaunchedEffect(sessionInvalidationReason) {
        if (sessionInvalidationReason == SessionInvalidationReason.TOKEN_EXPIRED) {
            Toast.makeText(context, "Sesi kamu sudah berakhir. Silakan masuk kembali.", Toast.LENGTH_LONG).show()
            viewModel.consumeSessionInvalidationNotice()
        }
    }

    LaunchedEffect(Unit) {
        viewModel.incomingCallInvites.collect { invite ->
            navController.navigate(Screen.InAppCall.createRoute(invite.orderId, invite.callerName, "incoming", invite.callId)) {
                launchSingleTop = true
            }
        }
    }

    LaunchedEffect(Unit) {
        viewModel.foregroundNotifications.collect { event ->
            foregroundNotification = event
        }
    }

    LaunchedEffect(foregroundNotification?.id, foregroundNotification?.createdAt) {
        if (foregroundNotification != null) {
            delay(5_200)
            foregroundNotification = null
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        NavHost(
            navController = navController,
            startDestination = startDestination
        ) {
            composable(Screen.Onboarding.route) {
                OnboardingScreen(
                    onComplete = {
                        val nextRoute = viewModel.completeOnboarding()
                        navController.navigate(nextRoute) {
                            popUpTo(Screen.Onboarding.route) { inclusive = true }
                            launchSingleTop = true
                        }
                    }
                )
            }

            composable(Screen.AuthGraph.route) {
                AuthNavGraph(
                    onAuthSuccess = {
                        navController.navigate(Screen.Dashboard.route) {
                            popUpTo(Screen.AuthGraph.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.Dashboard.route) {
                DashboardScreen(
                    onNotificationsClick = { navController.navigate(Screen.Notifications.route) },
                    onBookingClick = { open ->
                        when (open) {
                            "tambal_ban_motor", "tambal_ban_mobil", "towing_motor", "towing_mobil" -> navController.navigate(Screen.ServiceBooking.createRoute(open))
                            "tambal_ban", "towing" -> navController.navigate(Screen.ServiceCategory.route)
                            "food_delivery" -> navController.navigate(Screen.FoodHome.route)
                            else -> navController.navigate(Screen.Booking.createRoute(open))
                        }
                    },
                    onTrackingClick = { orderId -> navController.navigate(Screen.Tracking.createRoute(orderId)) },
                    onChatClick = { orderId -> navController.navigate(Screen.Chat.createRoute(orderId, null)) },
                    onHistoryClick = { navController.navigate(Screen.History.route) },
                    onBusinessClick = { navController.navigate(Screen.Business.route) },
                    onProfileClick = { navController.navigate(Screen.Profile.route) }
                )
            }

            composable(Screen.FoodHome.route) {
                val context = LocalContext.current
                var userLat by remember { mutableStateOf<Double?>(null) }
                var userLng by remember { mutableStateOf<Double?>(null) }
                LaunchedEffect(Unit) {
                    val fused = LocationServices.getFusedLocationProviderClient(context)
                    try {
                        fused.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
                            .addOnSuccessListener { loc ->
                                if (loc != null) {
                                    userLat = loc.latitude
                                    userLng = loc.longitude
                                }
                            }
                            .addOnFailureListener {
                                userLat = -6.2088
                                userLng = 106.8456
                            }
                    } catch (_: Exception) {
                        userLat = -6.2088
                        userLng = 106.8456
                    }
                }
                val lat = userLat ?: -6.2088
                val lng = userLng ?: 106.8456
                FoodHomeScreen(
                    initialLat = lat,
                    initialLng = lng,
                    onBack = { navController.popBackStack() },
                    onMerchantClick = { merchantId -> navController.navigate(Screen.FoodMerchantDetail.createRoute(merchantId)) },
                    onCartClick = { navController.navigate(Screen.FoodCart.route) }
                )
            }

            composable(
                route = Screen.FoodMerchantDetail.route,
                arguments = listOf(navArgument("merchantId") { type = NavType.StringType })
            ) { backStackEntry ->
                val merchantId = backStackEntry.arguments?.getString("merchantId").orEmpty()
                MerchantDetailScreen(
                    merchantId = merchantId,
                    onBack = { navController.popBackStack() },
                    onCartClick = { navController.navigate(Screen.FoodCart.route) }
                )
            }

            composable(Screen.FoodCart.route) {
                FoodCartScreen(
                    onBack = { navController.popBackStack() },
                    onCheckout = { navController.navigate(Screen.FoodCheckout.route) }
                )
            }

            composable(Screen.FoodCheckout.route) {
                FoodCheckoutScreen(
                    onBack = { navController.popBackStack() },
                    onOrderCreated = { orderId ->
                        navController.navigate(Screen.Tracking.createRoute(orderId)) {
                            popUpTo(Screen.Dashboard.route)
                        }
                    }
                )
            }

            composable(
                route = Screen.Booking.route,
                arguments = listOf(
                    navArgument("open") { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument("promo") { type = NavType.StringType; nullable = true; defaultValue = null }
                ),
                deepLinks = listOf(navDeepLink { uriPattern = "tembus://booking?promo={promo}" })
            ) { backStackEntry ->
                val initialOpen = backStackEntry.arguments?.getString("open")
                val initialPromoCode = backStackEntry.arguments?.getString("promo")
                val bookingViewModel: BookingViewModel = hiltViewModel()
                BookingScreen(
                    viewModel = bookingViewModel,
                    initialOpen = initialOpen,
                    initialPromoCode = initialPromoCode,
                    onBackClick = { navController.popBackStack() },
                    onBookingSuccess = { orderId ->
                        navController.navigate(Screen.Payment.createRoute(orderId)) {
                            popUpTo(Screen.Dashboard.route)
                        }
                    }
                )
            }

            composable(Screen.History.route) {
                val historyViewModel: OrderHistoryViewModel = hiltViewModel()
                OrderHistoryScreen(
                    viewModel = historyViewModel,
                    onBackClick = { navController.popBackStack() },
                    onOrderClick = { orderId -> navController.navigate(Screen.OrderDetail.createRoute(orderId)) },
                    onReorderNavigate = { navController.navigate(Screen.FoodCart.route) }
                )
            }

            composable(Screen.ServiceCategory.route) {
                ServiceCategoryScreen(
                    onBackClick = { navController.popBackStack() },
                    onCategorySelected = { category -> navController.navigate(Screen.SubTypeSelector.createRoute(category)) }
                )
            }

            composable(
                route = Screen.SubTypeSelector.route,
                arguments = listOf(navArgument("category") { type = NavType.StringType })
            ) { backStackEntry ->
                val category = backStackEntry.arguments?.getString("category") ?: "tambal_ban"
                SubTypeSelectorScreen(
                    category = category,
                    onBackClick = { navController.popBackStack() },
                    onSubTypeSelected = { subType -> navController.navigate(Screen.ServiceBooking.createRoute(subType)) }
                )
            }

            composable(
                route = Screen.ServiceBooking.route,
                arguments = listOf(
                    navArgument("serviceSubType") { type = NavType.StringType },
                    navArgument("courierId") { type = NavType.StringType; nullable = true; defaultValue = null },
                    navArgument("courierPrice") { type = NavType.StringType; nullable = true; defaultValue = null }
                )
            ) { backStackEntry ->
                val serviceSubType = backStackEntry.arguments?.getString("serviceSubType") ?: "tambal_ban_motor"
                val courierId = backStackEntry.arguments?.getString("courierId")
                val courierPrice = backStackEntry.arguments?.getString("courierPrice")?.toLongOrNull()
                ServiceBookingScreen(
                    serviceSubType = serviceSubType,
                    courierId = courierId,
                    courierPrice = courierPrice,
                    onBackClick = { navController.popBackStack() },
                    onSelectCourierClick = { lat, lng -> navController.navigate(Screen.NearbyCouriers.createRoute(serviceSubType, lat, lng)) },
                    onBookingSuccess = { orderId ->
                        navController.navigate(Screen.ServiceTracking.createRoute(orderId, serviceSubType)) {
                            popUpTo(Screen.Dashboard.route)
                        }
                    }
                )
            }

            composable(
                route = Screen.NearbyCouriers.route,
                arguments = listOf(
                    navArgument("serviceSubType") { type = NavType.StringType },
                    navArgument("lat") { type = NavType.StringType },
                    navArgument("lng") { type = NavType.StringType }
                )
            ) { backStackEntry ->
                val serviceSubType = backStackEntry.arguments?.getString("serviceSubType") ?: ""
                val lat = backStackEntry.arguments?.getString("lat")?.toDoubleOrNull() ?: 0.0
                val lng = backStackEntry.arguments?.getString("lng")?.toDoubleOrNull() ?: 0.0
                NearbyCouriersScreen(
                    serviceSubType = serviceSubType,
                    customerLat = lat,
                    customerLng = lng,
                    onBackClick = { navController.popBackStack() },
                    onCourierSelected = { courierId, price ->
                        navController.navigate(Screen.ServiceBooking.createRoute(serviceSubType, courierId, price))
                    }
                )
            }

            composable(Screen.Notifications.route) {
                NotificationCenterScreen(
                    onBackClick = { navController.popBackStack() },
                    onOpenChat = { orderId -> navController.navigate(Screen.Chat.createRoute(orderId, null)) },
                    onOpenOrder = { orderId -> navController.navigate(Screen.OrderDetail.createRoute(orderId)) },
                    onOpenPromo = { promoCode -> navController.navigate(Screen.Booking.createRoute(open = null, promoCode = promoCode)) },
                    onOpenSupport = { /* handled in screen */ }
                )
            }

            composable(Screen.OrderDetail.route, arguments = listOf(navArgument("orderId") { type = NavType.StringType })) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                val detailViewModel: OrderDetailViewModel = hiltViewModel()
                OrderDetailScreen(
                    orderId = orderId,
                    viewModel = detailViewModel,
                    onBackClick = { navController.popBackStack() },
                    onTrackClick = { navController.navigate(Screen.Tracking.createRoute(it)) },
                    onChatClick = { id, name -> navController.navigate(Screen.Chat.createRoute(id, name)) }
                )
            }

            composable(Screen.Tracking.route, arguments = listOf(navArgument("orderId") { type = NavType.StringType }), deepLinks = listOf(navDeepLink { uriPattern = "tembus://orders/{orderId}/tracking" })) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                val trackingViewModel: TrackingViewModel = hiltViewModel()
                val courierRatingViewModel: CourierRatingViewModel = hiltViewModel()
                val merchantRatingViewModel: MerchantRatingViewModel = hiltViewModel()
                val tipViewModel: TipViewModel = hiltViewModel()
                TrackingScreen(
                    orderId = orderId,
                    viewModel = trackingViewModel,
                    onBackClick = { navController.popBackStack() },
                    onChatClick = { id, name -> navController.navigate(Screen.Chat.createRoute(id, name)) },
                    onCallClick = { id, name -> navController.navigate(Screen.InAppCall.createRoute(id, name, "outgoing")) },
                    ratingViewModel = courierRatingViewModel,
                    merchantRatingViewModel = merchantRatingViewModel,
                    tipViewModel = tipViewModel
                )
            }

            composable(Screen.Chat.route, arguments = listOf(navArgument("orderId") { type = NavType.StringType }, navArgument("name") { type = NavType.StringType; nullable = true; defaultValue = "" }), deepLinks = listOf(navDeepLink { uriPattern = "tembus://orders/{orderId}/chat" })) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                val rawName = backStackEntry.arguments?.getString("name") ?: ""
                val courierName = if (rawName.isNotBlank()) java.net.URLDecoder.decode(rawName, "UTF-8") else null
                val chatVm: ChatViewModel = hiltViewModel()
                ChatScreen(orderId = orderId, courierName = courierName, onInAppCallClick = { navController.navigate(Screen.InAppCall.createRoute(orderId, courierName, "outgoing")) }, onBackClick = { navController.popBackStack() }, onOrderDetailClick = { detailOrderId -> navController.navigate(Screen.OrderDetail.createRoute(detailOrderId)) }, viewModel = chatVm)
            }

            composable(Screen.InAppCall.route, arguments = listOf(navArgument("orderId") { type = NavType.StringType }, navArgument("name") { type = NavType.StringType; nullable = true; defaultValue = "" }, navArgument("state") { type = NavType.StringType; nullable = true; defaultValue = "outgoing" }, navArgument("callId") { type = NavType.StringType; nullable = true; defaultValue = "" })) { backStackEntry ->
                val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
                val rawName = backStackEntry.arguments?.getString("name") ?: ""
                val rawState = backStackEntry.arguments?.getString("state") ?: "outgoing"
                val rawCallId = backStackEntry.arguments?.getString("callId") ?: ""
                val targetName = if (rawName.isNotBlank()) java.net.URLDecoder.decode(rawName, "UTF-8") else null
                InAppCallScreen(orderId = orderId, targetName = targetName, initialState = InAppCallState.fromRoute(rawState), routeCallId = rawCallId.takeIf { it.isNotBlank() }, onBackClick = { navController.popBackStack() }, onOpenChat = { navController.navigate(Screen.Chat.createRoute(orderId, targetName)) { popUpTo(Screen.InAppCall.route) { inclusive = true } } })
            }
        }

        ForegroundNotificationBanner(
            notification = foregroundNotification,
            visible = foregroundNotification != null && currentRoute != Screen.Chat.route,
            onDismiss = { foregroundNotification = null },
            onOpen = { event ->
                foregroundNotification = null
                openForegroundNotification(navController, event)
            },
            modifier = Modifier.align(Alignment.TopCenter)
        )
    }
}

private fun openForegroundNotification(
    navController: NavHostController,
    event: NotificationRealtimeEvent
) {
    val orderId = event.orderId.orEmpty()
    val deepLink = event.deepLink.orEmpty()
    val promoCode = runCatching { Uri.parse(deepLink).getQueryParameter("promo") }.getOrNull()

    when {
        event.category == "message" && orderId.isNotBlank() -> {
            navController.navigate(Screen.Chat.createRoute(orderId, null)) { launchSingleTop = true }
        }
        deepLink.contains("/chat") && orderId.isNotBlank() -> {
            navController.navigate(Screen.Chat.createRoute(orderId, null)) { launchSingleTop = true }
        }
        event.category == "activity" && orderId.isNotBlank() -> {
            navController.navigate(Screen.Tracking.createRoute(orderId)) { launchSingleTop = true }
        }
        deepLink.startsWith("tembus://booking") -> {
            navController.navigate(Screen.Booking.createRoute(open = null, promoCode = promoCode)) { launchSingleTop = true }
        }
        event.category == "promo" -> {
            navController.navigate(Screen.Booking.createRoute(open = null, promoCode = promoCode)) { launchSingleTop = true }
        }
        else -> {
            navController.navigate(Screen.Notifications.route) { launchSingleTop = true }
        }
    }
}

@Composable
private fun ForegroundNotificationBanner(
    notification: NotificationRealtimeEvent?,
    visible: Boolean,
    onDismiss: () -> Unit,
    onOpen: (NotificationRealtimeEvent) -> Unit,
    modifier: Modifier = Modifier
) {
    AnimatedVisibility(
        visible = visible && notification != null,
        enter = slideInVertically(initialOffsetY = { -it }) + fadeIn(),
        exit = slideOutVertically(targetOffsetY = { -it }) + fadeOut(),
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        val event = notification ?: return@AnimatedVisibility
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onOpen(event) },
            shape = RoundedCornerShape(22.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = BorderStroke(1.dp, Color(0xFFE2E8F0)),
            elevation = CardDefaults.cardElevation(defaultElevation = 10.dp)
        ) {
            Row(
                modifier = Modifier.padding(14.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(
                            when (event.category) {
                                "message" -> Color(0xFFE8F6EE)
                                "promo" -> Color(0xFFFFF3E3)
                                else -> Color(0xFFEAF2FF)
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = when (event.category) {
                            "message" -> Icons.Default.ChatBubbleOutline
                            "promo" -> Icons.Default.LocalOffer
                            else -> Icons.Default.NotificationsActive
                        },
                        contentDescription = null,
                        tint = when (event.category) {
                            "promo" -> Color(0xFFFF7A00)
                            else -> Color(0xFF0D5C2F)
                        }
                    )
                }
                androidx.compose.foundation.layout.Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        event.title,
                        color = Color(0xFF111827),
                        fontSize = 14.sp,
                        fontWeight = FontWeight.ExtraBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        event.body.ifBlank { "Buka untuk melihat detail terbaru." },
                        color = Color(0xFF64748B),
                        fontSize = 12.sp,
                        lineHeight = 16.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Text(
                    "Buka",
                    color = Color(0xFF0D5C2F),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .clickable { onOpen(event) }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                )
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(CircleShape)
                        .clickable { onDismiss() },
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.Close, contentDescription = null, tint = Color(0xFF94A3B8), modifier = Modifier.size(16.dp))
                }
            }
        }
    }
}
