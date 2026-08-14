package com.tembus.merchant.ui.navigation

import android.content.Intent
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.tembus.merchant.TEMBUSApplication
import com.tembus.merchant.ui.AppViewModelFactory
import com.tembus.merchant.ui.MainScreen
import com.tembus.merchant.ui.screens.auth.LoginScreen
import com.tembus.merchant.ui.screens.chat.ChatScreen
import com.tembus.merchant.ui.screens.chat.ChatViewModel
import com.tembus.merchant.ui.screens.onboarding.OnboardingScreen
import com.tembus.merchant.ui.screens.registration.RegistrationScreen
import com.tembus.merchant.ui.screens.staff.StaffAcceptScreen
import com.tembus.merchant.ui.screens.staff.StaffAcceptViewModel
import com.tembus.merchant.ui.screens.staff.StaffScreen
import com.tembus.merchant.ui.screens.staff.StaffViewModel
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.ui.screens.menu.VariantEditorScreen
import com.tembus.merchant.ui.screens.menu.VariantEditorViewModel
import com.tembus.merchant.ui.screens.struk.StrukScreen
import com.tembus.merchant.ui.screens.home.EditOrderScreen
import kotlinx.coroutines.launch

object MerchantRoutes {
    const val LOGIN = "login"
    const val ONBOARDING = "onboarding"
    const val MAIN = "main"
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

    val isLoggedIn by app.container.sessionManager.isLoggedIn.collectAsState(initial = false)
    val onboardingDone by app.container.onboardingPreferences.onboardingCompleted
        .collectAsState(initial = false)

    // Redirect otomatis berdasarkan state sesi + onboarding
    LaunchedEffect(isLoggedIn, onboardingDone) {
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
                if (current != MerchantRoutes.MAIN) {
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
                    navController.navigate(MerchantRoutes.struk(orderId))
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
                // FB-108: editor varian menu item.
                onOpenVariants = { menuItemId ->
                    navController.navigate(MerchantRoutes.variants(menuItemId))
                },
                // FB-087: edit item order food (pending_merchant).
                onOpenEditOrder = { orderId ->
                    navController.navigate(MerchantRoutes.editOrder(orderId))
                },
                onGoToRegistration = {
                    navController.navigate(MerchantRoutes.REGISTRATION)
                }
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
            arguments = listOf(navArgument("menuItemId") { type = NavType.StringType })
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
