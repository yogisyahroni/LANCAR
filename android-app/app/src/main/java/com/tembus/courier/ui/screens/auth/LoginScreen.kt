package com.tembus.courier.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.BuildConfig
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.theme.Accent
import com.tembus.courier.ui.theme.Background
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryDark
import com.tembus.courier.ui.theme.PrimaryLight
import com.tembus.courier.ui.theme.TembusComponentDefaults
import com.tembus.courier.ui.theme.TembusRadius
import com.tembus.courier.ui.theme.TembusSpacing

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    viewModel: LoginViewModel = hiltViewModel()
) {
    SecureScreenEffect()

    var showRegistration by remember { mutableStateOf(false) }
    var showForgotPassword by remember { mutableStateOf(false) }
    var passwordVisible by rememberSaveable { mutableStateOf(false) }
    val uiState by viewModel.uiState.collectAsState()
    val focusManager = LocalFocusManager.current

    if (showRegistration) {
        CourierRegistrationScreen(onBack = { showRegistration = false })
        return
    }

    if (showForgotPassword) {
        ForgotPasswordScreen(onBack = { showForgotPassword = false })
        return
    }

    LaunchedEffect(uiState.isLoggedIn) {
        if (uiState.isLoggedIn) onLoginSuccess()
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .verticalScroll(rememberScrollState())
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(300.dp)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(PrimaryDark, Primary, PrimaryLight)
                    )
                )
        ) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = 42.dp, y = 70.dp)
                    .size(240.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.07f))
            )
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = (-22).dp, y = 112.dp)
                    .size(120.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.10f))
            )

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .padding(horizontal = TembusSpacing.Screen, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(
                        modifier = Modifier.size(52.dp),
                        shape = RoundedCornerShape(16.dp),
                        color = Color.White.copy(alpha = 0.16f)
                    ) {
                        Icon(
                            imageVector = Icons.Default.LocalShipping,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.padding(13.dp)
                        )
                    }
                    Column {
                        Text(
                            text = "TEMBUS",
                            color = Color.White,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Black
                        )
                        Text(
                            text = "Mitra Kurir",
                            color = Color.White.copy(alpha = 0.76f),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }

                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Siap ambil pekerjaan hari ini?",
                        color = Color.White,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        text = "Kelola order, navigasi, bukti serah terima, dan pendapatan dari satu tempat.",
                        color = Color.White.copy(alpha = 0.82f),
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }

        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .offset(y = (-24).dp),
            shape = RoundedCornerShape(topStart = TembusRadius.Sheet, topEnd = TembusRadius.Sheet),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 4.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TembusSpacing.Screen, vertical = 24.dp)
                    .navigationBarsPadding(),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Text(
                    text = if (uiState.requiresOtp) "Verifikasi perangkat" else "Masuk ke akun",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Black,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = if (uiState.requiresOtp) {
                        "Masukkan kode OTP untuk melanjutkan di perangkat ini."
                    } else {
                        "Gunakan akun mitra yang sudah terdaftar untuk mulai bekerja."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                OutlinedTextField(
                    value = uiState.username,
                    onValueChange = viewModel::onUsernameChange,
                    label = { Text("Email atau username") },
                    leadingIcon = { Icon(Icons.Default.Person, contentDescription = null) },
                    isError = uiState.usernameError != null,
                    supportingText = uiState.usernameError?.let { message -> { Text(message) } },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next
                    ),
                    keyboardActions = KeyboardActions(
                        onNext = { focusManager.moveFocus(androidx.compose.ui.focus.FocusDirection.Down) }
                    ),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = TembusComponentDefaults.inputShape(),
                    colors = TembusComponentDefaults.inputColors()
                )

                OutlinedTextField(
                    value = uiState.password,
                    onValueChange = viewModel::onPasswordChange,
                    label = { Text("Password") },
                    leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                    trailingIcon = {
                        IconButton(onClick = { passwordVisible = !passwordVisible }) {
                            Icon(
                                imageVector = if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = if (passwordVisible) "Sembunyikan password" else "Tampilkan password"
                            )
                        }
                    },
                    visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                    isError = uiState.passwordError != null,
                    supportingText = uiState.passwordError?.let { message -> { Text(message) } },
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done
                    ),
                    keyboardActions = KeyboardActions(
                        onDone = {
                            focusManager.clearFocus()
                            if (uiState.requiresOtp) viewModel.verifyOtp() else viewModel.login()
                        }
                    ),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    shape = TembusComponentDefaults.inputShape(),
                    colors = TembusComponentDefaults.inputColors()
                )

                AnimatedVisibility(
                    visible = uiState.requiresOtp,
                    enter = fadeIn(),
                    exit = fadeOut()
                ) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(TembusRadius.Card),
                        color = Primary.copy(alpha = 0.08f)
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Icon(Icons.Default.VerifiedUser, contentDescription = null, tint = Primary)
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("Perangkat baru terdeteksi", fontWeight = FontWeight.Bold)
                                    Text(
                                        "Masukkan OTP 6 digit yang dikirim ke akunmu.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            OutlinedTextField(
                                value = uiState.otpCode,
                                onValueChange = viewModel::onOtpCodeChange,
                                label = { Text("Kode OTP") },
                                leadingIcon = { Icon(Icons.Default.Lock, contentDescription = null) },
                                keyboardOptions = KeyboardOptions(
                                    keyboardType = KeyboardType.NumberPassword,
                                    imeAction = ImeAction.Done
                                ),
                                keyboardActions = KeyboardActions(
                                    onDone = {
                                        focusManager.clearFocus()
                                        viewModel.verifyOtp()
                                    }
                                ),
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                                shape = TembusComponentDefaults.inputShape(),
                                colors = TembusComponentDefaults.inputColors()
                            )
                            TextButton(
                                onClick = {
                                    focusManager.clearFocus()
                                    viewModel.cancelOtpChallenge()
                                },
                                modifier = Modifier.align(Alignment.End)
                            ) {
                                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Ganti akun")
                            }
                        }
                    }
                }

                AnimatedVisibility(
                    visible = uiState.error != null,
                    enter = fadeIn(),
                    exit = fadeOut()
                ) {
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(TembusRadius.Card),
                        color = MaterialTheme.colorScheme.errorContainer
                    ) {
                        Text(
                            text = uiState.error.orEmpty(),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.padding(14.dp)
                        )
                    }
                }

                Button(
                    onClick = {
                        focusManager.clearFocus()
                        if (uiState.requiresOtp) viewModel.verifyOtp() else viewModel.login()
                    },
                    enabled = !uiState.isLoading && (!uiState.requiresOtp || uiState.otpCode.length == 6),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = TembusComponentDefaults.buttonShape(),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Accent,
                        contentColor = Color.White
                    )
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            color = Color.White,
                            strokeWidth = 2.5.dp
                        )
                    } else {
                        Text(
                            text = if (uiState.requiresOtp) "Verifikasi perangkat" else "Masuk",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(onClick = { showForgotPassword = true }) {
                        Text("Lupa password?")
                    }
                    TextButton(onClick = { showRegistration = true }) {
                        Text("Daftar sebagai kurir", fontWeight = FontWeight.Bold)
                    }
                }

                Text(
                    text = "${BuildConfig.VERSION_NAME.substringBefore("-")} • TEMBUS Mitra Kurir",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}
