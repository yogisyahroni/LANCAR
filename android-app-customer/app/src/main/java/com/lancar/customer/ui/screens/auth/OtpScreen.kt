package com.lancar.customer.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lancar.customer.ui.theme.Primary
import kotlinx.coroutines.delay

@Composable
fun OtpScreen(
    phoneNumber: String,
    viewModel: AuthViewModel,
    onSuccess: () -> Unit,
    onBack: () -> Unit
) {
    val authState by viewModel.authState.collectAsState()
    
    // OTP logic (6 digits)
    val otpLength = 6
    var otpValues by remember { mutableStateOf(List(otpLength) { "" }) }
    val focusRequesters = remember { List(otpLength) { FocusRequester() } }
    
    var countdown by remember { mutableIntStateOf(60) }

    LaunchedEffect(Unit) {
        // Request focus on first item
        try { focusRequesters[0].requestFocus() } catch (e: Exception) {}
        
        // Countdown timer
        while (countdown > 0) {
            delay(1000L)
            countdown--
        }
    }

    // Handle side effects
    LaunchedEffect(authState) {
        if (authState is AuthState.Success) {
            onSuccess()
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
            verticalArrangement = Arrangement.Top,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(48.dp))
            
            Text(
                text = "Verifikasi OTP",
                fontSize = 28.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground,
                letterSpacing = (-0.5).sp
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "Masukkan 6 digit kode yang dikirim ke\n+62$phoneNumber",
                fontSize = 16.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                lineHeight = 24.sp
            )

            Spacer(modifier = Modifier.height(48.dp))

            // OTP Input Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                for (i in 0 until otpLength) {
                    OtpBox(
                        value = otpValues[i],
                        isError = authState is AuthState.Error,
                        focusRequester = focusRequesters[i],
                        onValueChange = { newValue ->
                            if (newValue.length <= 1 && newValue.all { it.isDigit() }) {
                                val newOtpValues = otpValues.toMutableList()
                                newOtpValues[i] = newValue
                                otpValues = newOtpValues

                                // Move focus automatically
                                if (newValue.isNotEmpty() && i < otpLength - 1) {
                                    focusRequesters[i + 1].requestFocus()
                                }
                            }
                        },
                        onBackspace = {
                            if (otpValues[i].isEmpty() && i > 0) {
                                focusRequesters[i - 1].requestFocus()
                                val newOtpValues = otpValues.toMutableList()
                                newOtpValues[i - 1] = ""
                                otpValues = newOtpValues
                            }
                        }
                    )
                }
            }

            AnimatedVisibility(visible = authState is AuthState.Error) {
                if (authState is AuthState.Error) {
                    Text(
                        text = (authState as AuthState.Error).message,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp),
                        textAlign = TextAlign.Center
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Animated Button
            val interactionSource = remember { MutableInteractionSource() }
            val isPressed by interactionSource.collectIsPressedAsState()
            val scale by animateFloatAsState(targetValue = if (isPressed) 0.98f else 1f)
            
            val isLoading = authState is AuthState.Loading
            val currentOtp = otpValues.joinToString("")
            val isEnabled = currentOtp.length == otpLength && !isLoading

            Button(
                onClick = { viewModel.verifyOtp(currentOtp) },
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
                        text = "Verifikasi",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(24.dp))
            
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = "Belum menerima kode? ",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 14.sp
                )
                TextButton(
                    onClick = { 
                        countdown = 60
                        viewModel.requestOtp() // Resend logic
                    },
                    enabled = countdown == 0,
                    contentPadding = PaddingValues(0.dp)
                ) {
                    Text(
                        text = if (countdown > 0) "Kirim ulang ($countdown)" else "Kirim ulang",
                        color = if (countdown > 0) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f) else Primary,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp
                    )
                }
            }
        }
    }
}

@Composable
fun OtpBox(
    value: String,
    isError: Boolean,
    focusRequester: FocusRequester,
    onValueChange: (String) -> Unit,
    onBackspace: () -> Unit
) {
    val borderColor = if (isError) MaterialTheme.colorScheme.error else if (value.isNotEmpty()) Primary else MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
    val bgColor = if (isError) MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)

    BasicTextField(
        value = value,
        onValueChange = {
            // Very basic backspace detection in BasicTextField
            if (it.isEmpty() && value.isNotEmpty()) {
                onValueChange("")
            } else if (it.isEmpty() && value.isEmpty()) {
                onBackspace()
            } else {
                onValueChange(it)
            }
        },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
        modifier = Modifier
            .size(48.dp)
            .focusRequester(focusRequester)
            .border(
                width = 1.dp,
                color = borderColor,
                shape = RoundedCornerShape(8.dp)
            )
            .background(
                color = bgColor,
                shape = RoundedCornerShape(8.dp)
            ),
        textStyle = LocalTextStyle.current.copy(
            textAlign = TextAlign.Center,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        ),
        decorationBox = { innerTextField ->
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.fillMaxSize()
            ) {
                innerTextField()
            }
        }
    )
}
