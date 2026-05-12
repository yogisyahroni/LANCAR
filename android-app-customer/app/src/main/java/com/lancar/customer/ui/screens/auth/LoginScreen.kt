package com.lancar.customer.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lancar.customer.ui.theme.Primary
import com.lancar.customer.config.AppConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateToOtp: (String) -> Unit
) {
    val authState by viewModel.authState.collectAsState()
    val phoneNumber by viewModel.phoneNumber.collectAsState()

    // Handle side effects for navigation
    LaunchedEffect(authState) {
        if (authState is AuthState.OtpSent) {
            onNavigateToOtp(phoneNumber)
            viewModel.resetState()
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 24.dp), // p-6 equivalent
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = "LANCAR",
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                color = Primary,
                letterSpacing = (-0.5).sp // tracking-tight
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "Masuk untuk melanjutkan perjalananmu",
                fontSize = 16.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )

            Spacer(modifier = Modifier.height(48.dp))

            OutlinedTextField(
                value = phoneNumber,
                onValueChange = { newValue ->
                    val isValid = if (AppConfig.IS_EMAIL_AUTH_ENABLED) {
                        // Allow normal email characters
                        !newValue.contains(" ")
                    } else {
                        // Only allow digits for phone mode
                        newValue.all { it.isDigit() }
                    }
                    if (isValid) {
                        viewModel.setPhoneNumber(newValue)
                    }
                },
                label = { Text(if (AppConfig.IS_EMAIL_AUTH_ENABLED) "Alamat Email" else "Nomor Handphone") },
                leadingIcon = if (!AppConfig.IS_EMAIL_AUTH_ENABLED) {
                    {
                        Text(
                            text = "+62",
                            modifier = Modifier.padding(start = 16.dp, end = 8.dp),
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                } else null,
                keyboardOptions = KeyboardOptions(
                    keyboardType = if (AppConfig.IS_EMAIL_AUTH_ENABLED) KeyboardType.Email else KeyboardType.Phone
                ),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = TextFieldDefaults.outlinedTextFieldColors(
                    focusedBorderColor = Primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                ),
                singleLine = true
            )

            AnimatedVisibility(visible = authState is AuthState.Error) {
                if (authState is AuthState.Error) {
                    Text(
                        text = (authState as AuthState.Error).message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp, start = 4.dp),
                        textAlign = TextAlign.Start
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Animated Button
            val interactionSource = remember { MutableInteractionSource() }
            val isPressed by interactionSource.collectIsPressedAsState()
            val scale by animateFloatAsState(targetValue = if (isPressed) 0.98f else 1f)
            
            val isLoading = authState is AuthState.Loading
            val isEnabled = if (AppConfig.IS_EMAIL_AUTH_ENABLED) {
                phoneNumber.length >= 5 && android.util.Patterns.EMAIL_ADDRESS.matcher(phoneNumber).matches()
            } else {
                phoneNumber.length >= 9
            } && !isLoading

            Button(
                onClick = { viewModel.requestOtp() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp)
                    .scale(scale),
                enabled = isEnabled,
                shape = RoundedCornerShape(12.dp),
                interactionSource = interactionSource,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Primary
                )
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        color = Color.White,
                        modifier = Modifier.size(24.dp),
                        strokeWidth = 2.dp
                    )
                } else {
                    Text(
                        text = "Kirim OTP",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
