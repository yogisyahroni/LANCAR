package com.tembus.customer.ui.screens.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.AccountCircle
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.ui.theme.Primary

@Composable
fun CompleteProfileScreen(
    viewModel: AuthViewModel,
    onCompleted: () -> Unit
) {
    val authState by viewModel.authState.collectAsState()
    val pendingName by viewModel.pendingRegistrationName.collectAsState()
    var fullName by remember { mutableStateOf(pendingName) }
    val isLoading = authState is AuthState.Loading
    val agreedToTerms by viewModel.agreedToTerms.collectAsState()
    val canSubmit = fullName.trim().length >= 2 && !isLoading && agreedToTerms

    LaunchedEffect(pendingName) {
        if (fullName.isBlank() && pendingName.isNotBlank()) {
            fullName = pendingName
        }
    }

    LaunchedEffect(authState) {
        if (authState is AuthState.ProfileCompleted) {
            viewModel.resetState()
            onCompleted()
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = Color(0xFFF4F8FB)
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 22.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "Lengkapi profil",
                    fontSize = 30.sp,
                    fontWeight = FontWeight.Black,
                    color = Color(0xFF17212B)
                )
                Text(
                    text = "Satu langkah lagi sebelum kamu mulai membuat pengiriman.",
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    color = Color(0xFF667085)
                )
            }

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
                    Surface(
                        color = Color(0xFFEAF4FF),
                        shape = RoundedCornerShape(18.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(14.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.AccountCircle,
                                contentDescription = null,
                                tint = Primary,
                                modifier = Modifier.size(34.dp)
                            )
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(
                                    text = "Akun baru terdeteksi",
                                    fontSize = 16.sp,
                                    fontWeight = FontWeight.Black,
                                    color = Color(0xFF17212B)
                                )
                                Text(
                                    text = "Nama ini akan tampil di pesanan dan riwayat transaksi.",
                                    fontSize = 12.sp,
                                    lineHeight = 17.sp,
                                    color = Color(0xFF667085)
                                )
                            }
                        }
                    }

                    OutlinedTextField(
                        value = fullName,
                        onValueChange = { value ->
                            if (value.length <= 60) fullName = value
                        },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Nama lengkap") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Words,
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Done
                        ),
                        shape = RoundedCornerShape(16.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = Color(0xFF111827),
                            unfocusedTextColor = Color(0xFF111827),
                            disabledTextColor = Color(0xFF667085),
                            focusedContainerColor = Color.White,
                            unfocusedContainerColor = Color.White,
                            disabledContainerColor = Color(0xFFF5F7FA),
                            focusedBorderColor = Primary,
                            unfocusedBorderColor = Color(0xFFE1E7EF),
                            focusedLabelColor = Primary,
                            unfocusedLabelColor = Color(0xFF667085),
                            focusedPlaceholderColor = Color(0xFF667085),
                            unfocusedPlaceholderColor = Color(0xFF667085),
                            cursorColor = Primary
                        )
                    )

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

                    Spacer(modifier = Modifier.height(4.dp))
                    TermsCheckboxCustomer(
                        checked = viewModel.agreedToTerms.collectAsState().value,
                        onCheckedChange = { viewModel.setAgreedToTerms(it) }
                    )

                    Button(
                        onClick = { viewModel.completeProfile(fullName) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        enabled = canSubmit,
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Primary,
                            disabledContainerColor = Color(0xFFE2E8F0),
                            disabledContentColor = Color(0xFF94A3B8)
                        )
                    ) {
                        if (isLoading) {
                            Text(
                                text = "Menyimpan...",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        } else {
                            Text(
                                text = "Simpan dan lanjut",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.size(8.dp))
                            Icon(Icons.AutoMirrored.Rounded.ArrowForward, contentDescription = null)
                        }
                    }
                }
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White,
                shape = RoundedCornerShape(20.dp),
                border = BorderStroke(1.dp, Color(0xFFE1E7EF))
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    TrustRow("Identitas akun dipakai untuk bukti pengiriman.")
                    TrustRow("Data kontak membantu kurir dan customer support.")
                    TrustRow("Kamu bisa mengubah profil dari menu akun.")
                }
            }
        }
    }
}

@Composable
private fun TrustRow(text: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = Icons.Rounded.CheckCircle,
            contentDescription = null,
            tint = Color(0xFF047857),
            modifier = Modifier.size(20.dp)
        )
        Text(
            text = text,
            color = Color(0xFF475467),
            fontSize = 13.sp,
            lineHeight = 18.sp
        )
    }
}

@Composable
private fun TermsCheckboxCustomer(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable { onCheckedChange(!checked) }
            .padding(vertical = 6.dp, horizontal = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = onCheckedChange
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "Saya setuju dengan",
                style = MaterialTheme.typography.bodySmall,
                color = Color(0xFF667085)
            )
            Text(
                text = "Syarat & Ketentuan dan Kebijakan Privasi TEMBUS",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Bold,
                color = Primary
            )
        }
    }
}
