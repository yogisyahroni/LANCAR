package com.lancar.customer.ui.screens.auth

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
                    navController.navigate("otp/$phone")
                }
            )
        }

        composable(
            route = "otp/{phoneNumber}",
            arguments = listOf(navArgument("phoneNumber") { type = NavType.StringType })
        ) { backStackEntry ->
            val phoneNumber = backStackEntry.arguments?.getString("phoneNumber") ?: ""
            
            OtpScreen(
                phoneNumber = phoneNumber,
                viewModel = authViewModel,
                onSuccess = onAuthSuccess,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
