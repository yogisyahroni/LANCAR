package com.tembus.customer.ui.screens.auth

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

@Composable
fun AuthNavGraph(
    navController: NavHostController = rememberNavController(),
    onAuthSuccess: () -> Unit
) {
    val authViewModel: AuthViewModel = hiltViewModel()

    NavHost(
        navController = navController,
        startDestination = "login",
        route = "auth_graph"
    ) {
        composable("login") {
            LoginScreen(
                viewModel = authViewModel,
                onNavigateToOtp = { phone ->
                    navController.navigate("otp/${Uri.encode(phone)}")
                }
            )
        }

        composable(
            route = "otp/{phoneNumber}",
            arguments = listOf(navArgument("phoneNumber") { type = NavType.StringType })
        ) { backStackEntry ->
            val phoneNumber = Uri.decode(backStackEntry.arguments?.getString("phoneNumber") ?: "")
            
            OtpScreen(
                phoneNumber = phoneNumber,
                viewModel = authViewModel,
                onSuccess = { isNewUser ->
                    if (isNewUser) {
                        navController.navigate("complete_profile") {
                            popUpTo("login") { inclusive = false }
                        }
                    } else {
                        onAuthSuccess()
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable("complete_profile") {
            CompleteProfileScreen(
                viewModel = authViewModel,
                onCompleted = onAuthSuccess
            )
        }
    }
}
