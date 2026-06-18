package com.tembus.courier.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.R
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.theme.Primary

@Composable
fun ForgotPasswordScreen(
    onBack: () -> Unit,
    viewModel: ForgotPasswordViewModel = hiltViewModel()
) {
    SecureScreenEffect()

    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onBack()
        }
    }

    Box(
        modifier = Modifier.fillMaxSize()
    ) {
        // Background Image
        Image(
            painter = painterResource(id = R.drawable.bg_courier_login),
            contentDescription = "Background Courier Login",
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize()
        )

        Column(
            modifier = Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Bottom
        ) {
            // ── Forgot Password Card ────────────────────────────────────────
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
                colors = CardDefaults.cardColors(
                    containerColor = Color.Transparent
                )
            ) {
                Column(
                    modifier = Modifier.padding(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 48.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    
                    Text(
                        text = "Lupa Password",
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    
                    if (uiState.error != null) {
                        Surface(
                            color = Color(0xFFFF8A8A).copy(alpha = 0.2f),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                horizontalArrangement = Arrangement.spacedBy(8.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Error, contentDescription = null, tint = Color(0xFFFF8A8A))
                                Text(
                                    text = uiState.error!!,
                                    color = Color(0xFFFF8A8A),
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        }
                    }

                    when (uiState.step) {
                        ForgotPasswordStep.EMAIL_INPUT -> {
                            Text(
                                text = "Masukkan email akun kurir Anda. Kami akan mengirimkan 6-digit OTP ke email tersebut.",
                                color = Color.White.copy(alpha = 0.8f),
                                style = MaterialTheme.typography.bodyMedium
                            )
                            
                            OutlinedTextField(
                                value = uiState.email,
                                onValueChange = viewModel::onEmailChange,
                                label = { Text("Email") },
                                leadingIcon = {
                                    Icon(Icons.Default.Email, contentDescription = null)
                                },
                                isError = uiState.emailError != null,
                                supportingText = uiState.emailError?.let { { Text(it) } },
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Email,
                                    imeAction = ImeAction.Done
                                ),
                                keyboardActions = KeyboardActions(
                                    onDone = {
                                        focusManager.clearFocus()
                                        viewModel.requestOtp()
                                    }
                                ),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                                colors = getTextFieldColors()
                            )

                            Button(
                                onClick = {
                                    focusManager.clearFocus()
                                    viewModel.requestOtp()
                                },
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                enabled = !uiState.isLoading,
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Primary,
                                    contentColor = Color.White
                                )
                            ) {
                                if (uiState.isLoading) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                } else {
                                    Text("Kirim OTP", style = MaterialTheme.typography.titleMedium)
                                }
                            }
                        }
                        
                        ForgotPasswordStep.OTP_VERIFICATION -> {
                            Text(
                                text = "Masukkan 6-digit OTP yang dikirim ke email Anda.",
                                color = Color.White.copy(alpha = 0.8f),
                                style = MaterialTheme.typography.bodyMedium
                            )

                            OutlinedTextField(
                                value = uiState.otpCode,
                                onValueChange = viewModel::onOtpCodeChange,
                                label = { Text("Kode OTP") },
                                leadingIcon = {
                                    Icon(Icons.Default.Lock, contentDescription = null)
                                },
                                isError = uiState.otpError != null,
                                supportingText = uiState.otpError?.let { { Text(it) } },
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Number,
                                    imeAction = ImeAction.Done
                                ),
                                keyboardActions = KeyboardActions(
                                    onDone = {
                                        focusManager.clearFocus()
                                        viewModel.verifyOtpAndProceed()
                                    }
                                ),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                                colors = getTextFieldColors()
                            )

                            Button(
                                onClick = {
                                    focusManager.clearFocus()
                                    viewModel.verifyOtpAndProceed()
                                },
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                enabled = !uiState.isLoading,
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Primary,
                                    contentColor = Color.White
                                )
                            ) {
                                Text("Lanjut", style = MaterialTheme.typography.titleMedium)
                            }
                        }
                        
                        ForgotPasswordStep.NEW_PASSWORD -> {
                            Text(
                                text = "Masukkan password baru Anda (minimal 8 karakter).",
                                color = Color.White.copy(alpha = 0.8f),
                                style = MaterialTheme.typography.bodyMedium
                            )

                            var passwordVisible by remember { mutableStateOf(false) }
                            OutlinedTextField(
                                value = uiState.newPassword,
                                onValueChange = viewModel::onNewPasswordChange,
                                label = { Text("Password Baru") },
                                leadingIcon = { Icon(Icons.Default.VpnKey, contentDescription = null) },
                                trailingIcon = {
                                    IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                        Icon(
                                            imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = null
                                        )
                                    }
                                },
                                visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                                isError = uiState.passwordError != null,
                                supportingText = uiState.passwordError?.let { { Text(it) } },
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Password,
                                    imeAction = ImeAction.Next
                                ),
                                keyboardActions = KeyboardActions(
                                    onNext = { focusManager.moveFocus(FocusDirection.Down) }
                                ),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                                colors = getTextFieldColors()
                            )

                            var confirmPasswordVisible by remember { mutableStateOf(false) }
                            OutlinedTextField(
                                value = uiState.confirmPassword,
                                onValueChange = viewModel::onConfirmPasswordChange,
                                label = { Text("Konfirmasi Password") },
                                leadingIcon = { Icon(Icons.Default.VpnKey, contentDescription = null) },
                                trailingIcon = {
                                    IconButton(onClick = { confirmPasswordVisible = !confirmPasswordVisible }) {
                                        Icon(
                                            imageVector = if (confirmPasswordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                            contentDescription = null
                                        )
                                    }
                                },
                                visualTransformation = if (confirmPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.Password,
                                    imeAction = ImeAction.Done
                                ),
                                keyboardActions = KeyboardActions(
                                    onDone = {
                                        focusManager.clearFocus()
                                        viewModel.confirmPasswordReset()
                                    }
                                ),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(14.dp),
                                colors = getTextFieldColors()
                            )

                            Button(
                                onClick = {
                                    focusManager.clearFocus()
                                    viewModel.confirmPasswordReset()
                                },
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                enabled = !uiState.isLoading,
                                shape = RoundedCornerShape(14.dp),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Primary,
                                    contentColor = Color.White
                                )
                            ) {
                                if (uiState.isLoading) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                } else {
                                    Text("Simpan & Selesai", style = MaterialTheme.typography.titleMedium)
                                }
                            }
                        }
                    }

                    TextButton(
                        onClick = onBack,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Kembali ke Halaman Login",
                            color = Color.White.copy(alpha = 0.8f),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun getTextFieldColors() = OutlinedTextFieldDefaults.colors(
    unfocusedContainerColor = Color.Black.copy(alpha = 0.2f),
    focusedContainerColor = Color.Black.copy(alpha = 0.35f),
    errorContainerColor = Color.Black.copy(alpha = 0.35f),
    unfocusedBorderColor = Color.White.copy(alpha = 0.5f),
    focusedBorderColor = Color.White,
    unfocusedLabelColor = Color.White.copy(alpha = 0.7f),
    focusedLabelColor = Color.White,
    unfocusedTextColor = Color.White,
    focusedTextColor = Color.White,
    unfocusedLeadingIconColor = Color.White.copy(alpha = 0.7f),
    focusedLeadingIconColor = Color.White,
    unfocusedTrailingIconColor = Color.White.copy(alpha = 0.7f),
    focusedTrailingIconColor = Color.White,
    errorBorderColor = Color(0xFFFF8A8A),
    errorLabelColor = Color(0xFFFF8A8A),
    errorTextColor = Color.White,
    errorLeadingIconColor = Color(0xFFFF8A8A),
    errorTrailingIconColor = Color(0xFFFF8A8A),
    errorSupportingTextColor = Color(0xFFFF8A8A)
)
