package com.tembus.customer.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.R
import com.tembus.customer.config.AppConfig
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.AccentLight
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryDark
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.SurfaceVariant
import com.tembus.customer.ui.theme.TextDisabled

private val Ink = OnSurface
private val Muted = OnSurfaceVariant
private val Line = Outline

private enum class AuthEntryMode {
    Login,
    Register
}

private enum class PasswordResetStep {
    Request,
    Confirm,
    Complete
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateToOtp: (String) -> Unit
) {
    val authState by viewModel.authState.collectAsState()
    val passwordResetState by viewModel.passwordResetState.collectAsState()
    val phoneNumber by viewModel.phoneNumber.collectAsState()
    val password by viewModel.password.collectAsState()

    var entryMode by remember { mutableStateOf(AuthEntryMode.Login) }
    var registrationName by remember { mutableStateOf("") }
    var registrationPhone by remember { mutableStateOf("") }
    var noticeMessage by remember { mutableStateOf<String?>(null) }
    var showPassword by remember { mutableStateOf(false) }
    var resetMode by remember { mutableStateOf(false) }
    var resetStep by remember { mutableStateOf(PasswordResetStep.Request) }
    var resetEmail by remember { mutableStateOf("") }
    var resetCode by remember { mutableStateOf("") }
    var resetNewPassword by remember { mutableStateOf("") }
    var resetConfirmPassword by remember { mutableStateOf("") }
    var showResetPassword by remember { mutableStateOf(false) }
    var resetLocalError by remember { mutableStateOf<String?>(null) }
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val buttonScale by animateFloatAsState(targetValue = if (isPressed) 0.98f else 1f)
    val isLoading = authState is AuthState.Loading
    val isResetBusy = passwordResetState is PasswordResetState.Sending ||
        passwordResetState is PasswordResetState.Confirming
    val credentialLabel = if (AppConfig.IS_EMAIL_AUTH_ENABLED) "Email" else "Nomor handphone"
    val credentialPlaceholder = if (AppConfig.IS_EMAIL_AUTH_ENABLED) "Masukkan email Anda" else "Masukkan nomor handphone"
    val credentialKeyboard = if (AppConfig.IS_EMAIL_AUTH_ENABLED) KeyboardType.Email else KeyboardType.Phone
    val isEmailValid = phoneNumber.length >= 5 &&
        android.util.Patterns.EMAIL_ADDRESS.matcher(phoneNumber).matches()
    val isRegisterValid = isEmailValid &&
        registrationName.trim().length >= 2 &&
        registrationPhone.length >= 9 &&
        password.length >= 8
    val isEnabled = if (AppConfig.IS_EMAIL_AUTH_ENABLED) {
        if (entryMode == AuthEntryMode.Register) isRegisterValid else isEmailValid && password.length >= 8
    } else {
        phoneNumber.length >= 9
    } && !isLoading

    LaunchedEffect(authState) {
        if (authState is AuthState.OtpSent) {
            onNavigateToOtp(phoneNumber)
            viewModel.resetState()
        }
    }

    LaunchedEffect(passwordResetState) {
        when (val state = passwordResetState) {
            is PasswordResetState.CodeSent -> {
                resetStep = PasswordResetStep.Confirm
                resetEmail = state.email
                resetLocalError = null
            }
            is PasswordResetState.Completed -> {
                resetStep = PasswordResetStep.Complete
                resetCode = ""
                resetNewPassword = ""
                resetConfirmPassword = ""
                resetLocalError = null
            }
            else -> Unit
        }
    }

    fun closePasswordReset() {
        resetMode = false
        resetStep = PasswordResetStep.Request
        resetCode = ""
        resetNewPassword = ""
        resetConfirmPassword = ""
        showResetPassword = false
        resetLocalError = null
        viewModel.resetPasswordResetState()
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color.White
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentAlignment = Alignment.TopCenter
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 30.dp, vertical = 34.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 420.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp)
                ) {
                    TembusLogo(
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .padding(top = 20.dp, bottom = 14.dp)
                    )

                    AuthHeadline(
                        entryMode = entryMode,
                        isPasswordReset = resetMode
                    )

                    AnimatedVisibility(visible = !resetMode) {
                        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                            GoogleButton(
                                onClick = {
                                    noticeMessage = "Google sign-in sedang disiapkan. Gunakan email dan password untuk melanjutkan saat ini."
                                    entryMode = AuthEntryMode.Login
                                }
                            )

                            DividerWithText()

                            AnimatedVisibility(visible = entryMode == AuthEntryMode.Register) {
                                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                                    LabeledTextField(
                                        label = "Nama lengkap",
                                        value = registrationName,
                                        onValueChange = { registrationName = it.take(60) },
                                        placeholder = "Masukkan nama lengkap",
                                        keyboardType = KeyboardType.Text
                                    )
                                    LabeledTextField(
                                        label = "Nomor handphone",
                                        value = registrationPhone,
                                        onValueChange = { value ->
                                            if (value.all { it.isDigit() } && value.length <= 15) {
                                                registrationPhone = value
                                            }
                                        },
                                        placeholder = "Masukkan nomor handphone",
                                        keyboardType = KeyboardType.Phone,
                                        prefix = "+62"
                                    )
                                }
                            }

                            LabeledTextField(
                                label = credentialLabel,
                                value = phoneNumber,
                                onValueChange = { newValue ->
                                    val isValid = if (AppConfig.IS_EMAIL_AUTH_ENABLED) {
                                        !newValue.contains(" ")
                                    } else {
                                        newValue.all { it.isDigit() }
                                    }
                                    if (isValid) viewModel.setPhoneNumber(newValue)
                                },
                                placeholder = credentialPlaceholder,
                                keyboardType = credentialKeyboard
                            )

                            PasswordField(
                                password = password,
                                showPassword = showPassword,
                                onPasswordChange = { viewModel.setPassword(it.take(80)) },
                                onTogglePassword = { showPassword = !showPassword }
                            )

                            if (entryMode == AuthEntryMode.Login) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.End
                                ) {
                                    TextButton(
                                        onClick = {
                                            resetMode = true
                                            resetStep = PasswordResetStep.Request
                                            resetEmail = if (isEmailValid) phoneNumber.trim() else ""
                                            resetLocalError = null
                                            noticeMessage = null
                                            viewModel.resetState()
                                            viewModel.resetPasswordResetState()
                                        },
                                        contentPadding = ButtonDefaults.TextButtonContentPadding
                                    ) {
                                        Text(
                                            text = "Lupa password?",
                                            color = Primary,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 13.sp
                                        )
                                    }
                                }
                            }

                            PrimaryAuthButton(
                                entryMode = entryMode,
                                isLoading = isLoading,
                                isEnabled = isEnabled,
                                interactionSource = interactionSource,
                                scale = buttonScale,
                                onClick = {
                                    noticeMessage = null
                                    if (entryMode == AuthEntryMode.Register) {
                                        viewModel.setPendingRegistrationProfile(registrationName, registrationPhone)
                                        viewModel.startPasswordRegistration()
                                    } else {
                                        viewModel.startPasswordLogin()
                                    }
                                }
                            )

                            BottomModeSwitch(
                                entryMode = entryMode,
                                onEntryModeChange = { mode ->
                                    entryMode = mode
                                    noticeMessage = null
                                    if (mode == AuthEntryMode.Login) {
                                        viewModel.setPendingRegistrationProfile("", "")
                                    }
                                }
                            )
                        }
                    }

                    AnimatedVisibility(visible = resetMode) {
                        PasswordResetPanel(
                            email = resetEmail,
                            onEmailChange = { value ->
                                if (!value.contains(" ")) {
                                    resetEmail = value.take(255)
                                }
                            },
                            code = resetCode,
                            onCodeChange = { value ->
                                if (value.all { it.isDigit() } && value.length <= 6) {
                                    resetCode = value
                                }
                            },
                            newPassword = resetNewPassword,
                            confirmPassword = resetConfirmPassword,
                            showPassword = showResetPassword,
                            onNewPasswordChange = { resetNewPassword = it.take(80) },
                            onConfirmPasswordChange = { resetConfirmPassword = it.take(80) },
                            onTogglePassword = { showResetPassword = !showResetPassword },
                            step = resetStep,
                            state = passwordResetState,
                            localError = resetLocalError,
                            isBusy = isResetBusy,
                            onRequestCode = {
                                resetLocalError = null
                                viewModel.requestPasswordReset(resetEmail)
                            },
                            onConfirm = {
                                resetLocalError = null
                                if (resetNewPassword != resetConfirmPassword) {
                                    resetLocalError = "Konfirmasi password belum sama"
                                } else {
                                    viewModel.confirmPasswordReset(resetEmail, resetCode, resetNewPassword)
                                }
                            },
                            onBackToLogin = { closePasswordReset() }
                        )
                    }

                    AnimatedVisibility(visible = noticeMessage != null) {
                        if (noticeMessage != null) {
                            NoticeBox(message = noticeMessage ?: "")
                        }
                    }

                    val errorState = authState as? AuthState.Error
                    AnimatedVisibility(visible = errorState != null) {
                        if (errorState != null) {
                            Text(
                                text = errorState.message,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Start
                            )
                        }
                    }

                    SecurityFooter()
                }
            }
        }
    }
}

@Composable
private fun TembusLogo(modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(id = R.drawable.tembus_login_logo),
        contentDescription = "TEMBUS",
        modifier = modifier
            .fillMaxWidth(0.76f)
            .height(74.dp),
        contentScale = ContentScale.Fit
    )
}

@Composable
private fun AuthHeadline(entryMode: AuthEntryMode, isPasswordReset: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = if (isPasswordReset) {
                "Atur Ulang,\nPassword Anda."
            } else if (entryMode == AuthEntryMode.Register) {
                "Daftar Akun,\nMulai Kirim."
            } else {
                "Kirim Aman,\nSampai Tujuan."
            },
            color = Ink,
            fontSize = 28.sp,
            lineHeight = 36.sp,
            fontWeight = FontWeight.Black
        )
        Text(
            text = if (isPasswordReset) {
                "Masukkan email akun TEMBUS untuk menerima kode reset."
            } else if (entryMode == AuthEntryMode.Register) {
                "Buat akun untuk mulai mengatur pengiriman Anda."
            } else {
                "Masuk untuk melanjutkan pengiriman Anda."
            },
            color = Muted,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun GoogleButton(onClick: () -> Unit) {
    OutlinedButton(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.72f)),
        colors = ButtonDefaults.outlinedButtonColors(
            containerColor = Color.White,
            contentColor = Ink
        )
    ) {
        GoogleMark()
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = "Masuk dengan Google",
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun DividerWithText() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Divider(modifier = Modifier.weight(1f), color = Line)
        Text(
            text = "atau",
            color = Muted,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(horizontal = 16.dp)
        )
        Divider(modifier = Modifier.weight(1f), color = Line)
    }
}

@Composable
private fun PasswordResetPanel(
    email: String,
    onEmailChange: (String) -> Unit,
    code: String,
    onCodeChange: (String) -> Unit,
    newPassword: String,
    confirmPassword: String,
    showPassword: Boolean,
    onNewPasswordChange: (String) -> Unit,
    onConfirmPasswordChange: (String) -> Unit,
    onTogglePassword: () -> Unit,
    step: PasswordResetStep,
    state: PasswordResetState,
    localError: String?,
    isBusy: Boolean,
    onRequestCode: () -> Unit,
    onConfirm: () -> Unit,
    onBackToLogin: () -> Unit
) {
    val isRequestingCode = state is PasswordResetState.Sending
    val isConfirmingReset = state is PasswordResetState.Confirming
    val stateError = (state as? PasswordResetState.Error)?.message
    val errorMessage = localError ?: stateError
    val sentMessage = (state as? PasswordResetState.CodeSent)?.message
    val completedMessage = (state as? PasswordResetState.Completed)?.message

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        when (step) {
            PasswordResetStep.Request -> {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = AccentLight,
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, Accent.copy(alpha = 0.24f))
                ) {
                    Text(
                        text = "Kode reset berlaku 5 menit dan hanya bisa digunakan satu kali.",
                        modifier = Modifier.padding(14.dp),
                        color = PrimaryDark,
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
                LabeledTextField(
                    label = "Email",
                    value = email,
                    onValueChange = onEmailChange,
                    placeholder = "Masukkan email akun Anda",
                    keyboardType = KeyboardType.Email
                )
                ResetPrimaryButton(
                    label = "Kirim kode reset",
                    loadingLabel = "Mengirim kode...",
                    isLoading = isRequestingCode,
                    isEnabled = email.isNotBlank() && !isBusy,
                    onClick = onRequestCode
                )
            }

            PasswordResetStep.Confirm -> {
                NoticeBox(message = sentMessage ?: "Jika email terdaftar, kode reset sudah dikirim.")
                LabeledTextField(
                    label = "Kode reset",
                    value = code,
                    onValueChange = onCodeChange,
                    placeholder = "Masukkan 6 digit kode",
                    keyboardType = KeyboardType.NumberPassword
                )
                PasswordField(
                    password = newPassword,
                    showPassword = showPassword,
                    onPasswordChange = onNewPasswordChange,
                    onTogglePassword = onTogglePassword,
                    label = "Password baru",
                    placeholder = "Masukkan password baru"
                )
                PasswordField(
                    password = confirmPassword,
                    showPassword = showPassword,
                    onPasswordChange = onConfirmPasswordChange,
                    onTogglePassword = onTogglePassword,
                    label = "Konfirmasi password",
                    placeholder = "Ulangi password baru"
                )
                ResetPrimaryButton(
                    label = "Simpan password baru",
                    loadingLabel = "Menyimpan password...",
                    isLoading = isConfirmingReset,
                    isEnabled = code.length == 6 &&
                        newPassword.length >= 8 &&
                        confirmPassword.length >= 8 &&
                        !isBusy,
                    onClick = onConfirm
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(
                        onClick = onRequestCode,
                        enabled = !isBusy,
                        contentPadding = ButtonDefaults.TextButtonContentPadding
                    ) {
                        Text(
                            text = "Kirim ulang",
                            color = Primary,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    TextButton(
                        onClick = onBackToLogin,
                        enabled = !isBusy,
                        contentPadding = ButtonDefaults.TextButtonContentPadding
                    ) {
                        Text(
                            text = "Kembali masuk",
                            color = Muted,
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            PasswordResetStep.Complete -> {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = Secondary.copy(alpha = 0.08f),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, Secondary.copy(alpha = 0.28f))
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.CheckCircle,
                            contentDescription = null,
                            tint = Secondary,
                            modifier = Modifier.size(22.dp)
                        )
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = completedMessage ?: "Password berhasil diperbarui. Silakan masuk kembali.",
                            color = PrimaryDark,
                            fontSize = 13.sp,
                            lineHeight = 18.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                ResetPrimaryButton(
                    label = "Kembali masuk",
                    loadingLabel = "Kembali masuk",
                    isLoading = false,
                    isEnabled = true,
                    onClick = onBackToLogin
                )
            }
        }

        AnimatedVisibility(visible = errorMessage != null) {
            if (errorMessage != null) {
                Text(
                    text = errorMessage,
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Start
                )
            }
        }

        if (step == PasswordResetStep.Request) {
            OutlinedButton(
                onClick = onBackToLogin,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp),
                enabled = !isBusy,
                shape = RoundedCornerShape(14.dp),
                border = BorderStroke(1.dp, Primary.copy(alpha = 0.45f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = Color.White,
                    contentColor = Primary
                )
            ) {
                Text(
                    text = "Kembali masuk",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LabeledTextField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    keyboardType: KeyboardType,
    prefix: String? = null
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AuthFieldLabel(text = label)
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp),
            placeholder = { Text(placeholder, color = Muted) },
            leadingIcon = prefix?.let {
                {
                    Text(
                        text = it,
                        modifier = Modifier.padding(start = 16.dp),
                        color = PrimaryDark,
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = authTextFieldColors()
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PasswordField(
    password: String,
    showPassword: Boolean,
    onPasswordChange: (String) -> Unit,
    onTogglePassword: () -> Unit,
    label: String = "Password",
    placeholder: String = "Masukkan password"
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        AuthFieldLabel(text = label)
        OutlinedTextField(
            value = password,
            onValueChange = onPasswordChange,
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp),
            placeholder = { Text(placeholder, color = Muted) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = onTogglePassword) {
                    Icon(
                        imageVector = if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                        contentDescription = if (showPassword) "Sembunyikan password" else "Tampilkan password",
                        tint = Primary
                    )
                }
            },
            singleLine = true,
            shape = RoundedCornerShape(14.dp),
            colors = authTextFieldColors()
        )
    }
}

@Composable
private fun AuthFieldLabel(text: String) {
    Text(
        text = text,
        color = Ink,
        fontSize = 14.sp,
        fontWeight = FontWeight.Bold
    )
}

@Composable
private fun ResetPrimaryButton(
    label: String,
    loadingLabel: String,
    isLoading: Boolean,
    isEnabled: Boolean,
    onClick: () -> Unit
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(targetValue = if (isPressed) 0.98f else 1f)

    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(58.dp)
            .scale(scale),
        enabled = isEnabled,
        shape = RoundedCornerShape(14.dp),
        interactionSource = interactionSource,
        colors = ButtonDefaults.buttonColors(
            containerColor = Accent,
            contentColor = Color.White,
            disabledContainerColor = SurfaceVariant,
            disabledContentColor = TextDisabled
        )
    ) {
        Text(
            text = if (isLoading) loadingLabel else label,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun PrimaryAuthButton(
    entryMode: AuthEntryMode,
    isLoading: Boolean,
    isEnabled: Boolean,
    interactionSource: MutableInteractionSource,
    scale: Float,
    onClick: () -> Unit
) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(58.dp)
            .scale(scale),
        enabled = isEnabled,
        shape = RoundedCornerShape(14.dp),
        interactionSource = interactionSource,
        colors = ButtonDefaults.buttonColors(
            containerColor = Accent,
            contentColor = Color.White,
            disabledContainerColor = SurfaceVariant,
            disabledContentColor = TextDisabled
        )
    ) {
        if (isLoading) {
            Text(
                text = if (entryMode == AuthEntryMode.Register) "Membuat akun..." else "Memeriksa akun...",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
        } else {
            Row(
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (entryMode == AuthEntryMode.Register) "Daftar" else "Masuk",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.width(8.dp))
                Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null)
            }
        }
    }
}

@Composable
private fun BottomModeSwitch(
    entryMode: AuthEntryMode,
    onEntryModeChange: (AuthEntryMode) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = if (entryMode == AuthEntryMode.Register) "Sudah punya akun?" else "Belum punya akun?",
            color = Ink,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium
        )
        TextButton(
            onClick = {
                onEntryModeChange(
                    if (entryMode == AuthEntryMode.Register) AuthEntryMode.Login else AuthEntryMode.Register
                )
            },
            contentPadding = ButtonDefaults.TextButtonContentPadding
        ) {
            Text(
                text = if (entryMode == AuthEntryMode.Register) "Masuk" else "Daftar baru",
                color = Primary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun NoticeBox(message: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = AccentLight,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, Accent.copy(alpha = 0.25f))
    ) {
        Text(
            text = message,
            modifier = Modifier.padding(13.dp),
            color = PrimaryDark,
            fontSize = 12.sp,
            lineHeight = 17.sp,
            fontWeight = FontWeight.Medium
        )
    }
}

@Composable
private fun authTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedContainerColor = Color.White,
    unfocusedContainerColor = Color.White,
    disabledContainerColor = Color(0xFFF5F7FA),
    focusedBorderColor = Primary,
    unfocusedBorderColor = Line,
    focusedPlaceholderColor = Muted,
    unfocusedPlaceholderColor = Muted,
    focusedTextColor = Ink,
    unfocusedTextColor = Ink,
    cursorColor = Primary
)

@Composable
private fun GoogleMark() {
    Surface(
        modifier = Modifier.size(28.dp),
        color = Color.White,
        shape = CircleShape,
        border = BorderStroke(1.dp, Line)
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = "G",
                color = Secondary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Black
            )
        }
    }
}

@Composable
private fun SecurityFooter() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp, bottom = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Rounded.Lock,
            contentDescription = null,
            tint = Muted,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "Data akun dan transaksi dilindungi.",
            color = Muted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium
        )
    }
}
