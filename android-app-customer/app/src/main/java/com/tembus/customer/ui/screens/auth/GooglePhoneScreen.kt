package com.tembus.customer.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material.icons.rounded.Phone
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.AccentLight
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryDark
import com.tembus.customer.ui.theme.SurfaceVariant
import com.tembus.customer.ui.theme.TextDisabled

private val InkG = OnSurface
private val MutedG = OnSurfaceVariant
private val LineG = Outline

/**
 * GooglePhoneScreen — tampil saat Google Sign-In berhasil tetapi user belum punya
 * akun Tembus (status == "requires_phone").
 *
 * Alur:
 *  1. Tampilkan info akun Google (nama, email)
 *  2. Minta nomor HP
 *  3. Kirim OTP ke nomor tersebut
 *  4. Setelah OTP terkirim → navigasi ke OtpVerifyScreen
 *
 * @param googleFullName     Nama dari akun Google (pre-filled dari backend)
 * @param googleEmail        Email dari akun Google
 * @param transactionId      ID transaksi Google auth untuk di-link ke OTP
 * @param viewModel          GoogleAuthViewModel
 * @param onOtpSent          Dipanggil setelah OTP berhasil dikirim; membawa maskedRecipient + channel
 * @param onBack             Dipanggil ketika user menekan tombol kembali
 */
@Composable
fun GooglePhoneScreen(
    googleFullName: String,
    googleEmail: String,
    transactionId: String,
    viewModel: GoogleAuthViewModel,
    onOtpSent: (maskedRecipient: String, channel: String) -> Unit,
    onBack: () -> Unit
) {
    val otpState by viewModel.otpState.collectAsState()

    var phoneNumber by remember { mutableStateOf("") }
    val isSending = otpState is OtpUiState.Sending
    val error = (otpState as? OtpUiState.Error)?.message

    // Trigger navigation when OTP is successfully sent
    LaunchedEffect(otpState) {
        val sent = otpState as? OtpUiState.Sent
        if (sent != null) {
            onOtpSent(sent.maskedRecipient, sent.channel)
        }
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
                    .padding(horizontal = 30.dp, vertical = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .widthIn(max = 400.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    // Header
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(
                            text = "Satu Langkah Lagi,\nMasukkan No. HP.",
                            color = InkG,
                            fontSize = 28.sp,
                            lineHeight = 36.sp,
                            fontWeight = FontWeight.Black
                        )
                        Text(
                            text = "Akun Google kamu ditemukan. Masukkan nomor handphone untuk mengaktifkan akun Tembus.",
                            color = MutedG,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Medium,
                            lineHeight = 20.sp
                        )
                    }

                    // Google account info card
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = AccentLight,
                        shape = RoundedCornerShape(14.dp),
                        border = BorderStroke(1.dp, Primary.copy(alpha = 0.18f))
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text(
                                text = "Akun Google terdeteksi",
                                color = PrimaryDark,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 0.5.sp
                            )
                            if (googleFullName.isNotBlank()) {
                                Text(
                                    text = googleFullName,
                                    color = InkG,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                            if (googleEmail.isNotBlank()) {
                                Text(
                                    text = googleEmail,
                                    color = MutedG,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }

                    // Phone number field
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            text = "Nomor handphone",
                            color = InkG,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        OutlinedTextField(
                            value = phoneNumber,
                            onValueChange = { value ->
                                if (value.all { it.isDigit() } && value.length <= 15) {
                                    phoneNumber = value
                                }
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(58.dp),
                            placeholder = {
                                Text("Contoh: 81234567890", color = MutedG)
                            },
                            leadingIcon = {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(start = 14.dp, end = 4.dp)
                                ) {
                                    Text(
                                        text = "+62",
                                        color = PrimaryDark,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp
                                    )
                                }
                            },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Primary,
                                unfocusedBorderColor = LineG,
                                focusedTextColor = InkG,
                                unfocusedTextColor = InkG,
                                cursorColor = Primary,
                                focusedContainerColor = Color.White,
                                unfocusedContainerColor = Color.White
                            )
                        )
                    }

                    // OTP channel selector
                    Text(
                        text = "Kode OTP akan dikirim melalui WhatsApp.",
                        color = MutedG,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )

                    // Error
                    AnimatedVisibility(visible = error != null) {
                        if (error != null) {
                            Text(
                                text = error,
                                color = MaterialTheme.colorScheme.error,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Medium,
                                modifier = Modifier.fillMaxWidth()
                            )
                        }
                    }

                    // CTA
                    Button(
                        onClick = {
                            val normalized = "+62$phoneNumber"
                            viewModel.sendOtp(
                                phoneNumber = normalized,
                                channel = "whatsapp",
                                transactionId = transactionId
                            )
                        },
                        enabled = phoneNumber.length >= 9 && !isSending,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(58.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Accent,
                            contentColor = Color.White,
                            disabledContainerColor = SurfaceVariant,
                            disabledContentColor = TextDisabled
                        )
                    ) {
                        Text(
                            text = if (isSending) "Mengirim OTP..." else "Kirim Kode OTP",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }

                    TextButton(onClick = onBack, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                        Text(
                            text = "← Kembali ke Login",
                            color = MutedG,
                            fontSize = 13.sp
                        )
                    }
                }
            }
        }
    }
}
