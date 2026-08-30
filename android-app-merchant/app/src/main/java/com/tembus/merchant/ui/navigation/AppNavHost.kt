package com.tembus.merchant.ui.navigation

import android.net.Uri
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.tembus.merchant.TEMBUSApplication
import com.tembus.merchant.ui.AppViewModelFactory
import com.tembus.merchant.ui.MainScreen
import com.tembus.merchant.ui.screens.auth.LoginScreen
import com.tembus.merchant.ui.screens.chat.ChatScreen
import com.tembus.merchant.ui.screens.chat.ChatViewModel
import com.tembus.merchant.ui.screens.home.StitchOrdersDashboardScreen
import com.tembus.merchant.ui.screens.onboarding.OnboardingScreen
import com.tembus.merchant.ui.screens.menu.ManageMenuZipScreen
import com.tembus.merchant.ui.screens.menu.MenuEditorZipScreen
import com.tembus.merchant.ui.screens.profile.NotificationsZipScreen
import com.tembus.merchant.ui.screens.profile.OrderHistoryZipScreen
import com.tembus.merchant.ui.screens.profile.CustomerReviewsScreen
import com.tembus.merchant.ui.screens.profile.EditPublicProfileScreen
import com.tembus.merchant.ui.screens.profile.OperatingHoursScreen
import com.tembus.merchant.ui.screens.profile.StoreProfileZipScreen
import com.tembus.merchant.ui.screens.profile.PaymentSettingsZipScreen
import com.tembus.merchant.ui.screens.profile.StoreInformationZipScreen
import com.tembus.merchant.ui.screens.settlement.SettlementZipScreen
import com.tembus.merchant.ui.screens.promo.CreatePromoZipScreen
import com.tembus.merchant.ui.screens.report.BusinessInsightsZipScreen
import com.tembus.merchant.ui.screens.registration.RegistrationScreen
import com.tembus.merchant.ui.screens.staff.StaffAcceptScreen
import com.tembus.merchant.ui.screens.staff.StaffAcceptViewModel
import com.tembus.merchant.ui.screens.staff.StaffScreen
import com.tembus.merchant.ui.screens.staff.StaffViewModel
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.ui.screens.menu.VariantEditorScreen
import com.tembus.merchant.ui.screens.menu.VariantEditorViewModel
import com.tembus.merchant.ui.screens.struk.StrukScreen
import com.tembus.merchant.ui.screens.struk.OrderDetailMerchantZipScreen
import com.tembus.merchant.ui.screens.struk.OrderDetailCancelledZipScreen
import com.tembus.merchant.ui.screens.struk.OrderDetailRejectedZipScreen
import com.tembus.merchant.ui.screens.home.EditOrderScreen
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

object MerchantDeepLinkBus {
    private val _uri = MutableStateFlow<Uri?>(null)
    val uri = _uri.asStateFlow()

    fun publish(uri: Uri?) {
        if (uri?.scheme == "tembusmerchant" && uri.host == "merchant") {
            _uri.value = uri
        }
    }
}

object MerchantRoutes {
    const val LOGIN = "login"
    const val ONBOARDING = "onboarding"
    const val MAIN = "main"
    // ZIP inventory routes: these are the native Android targets for all
    // post-login ZIP screens. Splash/onboarding/login remain separate.
    const val ORDERS_DASHBOARD = "orders_dashboard"
    const val MANAGE_MENU = "manage_menu"
    const val BUSINESS_INSIGHTS = "business_insights"
    const val STORE_PROFILE = "store_profile"
    const val ORDER_HISTORY = "order_history"
    const val ORDER_DETAIL_CANCELLED = "order_detail_cancelled/{orderId}"
    const val ORDER_DETAIL_REJECTED = "order_detail_rejected/{orderId}"
    const val ORDER_DETAIL_MERCHANT = "order_detail_merchant/{orderId}"
    const val CREATE_PROMO = "create_promo"
    const val CUSTOMER_REVIEWS = "customer_reviews"
    const val PAYMENT_SETTINGS = "payment_settings"
    const val SETTLEMENTS = "settlements"
    const val NOTIFICATIONS = "notifications"
    const val OPERATING_HOURS = "operating_hours"
    const val EDIT_PUBLIC_PROFILE = "edit_public_profile"
    const val STORE_INFORMATION = "store_information"
    const val EDIT_MENU = "edit_menu/{menuId}"
    const val ADD_MENU = "add_menu"
    const val STRUK = "struk/{orderId}"
    const val REGISTRATION = "registration"
    // FB-119: chat customer↔merchant per order.
    const val CHAT = "chat/{orderId}/{orderNumber}"
    // FB-108: editor varian menu item.
    const val VARIANTS = "variants/{menuItemId}"
    // FB-087: edit item order food (pending_merchant).
    const val EDIT_ORDER = "edit_order/{orderId}"
    // M1: staff accept invite via token (query param).
    const val STAFF_ACCEPT = "staff/accept"

    fun struk(orderId: String) = "struk/$orderId"
    fun chat(orderId: String, orderNumber: String) = "chat/$orderId/$orderNumber"
    fun variants(menuItemId: String) = "variants/$menuItemId"
    fun editOrder(orderId: String) = "edit_order/$orderId"
    fun orderDetailCancelled(orderId: String) = "order_detail_cancelled/$orderId"
    fun orderDetailRejected(orderId: String) = "order_detail_rejected/$orderId"
    fun orderDetailMerchant(orderId: String) = "order_detail_merchant/$orderId"
    fun editMenu(menuId: String) = "edit_menu/$menuId"
}

private object MerchantZipDeepLinks {
    const val ORDERS_DASHBOARD = "tembusmerchant://merchant/orders/dashboard"
    const val MANAGE_MENU = "tembusmerchant://merchant/menu"
    const val BUSINESS_INSIGHTS = "tembusmerchant://merchant/insights"
    const val STORE_PROFILE = "tembusmerchant://merchant/profile"
    const val ORDER_HISTORY = "tembusmerchant://merchant/orders/history"
    const val ORDER_DETAIL_CANCELLED = "tembusmerchant://merchant/orders/{orderId}/cancelled"
    const val ORDER_DETAIL_REJECTED = "tembusmerchant://merchant/orders/{orderId}/rejected"
    const val ORDER_DETAIL_MERCHANT = "tembusmerchant://merchant/orders/{orderId}"
    const val CREATE_PROMO = "tembusmerchant://merchant/promo/create"
    const val CUSTOMER_REVIEWS = "tembusmerchant://merchant/profile/reviews"
    const val PAYMENT_SETTINGS = "tembusmerchant://merchant/profile/payment"
    const val NOTIFICATIONS = "tembusmerchant://merchant/profile/notifications"
    const val OPERATING_HOURS = "tembusmerchant://merchant/profile/hours"
    const val EDIT_PUBLIC_PROFILE = "tembusmerchant://merchant/profile/edit"
    const val STORE_INFORMATION = "tembusmerchant://merchant/profile/information"
    const val EDIT_MENU = "tembusmerchant://merchant/menu/{menuId}/edit"
    const val ADD_MENU = "tembusmerchant://merchant/menu/add"
    const val VARIANTS = "tembusmerchant://merchant/menu/{menuItemId}/variants"
}

/**
 * AppNavHost — alur navigasi:
 *   belum login → login
 *   login pertama → onboarding (wajib, sekali)
 *   setelah onboarding → main (3 tab)
 * Logout / token expired → kembali ke login (via session flow).
 */
@Composable
fun AppNavHost() {
    val context = LocalContext.current
    val app = context.applicationContext as TEMBUSApplication
    val navController = rememberNavController()
    val scope = rememberCoroutineScope()
    val incomingDeepLink by MerchantDeepLinkBus.uri.collectAsState()
    // Nilai ini menjaga target ketika URI dibuka sebelum autentikasi selesai
    // agar login tidak membuang route yang diminta pengguna.
    var pendingPostLoginRoute by rememberSaveable { mutableStateOf<String?>(null) }

    val isLoggedIn by app.container.sessionManager.isLoggedIn.collectAsState(initial = false)
    val onboardingDone by app.container.onboardingPreferences.onboardingCompleted
        .collectAsState(initial = false)

    // Redirect otomatis berdasarkan state sesi + onboarding
    LaunchedEffect(incomingDeepLink) {
        incomingDeepLink?.toMerchantZipRoute()?.let { pendingPostLoginRoute = it }
    }

    LaunchedEffect(isLoggedIn, onboardingDone, pendingPostLoginRoute) {
        val current = navController.currentDestination?.route
        when {
            !isLoggedIn -> {
                if (current != MerchantRoutes.LOGIN) {
                    navController.navigate(MerchantRoutes.LOGIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            }
            !onboardingDone -> {
                if (current != MerchantRoutes.ONBOARDING) {
                    navController.navigate(MerchantRoutes.ONBOARDING) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            }
            else -> {
                val pending = pendingPostLoginRoute
                if (pending != null) {
                    if (current != pending) {
                        navController.navigate(pending) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                    pendingPostLoginRoute = null
                    return@LaunchedEffect
                }
                // Jangan menimpa route ZIP dari app/deep link saat sesi sudah
                // valid. Redirect ke shell hanya diperlukan setelah login atau
                // onboarding selesai.
                if (current == null || current == MerchantRoutes.LOGIN || current == MerchantRoutes.ONBOARDING) {
                    navController.navigate(MerchantRoutes.MAIN) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            }
        }
    }

    NavHost(
        navController = navController,
        startDestination = MerchantRoutes.LOGIN
    ) {
        composable(MerchantRoutes.LOGIN) {
            LoginScreen(onLoginSuccess = { /* isLoggedIn flow memicu redirect */ })
        }

        composable(MerchantRoutes.ONBOARDING) {
            OnboardingScreen(
                onFinish = {
                    scope.launch {
                        app.container.onboardingPreferences.markOnboardingCompleted()
                    }
                }
            )
        }

        composable(MerchantRoutes.MAIN) {
            val context = LocalContext.current
            MainScreen(
                merchantRepository = app.container.merchantRepository,
                onOpenStruk = { orderId ->
                    navController.navigate(MerchantRoutes.orderDetailMerchant(orderId))
                },
                onOpenNotifications = {
                    navController.navigate(MerchantRoutes.NOTIFICATIONS)
                },
                onOpenStoreInformation = {
                    navController.navigate(MerchantRoutes.STORE_INFORMATION)
                },
                onOpenPaymentSettings = {
                    navController.navigate(MerchantRoutes.PAYMENT_SETTINGS)
                },
                onOpenOperatingHours = {
                    navController.navigate(MerchantRoutes.OPERATING_HOURS)
                },
                onOpenEditPublicProfile = {
                    navController.navigate(MerchantRoutes.EDIT_PUBLIC_PROFILE)
                },
                onOpenCustomerReviews = {
                    navController.navigate(MerchantRoutes.CUSTOMER_REVIEWS)
                },
                onOpenOrderHistory = {
                    navController.navigate(MerchantRoutes.ORDER_HISTORY)
                },
                onOpenCreatePromo = {
                    navController.navigate(MerchantRoutes.CREATE_PROMO)
                },
                onOpenCreateMenu = {
                    navController.navigate(MerchantRoutes.ADD_MENU)
                },
                onOpenEditMenu = { menuId ->
                    navController.navigate(MerchantRoutes.editMenu(menuId))
                },
                // FB-119: buka chat customer↔merchant.
                onOpenChat = { orderId, orderNumber ->
                    navController.navigate(MerchantRoutes.chat(orderId, orderNumber))
                },
                // FB-124: telepon pelanggan langsung dari order card.
                onCallCustomer = { phone ->
                    if (phone.isNotBlank()) {
                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                        ContextCompat.startActivity(context, intent, null)
                    }
                },
                onGoToRegistration = {
                    navController.navigate(MerchantRoutes.REGISTRATION)
                }
            )
        }

        // ZIP inventory routes. Each screen is addressable independently so
        // parity can be verified without relying on legacy local
        // boolean state or the legacy post-login fallback.
        composable(
            route = MerchantRoutes.ORDERS_DASHBOARD,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.ORDERS_DASHBOARD })
        ) {
            StitchOrdersDashboardScreen(
                onOpenOrder = { orderId -> navController.navigate(MerchantRoutes.orderDetailMerchant(orderId)) },
                onOpenNotifications = { navController.navigate(MerchantRoutes.NOTIFICATIONS) },
                onOpenChat = { orderId, orderNumber -> navController.navigate(MerchantRoutes.chat(orderId, orderNumber)) },
                onCallCustomer = { phone ->
                    if (phone.isNotBlank()) {
                        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))
                        ContextCompat.startActivity(context, intent, null)
                    }
                }
            )
        }

        composable(
            route = MerchantRoutes.MANAGE_MENU,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.MANAGE_MENU })
        ) {
            ManageMenuZipScreen(
                onOpenAddMenu = { navController.navigate(MerchantRoutes.ADD_MENU) },
                onOpenEditMenu = { menuId -> navController.navigate(MerchantRoutes.editMenu(menuId)) }
            )
        }

        composable(
            route = MerchantRoutes.BUSINESS_INSIGHTS,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.BUSINESS_INSIGHTS })
        ) {
            BusinessInsightsZipScreen(
                onOpenNotifications = { navController.navigate(MerchantRoutes.NOTIFICATIONS) },
                onOpenCreatePromo = { navController.navigate(MerchantRoutes.CREATE_PROMO) },
                onOpenCustomerReviews = { navController.navigate(MerchantRoutes.CUSTOMER_REVIEWS) }
            )
        }

        composable(
            route = MerchantRoutes.STORE_PROFILE,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.STORE_PROFILE })
        ) {
            StoreProfileZipScreen(
                onOpenNotifications = { navController.navigate(MerchantRoutes.NOTIFICATIONS) },
                onOpenStoreInformation = { navController.navigate(MerchantRoutes.STORE_INFORMATION) },
                onOpenOperatingHours = { navController.navigate(MerchantRoutes.OPERATING_HOURS) },
                onOpenPaymentSettings = { navController.navigate(MerchantRoutes.PAYMENT_SETTINGS) },
                onOpenEditPublicProfile = { navController.navigate(MerchantRoutes.EDIT_PUBLIC_PROFILE) },
                onOpenCustomerReviews = { navController.navigate(MerchantRoutes.CUSTOMER_REVIEWS) },
                onOpenOrderHistory = { navController.navigate(MerchantRoutes.ORDER_HISTORY) },
                onGoToRegistration = { navController.navigate(MerchantRoutes.REGISTRATION) }
            )
        }

        composable(
            route = MerchantRoutes.ORDER_HISTORY,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.ORDER_HISTORY })
        ) {
            OrderHistoryZipScreen(
                onBack = { navController.popBackStack() },
                onOpenNotifications = { navController.navigate(MerchantRoutes.NOTIFICATIONS) },
                onOpenOrder = { order ->
                    when {
                        order.status == "cancelled_by_merchant" || !order.rejectReason.isNullOrBlank() -> navController.navigate(MerchantRoutes.orderDetailRejected(order.id))
                        order.status == "cancelled" -> navController.navigate(MerchantRoutes.orderDetailCancelled(order.id))
                        else -> navController.navigate(MerchantRoutes.orderDetailMerchant(order.id))
                    }
                }
            )
        }

        composable(
            route = MerchantRoutes.ORDER_DETAIL_CANCELLED,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType }),
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.ORDER_DETAIL_CANCELLED })
        ) { backStackEntry ->
            OrderDetailCancelledZipScreen(
                orderId = backStackEntry.arguments?.getString("orderId").orEmpty(),
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = MerchantRoutes.ORDER_DETAIL_REJECTED,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType }),
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.ORDER_DETAIL_REJECTED })
        ) { backStackEntry ->
            OrderDetailRejectedZipScreen(
                orderId = backStackEntry.arguments?.getString("orderId").orEmpty(),
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = MerchantRoutes.ORDER_DETAIL_MERCHANT,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType }),
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.ORDER_DETAIL_MERCHANT })
        ) { backStackEntry ->
            OrderDetailMerchantZipScreen(
                orderId = backStackEntry.arguments?.getString("orderId").orEmpty(),
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = MerchantRoutes.CREATE_PROMO,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.CREATE_PROMO })
        ) {
            CreatePromoZipScreen(onBack = { navController.popBackStack() })
        }

        composable(
            route = MerchantRoutes.CUSTOMER_REVIEWS,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.CUSTOMER_REVIEWS })
        ) {
            CustomerReviewsScreen(onBack = { navController.popBackStack() })
        }

        composable(
            route = MerchantRoutes.PAYMENT_SETTINGS,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.PAYMENT_SETTINGS })
        ) {
            PaymentSettingsZipScreen(
                onBack = { navController.popBackStack() },
                onOpenSettlement = { navController.navigate(MerchantRoutes.SETTLEMENTS) }
            )
        }

        composable(MerchantRoutes.SETTLEMENTS) {
            SettlementZipScreen(onBack = { navController.popBackStack() })
        }

        composable(
            route = MerchantRoutes.NOTIFICATIONS,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.NOTIFICATIONS })
        ) {
            NotificationsZipScreen(
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = MerchantRoutes.OPERATING_HOURS,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.OPERATING_HOURS })
        ) {
            OperatingHoursScreen(onBack = { navController.popBackStack() })
        }

        composable(
            route = MerchantRoutes.EDIT_PUBLIC_PROFILE,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.EDIT_PUBLIC_PROFILE })
        ) {
            EditPublicProfileScreen(onBack = { navController.popBackStack() })
        }

        composable(
            route = MerchantRoutes.STORE_INFORMATION,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.STORE_INFORMATION })
        ) {
            StoreInformationZipScreen(
                onBack = { navController.popBackStack() },
                onEditPublicProfile = { navController.navigate(MerchantRoutes.EDIT_PUBLIC_PROFILE) }
            )
        }

        composable(
            route = MerchantRoutes.EDIT_MENU,
            arguments = listOf(navArgument("menuId") { type = NavType.StringType }),
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.EDIT_MENU })
        ) { backStackEntry ->
            MenuEditorZipScreen(
                menuId = backStackEntry.arguments?.getString("menuId"),
                onBack = { navController.popBackStack() },
                onOpenVariants = { menuId -> navController.navigate(MerchantRoutes.variants(menuId)) }
            )
        }

        composable(
            route = MerchantRoutes.ADD_MENU,
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.ADD_MENU })
        ) {
            MenuEditorZipScreen(
                menuId = null,
                onBack = { navController.popBackStack() },
                onOpenVariants = { menuId -> navController.navigate(MerchantRoutes.variants(menuId)) }
            )
        }

        composable(
            route = MerchantRoutes.STRUK,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType })
        ) { backStackEntry ->
            StrukScreen(
                orderId = backStackEntry.arguments?.getString("orderId").orEmpty(),
                onBack = { navController.popBackStack() }
            )
        }

        // FB-087: edit item order food (pending_merchant).
        composable(
            route = MerchantRoutes.EDIT_ORDER,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType })
        ) { backStackEntry ->
            EditOrderScreen(
                orderId = backStackEntry.arguments?.getString("orderId").orEmpty(),
                onBack = { navController.popBackStack() },
                onSaved = {
                    navController.popBackStack()
                }
            )
        }

        composable(MerchantRoutes.REGISTRATION) {
                    RegistrationScreen(
                        onBack = { navController.popBackStack() },
                        onRegistered = { navController.popBackStack() }
                    )
                }

                // M1: staff accept invite via token (query param ?token=xxx).
                composable(
                    route = MerchantRoutes.STAFF_ACCEPT,
                    arguments = listOf(
                        navArgument("token") { type = NavType.StringType; defaultValue = "" }
                    )
                ) { backStackEntry ->
                    val token = backStackEntry.arguments?.getString("token")?.trim() ?: ""
                    StaffAcceptScreen(
                        merchantRepository = app.container.merchantRepository,
                        onDone = { navController.popBackStack() },
                        initialToken = token
                    )
                }

                // FB-119: chat customer���merchant per order.
        composable(
            route = MerchantRoutes.CHAT,
            arguments = listOf(
                navArgument("orderId") { type = NavType.StringType },
                navArgument("orderNumber") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId").orEmpty()
            val orderNumber = backStackEntry.arguments?.getString("orderNumber").orEmpty()
            val chatViewModel: ChatViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                key = "chat-$orderId",
                factory = AppViewModelFactory {
                    ChatViewModel(
                        chatRepository = app.container.chatRepository,
                        sessionManager = app.container.sessionManager,
                        orderId = orderId
                    )
                }
            )
            ChatScreen(
                orderId = orderId,
                orderNumber = orderNumber,
                viewModel = chatViewModel,
                onBack = { navController.popBackStack() }
            )
        }

        // FB-108: editor varian menu item (dari tab Menu).
        composable(
            route = MerchantRoutes.VARIANTS,
            arguments = listOf(navArgument("menuItemId") { type = NavType.StringType }),
            deepLinks = listOf(navDeepLink { uriPattern = MerchantZipDeepLinks.VARIANTS })
        ) { backStackEntry ->
            val menuItemId = backStackEntry.arguments?.getString("menuItemId").orEmpty()
            val variantViewModel: VariantEditorViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                key = "variants-$menuItemId",
                factory = AppViewModelFactory {
                    VariantEditorViewModel(
                        merchantRepository = app.container.merchantRepository,
                        menuItemId = menuItemId
                    )
                }
            )
            VariantEditorScreen(
                viewModel = variantViewModel,
                onBack = { navController.popBackStack() }
            )
        }
    }
}

private fun Uri.toMerchantZipRoute(): String? {
    if (scheme != "tembusmerchant" || host != "merchant") return null
    val segment = pathSegments
    return when {
        segment == listOf("orders", "dashboard") -> MerchantRoutes.ORDERS_DASHBOARD
        segment == listOf("menu") -> MerchantRoutes.MANAGE_MENU
        segment == listOf("insights") -> MerchantRoutes.BUSINESS_INSIGHTS
        segment == listOf("profile") -> MerchantRoutes.STORE_PROFILE
        segment == listOf("orders", "history") -> MerchantRoutes.ORDER_HISTORY
        segment == listOf("promo", "create") -> MerchantRoutes.CREATE_PROMO
        segment == listOf("profile", "reviews") -> MerchantRoutes.CUSTOMER_REVIEWS
        segment == listOf("profile", "payment") -> MerchantRoutes.PAYMENT_SETTINGS
        segment == listOf("profile", "notifications") -> MerchantRoutes.NOTIFICATIONS
        segment == listOf("profile", "hours") -> MerchantRoutes.OPERATING_HOURS
        segment == listOf("profile", "edit") -> MerchantRoutes.EDIT_PUBLIC_PROFILE
        segment == listOf("profile", "information") -> MerchantRoutes.STORE_INFORMATION
        segment == listOf("menu", "add") -> MerchantRoutes.ADD_MENU
        segment.size == 3 && segment[0] == "orders" && segment[2] == "cancelled" -> MerchantRoutes.orderDetailCancelled(segment[1])
        segment.size == 3 && segment[0] == "orders" && segment[2] == "rejected" -> MerchantRoutes.orderDetailRejected(segment[1])
        segment.size == 2 && segment[0] == "orders" -> MerchantRoutes.orderDetailMerchant(segment[1])
        segment.size == 3 && segment[0] == "menu" && segment[2] == "edit" -> MerchantRoutes.editMenu(segment[1])
        segment.size == 3 && segment[0] == "menu" && segment[2] == "variants" -> MerchantRoutes.variants(segment[1])
        else -> null
    }
}
