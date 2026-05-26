package com.lancar.customer.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
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
import androidx.navigation.navDeepLink

import com.lancar.customer.ui.screens.history.OrderHistoryScreen
import com.lancar.customer.ui.screens.history.OrderHistoryViewModel
import com.lancar.customer.ui.screens.profile.ProfileScreen
import com.lancar.customer.ui.screens.profile.ProfileViewModel
import com.lancar.customer.ui.screens.detail.OrderDetailScreen
import com.lancar.customer.ui.screens.detail.OrderDetailViewModel

import com.lancar.customer.ui.screens.payment.PaymentScreen
import com.lancar.customer.ui.screens.payment.PaymentViewModel
import com.lancar.customer.ui.screens.chat.ChatScreen
import com.lancar.customer.ui.screens.chat.ChatViewModel
import com.lancar.customer.ui.security.SecureScreenEffect
import com.lancar.customer.data.session.SessionInvalidationReason
import android.widget.Toast

@Composable
fun RootNavGraph(
    navController: NavHostController = rememberNavController(),
    viewModel: MainViewModel = hiltViewModel()
) {
    val isLoading by viewModel.isLoading.collectAsState()
    val startDestination by viewModel.startDestination.collectAsState()
    val sessionInvalidationReason by viewModel.sessionInvalidationReason.collectAsState()
    val context = LocalContext.current
    val currentBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = currentBackStackEntry?.destination?.route
    val secureScreenRequired = currentRoute in setOf(
        Screen.AuthGraph.route,
        Screen.Booking.route,
        Screen.Profile.route,
        Screen.OrderDetail.route,
        Screen.Payment.route,
        Screen.Tracking.route,
        Screen.Chat.route
    )

    SecureScreenEffect(enabled = secureScreenRequired)

    if (isLoading) {
        // Preload logic here if needed
        return 
    }

    LaunchedEffect(startDestination) {
        if (startDestination == Screen.AuthGraph.route &&
            navController.currentDestination?.route != Screen.AuthGraph.route
        ) {
            navController.navigate(Screen.AuthGraph.route) {
                popUpTo(0) { inclusive = true }
            }
        }
    }

    LaunchedEffect(sessionInvalidationReason) {
        if (sessionInvalidationReason == SessionInvalidationReason.TOKEN_EXPIRED) {
            Toast.makeText(
                context,
                "Sesi kamu sudah berakhir. Silakan masuk kembali.",
                Toast.LENGTH_LONG
            ).show()
            viewModel.consumeSessionInvalidationNotice()
        }
    }

    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
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
                onLogout = {
                    viewModel.logout()
                    navController.navigate(Screen.AuthGraph.route) {
                        popUpTo(0) { inclusive = true }
                    }
                },
                onBookingClick = { open ->
                    navController.navigate(Screen.Booking.createRoute(open))
                },
                onTrackingClick = { orderId ->
                    // Navigate to tracking directly for live tracking
                    navController.navigate(Screen.Tracking.createRoute(orderId))
                },
                onHistoryClick = {
                    navController.navigate(Screen.History.route)
                },
                onProfileClick = {
                    navController.navigate(Screen.Profile.route)
                }
            )
        }

        composable(
            route = Screen.Booking.route,
            arguments = listOf(navArgument("open") {
                type = NavType.StringType
                nullable = true
                defaultValue = null
            })
        ) { backStackEntry ->
            val initialOpen = backStackEntry.arguments?.getString("open")
            val bookingViewModel: BookingViewModel = hiltViewModel()
            BookingScreen(
                viewModel = bookingViewModel,
                initialOpen = initialOpen,
                onBackClick = {
                    navController.popBackStack()
                },
                onBookingSuccess = { orderId ->
                    // Direct to payment right after booking creation successfully
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
                onOrderClick = { orderId ->
                    navController.navigate(Screen.OrderDetail.createRoute(orderId))
                }
            )
        }

        composable(Screen.Profile.route) {
            val profileViewModel: ProfileViewModel = hiltViewModel()
            ProfileScreen(
                viewModel = profileViewModel,
                onBackClick = { navController.popBackStack() },
                onLogout = {
                    viewModel.logout() // ensure cleaning main vm session
                    navController.navigate(Screen.AuthGraph.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = Screen.OrderDetail.route,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType }),
            deepLinks = listOf(
                navDeepLink { uriPattern = "lancar://order/{orderId}" }
            )
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
            val detailViewModel: OrderDetailViewModel = hiltViewModel()
            OrderDetailScreen(
                orderId = orderId,
                viewModel = detailViewModel,
                onBackClick = { navController.popBackStack() },
                onTrackClick = { id ->
                    navController.navigate(Screen.Tracking.createRoute(id))
                }
            )
        }

        composable(
            route = Screen.Payment.route,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
            val payVm: PaymentViewModel = hiltViewModel()
            PaymentScreen(
                orderId = orderId,
                viewModel = payVm,
                onClose = { navController.popBackStack() },
                onPaymentSuccess = {
                    // Redirect to order status/detail on generic success callback detected in url
                    navController.navigate(Screen.OrderDetail.createRoute(orderId)) {
                        popUpTo(Screen.Dashboard.route)
                    }
                }
            )
        }

        composable(
            route = Screen.Tracking.route,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
            val trackingViewModel: TrackingViewModel = hiltViewModel()
            TrackingScreen(
                orderId = orderId,
                viewModel = trackingViewModel,
                onBackClick = {
                    navController.popBackStack()
                },
                onChatClick = { id, name, phone ->
                    // Dynamic launch of full duplex chat view
                    navController.navigate(Screen.Chat.createRoute(id, name, phone))
                }
            )
        }

        composable(
            route = Screen.Chat.route,
            arguments = listOf(
                navArgument("orderId") { type = NavType.StringType },
                navArgument("name") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = ""
                },
                navArgument("phone") { 
                    type = NavType.StringType
                    nullable = true
                    defaultValue = ""
                }
            )
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: ""
            val rawName = backStackEntry.arguments?.getString("name") ?: ""
            val rawPhone = backStackEntry.arguments?.getString("phone") ?: ""
            
            // Decipher URL safety transformations
            val courierName = if (rawName.isNotBlank()) java.net.URLDecoder.decode(rawName, "UTF-8") else null
            val courierPhone = if (rawPhone.isNotBlank()) java.net.URLDecoder.decode(rawPhone, "UTF-8") else null
            
            val chatVm: ChatViewModel = hiltViewModel()
            ChatScreen(
                orderId = orderId,
                courierName = courierName,
                courierPhone = courierPhone,
                onBackClick = { navController.popBackStack() },
                viewModel = chatVm
            )
        }
    }
}

@Composable
fun PlaceholderScreen(title: String) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Text(title)
    }
}
