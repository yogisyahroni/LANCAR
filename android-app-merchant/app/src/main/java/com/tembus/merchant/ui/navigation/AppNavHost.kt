package com.tembus.merchant.ui.navigation

import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.tembus.merchant.TEMBUSApplication
import com.tembus.merchant.ui.MainScreen
import com.tembus.merchant.ui.screens.auth.LoginScreen
import com.tembus.merchant.ui.screens.onboarding.OnboardingScreen
import com.tembus.merchant.ui.screens.registration.RegistrationScreen
import com.tembus.merchant.ui.screens.struk.StrukScreen
import kotlinx.coroutines.launch

object MerchantRoutes {
    const val LOGIN = "login"
    const val ONBOARDING = "onboarding"
    const val MAIN = "main"
    const val STRUK = "struk/{orderId}"
    const val REGISTRATION = "registration"

    fun struk(orderId: String) = "struk/$orderId"
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
            MainScreen(
                onOpenStruk = { orderId ->
                    navController.navigate(MerchantRoutes.struk(orderId))
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

        composable(MerchantRoutes.REGISTRATION) {
            RegistrationScreen(
                onBack = { navController.popBackStack() },
                onRegistered = { navController.popBackStack() }
            )
        }
    }
}
