package com.tembus.merchant.ui.screens.auth

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.tembus.merchant.R
import com.tembus.merchant.TEMBUSApplication
import com.tembus.merchant.ui.theme.TEMBUSMerchantTheme
import com.tembus.merchant.ui.theme.TembusRadius

// Skema warna login mengikuti mockup: bg hijau sangat gelap + tombol oranye #FF6201
private val LoginBackground = Color(0xFF001E16)
private val LoginAccent = Color(0xFFFF6201)
private val LoginOnAccent = Color(0xFFFFFFFF)
private val LoginText = Color(0xFFFDFDFD)
private val LoginTextSoft = Color(0xB3FDFDFD) // putih 70%
private val LoginFieldBorder = Color(0x66FDFDFD) // putih 40%
private val LoginFieldBorderFocused = Color(0xFFFF6201)

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    viewModel: LoginViewModel = viewModel(
        factory = rememberLoginViewModelFactory()
    )
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.loginSuccess) {
        if (uiState.loginSuccess) {
            onLoginSuccess()
        }
    }

    TEMBUSMerchantTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = LoginBackground
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(64.dp))

                // Logo transparan (putih + oranye) dari asset logo_white.png
                Image(
                    painter = painterResource(id = R.drawable.logo_white),
                    contentDescription = "TEMBUS Logo",
                    modifier = Modifier
                        .width(180.dp)
                        .aspectRatio(307f / 374f),
                    contentScale = ContentScale.Fit
                )

                Spacer(modifier = Modifier.height(24.dp))

                // Copywriting dinamis: baru pertama install vs sudah pernah login
                Text(
                    text = if (uiState.hadLoggedIn) "Selamat datang kembali" else "Selamat datang",
                    style = MaterialTheme.typography.headlineMedium,
                    color = LoginText,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center
                )
                Text(
                    text = if (uiState.hadLoggedIn) {
                        "Masuk untuk melanjutkan pengelolaan bisnis Anda"
                    } else {
                        "Masuk untuk mengelola bisnis Anda"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = LoginTextSoft,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(40.dp))

                OutlinedTextField(
                    value = uiState.email,
                    onValueChange = viewModel::onEmailChange,
                    label = { Text("Email") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Email,
                        imeAction = ImeAction.Next
                    ),
                    shape = RoundedCornerShape(TembusRadius.Input),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = LoginText,
                        unfocusedTextColor = LoginText,
                        focusedBorderColor = LoginFieldBorderFocused,
                        unfocusedBorderColor = LoginFieldBorder,
                        focusedLabelColor = LoginAccent,
                        unfocusedLabelColor = LoginTextSoft,
                        cursorColor = LoginAccent
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                Spacer(modifier = Modifier.height(14.dp))

                OutlinedTextField(
                    value = uiState.password,
                    onValueChange = viewModel::onPasswordChange,
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done
                    ),
                    shape = RoundedCornerShape(TembusRadius.Input),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedTextColor = LoginText,
                        unfocusedTextColor = LoginText,
                        focusedBorderColor = LoginFieldBorderFocused,
                        unfocusedBorderColor = LoginFieldBorder,
                        focusedLabelColor = LoginAccent,
                        unfocusedLabelColor = LoginTextSoft,
                        cursorColor = LoginAccent
                    ),
                    modifier = Modifier.fillMaxWidth()
                )

                if (uiState.errorMessage != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = uiState.errorMessage.orEmpty(),
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }

                Spacer(modifier = Modifier.height(28.dp))

                Button(
                    onClick = viewModel::login,
                    enabled = !uiState.isLoading,
                    shape = RoundedCornerShape(TembusRadius.Card),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = LoginAccent,
                        contentColor = LoginOnAccent,
                        disabledContainerColor = LoginAccent.copy(alpha = 0.5f),
                        disabledContentColor = LoginOnAccent.copy(alpha = 0.8f)
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(54.dp)
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(22.dp),
                            color = LoginOnAccent,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("Masuk", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))

                Text(
                    text = "Belum punya akun merchant?\nDaftar melalui admin Tembus terlebih dahulu.",
                    style = MaterialTheme.typography.bodySmall,
                    color = LoginTextSoft,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(48.dp))
            }
        }
    }
}

@Composable
fun rememberLoginViewModelFactory(): androidx.lifecycle.ViewModelProvider.Factory {
    val context = LocalContext.current
    val app = context.applicationContext as TEMBUSApplication
    return remember(app) {
        object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return LoginViewModel(app.container.authRepository, app.container.onboardingPreferences) as T
            }
        }
    }
}
