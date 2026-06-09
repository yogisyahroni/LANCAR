package com.tembus.customer.ui.screens.auth

import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument

// ── Auth route constants ──────────────────────────────────────
private const val ROUTE_LOGIN = "login"
private const val ROUTE_OTP = "otp/{phoneNumber}"
private const val ROUTE_COMPLETE_PROFILE = "complete_profile"
private const val ROUTE_GOOGLE_OTP = "google_otp_verify/{maskedRecipient}/{channel}"
private const val ROUTE_GOOGLE_PHONE = "google_phone/{email}/{fullName}/{transactionId}"

@Composable
fun AuthNavGraph(
    navController: NavHostController = rememberNavController(),
    onAuthSuccess: () -> Unit
) {
    val authViewModel: AuthViewModel = hiltViewModel()
    val googleViewModel: GoogleAuthViewModel = hiltViewModel()

    NavHost(
        navController = navController,
        startDestination = ROUTE_LOGIN,
        route = "auth_graph"
    ) {

        // ── Login Screen ──────────────────────────────────────
        composable(ROUTE_LOGIN) {
            LoginScreen(
                viewModel = authViewModel,
                googleViewModel = googleViewModel,
                onNavigateToOtp = { phone ->
                    navController.navigate("otp/${Uri.encode(phone)}")
                },
                onGoogleRequiresOtp = { maskedRecipient, channel ->
                    navController.navigate(
                        "google_otp_verify/${Uri.encode(maskedRecipient)}/${Uri.encode(channel)}"
                    ) { launchSingleTop = true }
                },
                onGoogleRequiresPhone = { email, fullName, transactionId ->
                    navController.navigate(
                        "google_phone/${Uri.encode(email)}/${Uri.encode(fullName)}/${Uri.encode(transactionId)}"
                    ) { launchSingleTop = true }
                },
                onGoogleAuthSuccess = {
                    onAuthSuccess()
                }
            )
        }

        // ── Standard OTP Screen (email/phone login) ───────────
        composable(
            route = ROUTE_OTP,
            arguments = listOf(navArgument("phoneNumber") { type = NavType.StringType })
        ) { backStackEntry ->
            val phoneNumber = Uri.decode(
                backStackEntry.arguments?.getString("phoneNumber") ?: ""
            )
            OtpScreen(
                phoneNumber = phoneNumber,
                viewModel = authViewModel,
                onSuccess = { isNewUser ->
                    if (isNewUser) {
                        navController.navigate(ROUTE_COMPLETE_PROFILE) {
                            popUpTo(ROUTE_LOGIN) { inclusive = false }
                        }
                    } else {
                        onAuthSuccess()
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }

        // ── Complete Profile Screen ────────────────────────────
        composable(ROUTE_COMPLETE_PROFILE) {
            CompleteProfileScreen(
                viewModel = authViewModel,
                onCompleted = onAuthSuccess
            )
        }

        // ── Google Step-Up OTP Screen ─────────────────────────
        composable(
            route = ROUTE_GOOGLE_OTP,
            arguments = listOf(
                navArgument("maskedRecipient") { type = NavType.StringType },
                navArgument("channel") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val maskedRecipient = Uri.decode(
                backStackEntry.arguments?.getString("maskedRecipient") ?: ""
            )
            val channel = Uri.decode(
                backStackEntry.arguments?.getString("channel") ?: "whatsapp"
            )
            OtpVerifyScreen(
                maskedRecipient = maskedRecipient,
                channel = channel,
                viewModel = googleViewModel,
                onSuccess = {
                    onAuthSuccess()
                },
                onBack = {
                    googleViewModel.resetGoogleAuthState()
                    navController.popBackStack(ROUTE_LOGIN, inclusive = false)
                }
            )
        }

        // ── Google New User Phone Collection Screen ───────────
        composable(
            route = ROUTE_GOOGLE_PHONE,
            arguments = listOf(
                navArgument("email") { type = NavType.StringType },
                navArgument("fullName") { type = NavType.StringType },
                navArgument("transactionId") { type = NavType.StringType }
            )
        ) { backStackEntry ->
            val email = Uri.decode(backStackEntry.arguments?.getString("email") ?: "")
            val fullName = Uri.decode(backStackEntry.arguments?.getString("fullName") ?: "")
            val transactionId = Uri.decode(backStackEntry.arguments?.getString("transactionId") ?: "")

            GooglePhoneScreen(
                googleFullName = fullName,
                googleEmail = email,
                transactionId = transactionId,
                viewModel = googleViewModel,
                onOtpSent = { maskedRecipient, channel ->
                    navController.navigate(
                        "google_otp_verify/${Uri.encode(maskedRecipient)}/${Uri.encode(channel)}"
                    ) {
                        popUpTo(ROUTE_GOOGLE_PHONE) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onBack = {
                    googleViewModel.resetGoogleAuthState()
                    googleViewModel.resetOtpState()
                    navController.popBackStack(ROUTE_LOGIN, inclusive = false)
                }
            )
        }
    }
}
