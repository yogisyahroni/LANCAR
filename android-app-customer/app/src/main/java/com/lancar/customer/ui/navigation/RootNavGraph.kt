package com.lancar.customer.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.lancar.customer.ui.MainViewModel
import com.lancar.customer.ui.screens.auth.AuthNavGraph
import com.lancar.customer.ui.screens.booking.BookingScreen
import com.lancar.customer.ui.screens.booking.BookingViewModel
import com.lancar.customer.ui.screens.main.DashboardScreen
import com.lancar.customer.ui.screens.tracking.TrackingScreen
import com.lancar.customer.ui.screens.tracking.TrackingViewModel
import androidx.navigation.NavType
import androidx.navigation.navArgument

@Composable
fun RootNavGraph(
    navController: NavHostController = rememberNavController(),
    viewModel: MainViewModel = hiltViewModel()
) {
    val isLoading by viewModel.isLoading.collectAsState()
    val startDestination by viewModel.startDestination.collectAsState()

    if (isLoading) {
        // Simple Full screen Loader (could be splash)
        return 
    }

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        // Pass a custom handler so that login success switches route.
        composable("auth_graph") {
            AuthNavGraph(
                onAuthSuccess = {
                    navController.navigate("dashboard") {
                        popUpTo("auth_graph") { inclusive = true }
                    }
                }
            )
        }
        
        composable("dashboard") {
            DashboardScreen(
                onLogout = {
                    viewModel.logout()
                    navController.navigate("auth_graph") {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onBookingClick = {
                    navController.navigate("booking")
                },
                onTrackingClick = { orderId ->
                    navController.navigate("tracking/$orderId")
                }
            )
        }

        composable("booking") {
            val bookingViewModel: BookingViewModel = hiltViewModel()
            BookingScreen(
                viewModel = bookingViewModel,
                onBackClick = {
                    navController.popBackStack()
                }
            )
        }

        composable(
            route = "tracking/{orderId}",
            arguments = listOf(navArgument("orderId") { type = NavType.StringType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
            val trackingViewModel: TrackingViewModel = hiltViewModel()
            TrackingScreen(
                orderId = orderId,
                viewModel = trackingViewModel,
                onBackClick = {
                    navController.popBackStack()
                }
            )
        }
    }
}
