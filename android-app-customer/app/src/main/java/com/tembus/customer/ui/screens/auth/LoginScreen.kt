package com.tembus.customer.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.LocalShipping
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Map
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.config.AppConfig
import com.tembus.customer.ui.theme.Primary

private val Ink = Color(0xFF17212B)
private val Muted = Color(0xFF667085)
private val Line = Color(0xFFE1E7EF)
private val SurfaceSoft = Color(0xFFF4F8FB)
private val Success = Color(0xFF047857)

private enum class AuthEntryMode {
    Login,
    Register
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateToOtp: (String) -> Unit
) {
    val authState by viewModel.authState.collectAsState()
    val phoneNumber by viewModel.phoneNumber.collectAsState()
    val password by viewModel.password.collectAsState()

    LaunchedEffect(authState) {
        if (authState is AuthState.OtpSent) {
            onNavigateToOtp(phoneNumber)
            viewModel.resetState()
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = SurfaceSoft
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 22.dp, vertical = 22.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            val interactionSource = remember { MutableInteractionSource() }
            val isPressed by interactionSource.collectIsPressedAsState()
            val scale by animateFloatAsState(targetValue = if (isPressed) 0.98f else 1f)
            val isLoading = authState is AuthState.Loading
            var googleNoticeVisible by remember { mutableStateOf(false) }
            var entryMode by remember { mutableStateOf(AuthEntryMode.Login) }
            var registrationName by remember { mutableStateOf("") }
            var registrationPhone by remember { mutableStateOf("") }
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

            BrandHeader()
            DeliveryPreview()

            LoginCard(
                phoneNumber = phoneNumber,
                password = password,
                authState = authState,
                isLoading = isLoading,
                isEnabled = isEnabled,
                interactionSource = interactionSource,
                scale = scale,
                googleNoticeVisible = googleNoticeVisible,
                entryMode = entryMode,
                registrationName = registrationName,
                registrationPhone = registrationPhone,
                onGoogleClick = {
                    googleNoticeVisible = true
                    entryMode = AuthEntryMode.Login
                },
                onEntryModeChange = { mode ->
                    entryMode = mode
                    googleNoticeVisible = false
                    if (mode == AuthEntryMode.Login) {
                        viewModel.setPendingRegistrationProfile("", "")
                    }
                },
                onValueChange = { newValue ->
                    val isValid = if (AppConfig.IS_EMAIL_AUTH_ENABLED) {
                        !newValue.contains(" ")
                    } else {
                        newValue.all { it.isDigit() }
                    }
                    if (isValid) viewModel.setPhoneNumber(newValue)
                },
                onPasswordChange = { viewModel.setPassword(it.take(80)) },
                onRegistrationNameChange = { registrationName = it.take(60) },
                onRegistrationPhoneChange = { value ->
                    if (value.all { it.isDigit() } && value.length <= 15) {
                        registrationPhone = value
                    }
                },
                onSubmit = {
                    if (entryMode == AuthEntryMode.Register) {
                        viewModel.setPendingRegistrationProfile(registrationName, registrationPhone)
                        viewModel.startPasswordRegistration()
                    } else {
                        viewModel.startPasswordLogin()
                    }
                }
            )

            ServiceHighlights()
            SecurityFooter()
        }
    }
}

@Composable
private fun BrandHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = "TEMBUS",
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                color = Color(0xFF0B5CAD)
            )
            Text(
                text = "Kirim instan, pantau real-time.",
                fontSize = 14.sp,
                color = Muted
            )
        }
        Surface(
            color = Color.White,
            shape = RoundedCornerShape(18.dp),
            shadowElevation = 1.dp,
            border = BorderStroke(1.dp, Line)
        ) {
            Icon(
                imageVector = Icons.Rounded.LocalShipping,
                contentDescription = null,
                tint = Primary,
                modifier = Modifier.padding(14.dp).size(28.dp)
            )
        }
    }
}

@Composable
private fun DeliveryPreview() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White,
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, Line),
        shadowElevation = 1.dp
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        text = "On-demand delivery",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        color = Ink
                    )
                    Text(
                        text = "Pickup, tracking, dan POD dalam satu alur.",
                        fontSize = 13.sp,
                        color = Muted
                    )
                }
                Surface(
                    color = Color(0xFFEAF4FF),
                    shape = RoundedCornerShape(999.dp)
                ) {
                    Text(
                        text = "LIVE",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                        color = Primary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                RoutePoint(color = Success)
                Divider(
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                    color = Line,
                    thickness = 2.dp
                )
                Surface(
                    color = Primary,
                    shape = RoundedCornerShape(14.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.LocalShipping,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp).size(22.dp)
                    )
                }
                Divider(
                    modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
                    color = Line,
                    thickness = 2.dp
                )
                RoutePoint(color = Color(0xFFFF6B00))
            }
        }
    }
}

@Composable
private fun RoutePoint(color: Color) {
    Surface(
        color = color.copy(alpha = 0.12f),
        shape = CircleShape
    ) {
        Box(
            modifier = Modifier.padding(8.dp).size(12.dp).background(color, CircleShape)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LoginCard(
    phoneNumber: String,
    password: String,
    authState: AuthState,
    isLoading: Boolean,
    isEnabled: Boolean,
    interactionSource: MutableInteractionSource,
    scale: Float,
    googleNoticeVisible: Boolean,
    entryMode: AuthEntryMode,
    registrationName: String,
    registrationPhone: String,
    onGoogleClick: () -> Unit,
    onEntryModeChange: (AuthEntryMode) -> Unit,
    onValueChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onRegistrationNameChange: (String) -> Unit,
    onRegistrationPhoneChange: (String) -> Unit,
    onSubmit: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(
                    text = if (entryMode == AuthEntryMode.Register) "Daftar customer" else "Masuk ke TEMBUS",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Black,
                    color = Ink
                )
                Text(
                    text = if (entryMode == AuthEntryMode.Register) {
                        "Isi data dasar, lalu verifikasi email dengan OTP."
                    } else {
                        "Gunakan akun terdaftar atau Google untuk melanjutkan."
                    },
                    fontSize = 14.sp,
                    color = Muted
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                AuthModeButton(
                    text = "Masuk",
                    selected = entryMode == AuthEntryMode.Login,
                    modifier = Modifier.weight(1f),
                    onClick = { onEntryModeChange(AuthEntryMode.Login) }
                )
                AuthModeButton(
                    text = "Daftar baru",
                    selected = entryMode == AuthEntryMode.Register,
                    modifier = Modifier.weight(1f),
                    onClick = { onEntryModeChange(AuthEntryMode.Register) }
                )
            }

            OutlinedButton(
                onClick = onGoogleClick,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(16.dp),
                border = BorderStroke(1.dp, Color(0xFFD5DCE7)),
                colors = ButtonDefaults.outlinedButtonColors(
                    containerColor = Color.White,
                    contentColor = Ink
                )
            ) {
                GoogleMark()
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "Login with Google",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            AnimatedVisibility(visible = googleNoticeVisible) {
                Surface(
                    color = Color(0xFFFFF7ED),
                    shape = RoundedCornerShape(14.dp),
                    border = BorderStroke(1.dp, Color(0xFFFFD7A8))
                ) {
                    Text(
                        text = "Google Sign-In belum aktif di staging ini. Gunakan OTP email untuk melanjutkan pengujian.",
                        modifier = Modifier.padding(12.dp),
                        color = Color(0xFF9A4B00),
                        fontSize = 12.sp,
                        lineHeight = 17.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Divider(modifier = Modifier.weight(1f), color = Line)
                Text(
                    text = "atau",
                    color = Color(0xFF98A2B3),
                    fontSize = 12.sp,
                    modifier = Modifier.padding(horizontal = 12.dp)
                )
                Divider(modifier = Modifier.weight(1f), color = Line)
            }

            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                AnimatedVisibility(visible = entryMode == AuthEntryMode.Register) {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        OutlinedTextField(
                            value = registrationName,
                            onValueChange = onRegistrationNameChange,
                            label = { Text("Nama lengkap") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = authTextFieldColors(),
                            singleLine = true
                        )

                        OutlinedTextField(
                            value = registrationPhone,
                            onValueChange = onRegistrationPhoneChange,
                            label = { Text("Nomor handphone") },
                            leadingIcon = {
                                Text(
                                    text = "+62",
                                    modifier = Modifier.padding(start = 16.dp, end = 8.dp),
                                    fontWeight = FontWeight.SemiBold,
                                    color = Ink
                                )
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = authTextFieldColors(),
                            singleLine = true
                        )
                    }
                }

                OutlinedTextField(
                    value = phoneNumber,
                    onValueChange = onValueChange,
                    label = { Text("Alamat email") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = authTextFieldColors(),
                    singleLine = true
                )

                OutlinedTextField(
                    value = password,
                    onValueChange = onPasswordChange,
                    label = { Text("Password") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = authTextFieldColors(),
                    singleLine = true
                )

                Text(
                        text = if (entryMode == AuthEntryMode.Register) {
                            "Setelah data akun disimpan, OTP dikirim ke email untuk verifikasi."
                        } else {
                            "OTP hanya diminta saat perangkat baru terdeteksi."
                        },
                    color = Muted,
                    fontSize = 12.sp,
                    lineHeight = 16.sp
                )

                Button(
                    onClick = onSubmit,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                        .scale(scale),
                    enabled = isEnabled,
                    shape = RoundedCornerShape(16.dp),
                    interactionSource = interactionSource,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Primary,
                        disabledContainerColor = Color(0xFFE2E8F0),
                        disabledContentColor = Color(0xFF94A3B8)
                    )
                ) {
                    if (isLoading) {
                        Text(
                            text = if (entryMode == AuthEntryMode.Register) "Memproses daftar..." else "Memeriksa akun...",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                    } else {
                        Row(
                            horizontalArrangement = Arrangement.Center,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = if (entryMode == AuthEntryMode.Register) "Daftar dan kirim OTP" else "Masuk",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null)
                        }
                    }
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
        }
    }
}

@Composable
private fun AuthModeButton(
    text: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    if (selected) {
        Button(
            onClick = onClick,
            modifier = modifier.height(44.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Primary)
        ) {
            Text(text = text, fontWeight = FontWeight.Bold)
        }
    } else {
        OutlinedButton(
            onClick = onClick,
            modifier = modifier.height(44.dp),
            shape = RoundedCornerShape(14.dp),
            border = BorderStroke(1.dp, Line),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = Ink)
        ) {
            Text(text = text, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun authTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = Primary,
    unfocusedBorderColor = Line,
    focusedLabelColor = Primary,
    cursorColor = Primary
)

@Composable
private fun GoogleMark() {
    Surface(
        modifier = Modifier.size(28.dp),
        color = Color.White,
        shape = CircleShape,
        border = BorderStroke(1.dp, Color(0xFFE4E7EC))
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = "G",
                color = Color(0xFF4285F4),
                fontSize = 16.sp,
                fontWeight = FontWeight.Black
            )
        }
    }
}

@Composable
private fun ServiceHighlights() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White,
        shape = RoundedCornerShape(24.dp),
        border = BorderStroke(1.dp, Line),
        shadowElevation = 1.dp
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = "Layanan untuk kebutuhan harian",
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = Color(0xFF0B3D2E)
            )
            HighlightRow(
                icon = Icons.Rounded.Schedule,
                title = "Kurir on-demand",
                body = "Request diteruskan ke kurir aktif terdekat."
            )
            HighlightRow(
                icon = Icons.Rounded.Map,
                title = "Tracking transparan",
                body = "Pantau posisi, timeline, chat, dan bukti pengiriman."
            )
            HighlightRow(
                icon = Icons.Rounded.Inventory2,
                title = "Bukti pickup & POD",
                body = "Foto barang dan bukti terima tersimpan untuk audit."
            )
        }
    }
}

@Composable
private fun HighlightRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    body: String
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top
    ) {
        Surface(
            color = Color(0xFFEAF4FF),
            shape = RoundedCornerShape(14.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Primary,
                modifier = Modifier.padding(10.dp).size(22.dp)
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = title,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = Ink
            )
            Text(
                text = body,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                color = Muted,
                modifier = Modifier.widthIn(max = 360.dp)
            )
        }
    }
}

@Composable
private fun SecurityFooter() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 4.dp),
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
