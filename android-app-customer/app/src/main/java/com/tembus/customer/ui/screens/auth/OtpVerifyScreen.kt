package com.tembus.customer.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryDark
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.SurfaceVariant
import com.tembus.customer.ui.theme.TextDisabled

private val Ink = OnSurface
private val Muted = OnSurfaceVariant

/**
 * OtpVerifyScreen — digunakan untuk:
 *   1. Step-up OTP setelah Google Sign-In (flow = "google")
 *   2. Standalone OTP login / phone verification
 *
 * @param maskedRecipient  Nomor HP yang disamarkan, misal "+62 8** **** 4321"
 * @param channel          "whatsapp" atau "sms"
 * @param onVerifyCode     Dipanggil dengan kode 6 digit yang diinput user
 * @param onResend         Dipanggil ketika user minta kirim ulang
 * @param onBack           Dipanggil tombol kembali
 * @param otpState         State dari ViewModel
 */
@Composable
fun OtpVerifyScreen(
    maskedRecipient: String,
    channel: String,
    viewModel: GoogleAuthViewModel,
    onSuccess: () -> Unit,
    onBack: () -> Unit
) {
    val otpState by viewModel.otpState.collectAsState()
    val googleAuthState by viewModel.googleAuthState.collectAsState()

    var otpDigits by remember { mutableStateOf(List(6) { "" }) }
    var countdown by remember { mutableIntStateOf(60) }
    val focusRequesters = remember { List(6) { FocusRequester() } }

    // Auto-success navigation
    LaunchedEffect(googleAuthState) {
        if (googleAuthState is GoogleAuthUiState.Authenticated) {
            onSuccess()
        }
    }

    // Countdown timer
    LaunchedEffect(countdown) {
        if (countdown > 0) {
            delay(1000)
            countdown -= 1
        }
    }

    // Auto-verify when all 6 digits filled
    LaunchedEffect(otpDigits) {
        val code = otpDigits.joinToString("")
        if (code.length == 6 && otpState !is OtpUiState.Verifying) {
            viewModel.verifyOtp(code = code, phoneNumber = maskedRecipient)
        }
    }

    val isVerifying = otpState is OtpUiState.Verifying
    val isVerified = otpState is OtpUiState.Verified
    val error = (otpState as? OtpUiState.Error)?.message
    val channelLabel = if (channel == "sms") "SMS" else "WhatsApp"

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
                    .padding(horizontal = 30.dp, vertical = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 400.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    // Shield icon
                    Box(
                        modifier = Modifier
                            .size(72.dp)
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (isVerified) Secondary.copy(alpha = 0.12f) else Primary.copy(alpha = 0.10f)),
                        contentAlignment = Alignment.Center
                    ) {
                        if (isVerified) {
                            Icon(
                                imageVector = Icons.Rounded.CheckCircle,
                                contentDescription = null,
                                tint = Secondary,
                                modifier = Modifier.size(38.dp)
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Rounded.Security,
                                contentDescription = null,
                                tint = Primary,
                                modifier = Modifier.size(38.dp)
                            )
                        }
                    }

                    // Title
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = if (isVerified) "Verifikasi Berhasil!" else "Masukkan Kode OTP",
                            color = Ink,
                            fontSize = 26.sp,
                            fontWeight = FontWeight.Black,
                            textAlign = TextAlign.Center
                        )
                        Text(
                            text = if (isVerified) {
                                "Selamat datang! Mengalihkan ke dashboard..."
                            } else {
                                "Kode 6 digit telah dikirim melalui $channelLabel ke\n$maskedRecipient"
                            },
                            color = Muted,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.Center,
                            lineHeight = 20.sp
                        )
                    }

                    // OTP Box Input
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        otpDigits.forEachIndexed { index, digit ->
                            OtpDigitBox(
                                digit = digit,
                                isFocused = false,
                                isError = error != null,
                                isSuccess = isVerified,
                                focusRequester = focusRequesters[index],
                                onValueChange = { newVal ->
                                    val cleaned = newVal.filter { it.isDigit() }.take(1)
                                    val newDigits = otpDigits.toMutableList()
                                    newDigits[index] = cleaned
                                    otpDigits = newDigits
                                    if (cleaned.isNotEmpty() && index < 5) {
                                        focusRequesters[index + 1].requestFocus()
                                    }
                                },
                                onBackspace = {
                                    val newDigits = otpDigits.toMutableList()
                                    if (newDigits[index].isNotEmpty()) {
                                        newDigits[index] = ""
                                        otpDigits = newDigits
                                    } else if (index > 0) {
                                        focusRequesters[index - 1].requestFocus()
                                    }
                                },
                                onPaste = { pasted ->
                                    val digits = pasted.filter { it.isDigit() }.take(6)
                                    if (digits.length == 6) {
                                        otpDigits = digits.map { it.toString() }
                                        focusRequesters[5].requestFocus()
                                    }
                                }
                            )
                        }
                    }

                    // Auto-focus first box on entry
                    LaunchedEffect(Unit) {
                        delay(100)
                        focusRequesters[0].requestFocus()
                    }

                    // Error message
                    AnimatedVisibility(visible = error != null) {
                        if (error != null) {
                            Text(
                                text = error,
                                color = MaterialTheme.colorScheme.error,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                                textAlign = TextAlign.Center,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }

                    // Verify button (manual submit)
                    val codeLen = otpDigits.joinToString("").length
                    val isEnabled = codeLen == 6 && !isVerifying && !isVerified
                    val scale by animateFloatAsState(targetValue = if (isVerifying) 0.98f else 1f)

                    Button(
                        onClick = {
                            val code = otpDigits.joinToString("")
                            if (code.length == 6) {
                                viewModel.verifyOtp(code = code, phoneNumber = maskedRecipient)
                            }
                        },
                        enabled = isEnabled,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(58.dp)
                            .scale(scale),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Accent,
                            contentColor = Color.White,
                            disabledContainerColor = SurfaceVariant,
                            disabledContentColor = TextDisabled
                        )
                    ) {
                        Text(
                            text = when {
                                isVerified -> "Terverifikasi ✓"
                                isVerifying -> "Memverifikasi..."
                                else -> "Verifikasi"
                            },
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    // Resend + back
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        TextButton(
                            onClick = {
                                if (countdown == 0) {
                                    countdown = 60
                                    otpDigits = List(6) { "" }
                                    viewModel.sendOtp(phoneNumber = maskedRecipient, channel = channel)
                                }
                            },
                            enabled = countdown == 0 && !isVerifying && !isVerified
                        ) {
                            Text(
                                text = if (countdown > 0) "Kirim ulang dalam ${countdown}s" else "Kirim ulang kode",
                                color = if (countdown == 0) Primary else Muted,
                                fontSize = 14.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        TextButton(onClick = onBack) {
                            Text(
                                text = "← Kembali",
                                color = Muted,
                                fontSize = 13.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

// ─── Individual digit box ─────────────────────────────────────────────────────

@Composable
private fun OtpDigitBox(
    digit: String,
    isFocused: Boolean,
    isError: Boolean,
    isSuccess: Boolean,
    focusRequester: FocusRequester,
    onValueChange: (String) -> Unit,
    onBackspace: () -> Unit,
    onPaste: (String) -> Unit
) {
    val borderColor = when {
        isSuccess -> Secondary
        isError && digit.isEmpty() -> MaterialTheme.colorScheme.error.copy(alpha = 0.6f)
        digit.isNotEmpty() -> Primary
        else -> Color(0xFFD1D5DB)
    }
    val bgColor = when {
        isSuccess -> Secondary.copy(alpha = 0.06f)
        isError && digit.isEmpty() -> MaterialTheme.colorScheme.error.copy(alpha = 0.05f)
        else -> Color(0xFFF9FAFB)
    }

    Box(
        modifier = Modifier
            .size(width = 46.dp, height = 58.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(bgColor)
            .border(
                width = if (digit.isNotEmpty() || isFocused) 2.dp else 1.dp,
                color = borderColor,
                shape = RoundedCornerShape(12.dp)
            ),
        contentAlignment = Alignment.Center
    ) {
        androidx.compose.foundation.text.BasicTextField(
            value = digit,
            onValueChange = { newVal ->
                val paste = newVal.filter { it.isDigit() }
                if (paste.length > 1) onPaste(paste)
                else onValueChange(newVal)
            },
            modifier = Modifier
                .focusRequester(focusRequester)
                .onKeyEvent { event ->
                    if (event.key == Key.Backspace) {
                        onBackspace()
                        true
                    } else false
                },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            textStyle = androidx.compose.ui.text.TextStyle(
                color = if (isSuccess) Secondary else PrimaryDark,
                fontSize = 22.sp,
                fontWeight = FontWeight.Black,
                textAlign = TextAlign.Center
            ),
            decorationBox = { innerTextField ->
                Box(contentAlignment = Alignment.Center) {
                    innerTextField()
                }
            }
        )
    }
}
