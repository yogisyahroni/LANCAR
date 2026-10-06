package com.tembus.merchant.ui.screens.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.localization.MerchantText as Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountRegistrationScreen(
    onBack: () -> Unit,
    viewModel: AccountRegistrationViewModel = appViewModel { AccountRegistrationViewModel(it.authRepository) }
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.step == AccountRegistrationStep.FORM) "Buat akun TEMBUS" else "Verifikasi akun") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            when (state.step) {
                AccountRegistrationStep.FORM -> AccountForm(
                    state = state,
                    onFullNameChange = viewModel::onFullNameChange,
                    onEmailChange = viewModel::onEmailChange,
                    onPhoneChange = viewModel::onPhoneChange,
                    onPasswordChange = viewModel::onPasswordChange,
                    onPasswordConfirmationChange = viewModel::onPasswordConfirmationChange,
                    onSubmit = viewModel::startRegistration,
                    onExistingAccount = onBack,
                    errorMessage = state.errorMessage
                )

                AccountRegistrationStep.OTP -> OtpForm(
                    state = state,
                    onOtpChange = viewModel::onOtpChange,
                    onVerify = viewModel::verifyOtp,
                    onResend = viewModel::startRegistration,
                    onEdit = viewModel::backToForm,
                    errorMessage = state.errorMessage
                )
            }
        }
    }
}

@Composable
private fun AccountForm(
    state: AccountRegistrationUiState,
    onFullNameChange: (String) -> Unit,
    onEmailChange: (String) -> Unit,
    onPhoneChange: (String) -> Unit,
    onPasswordChange: (String) -> Unit,
    onPasswordConfirmationChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onExistingAccount: () -> Unit,
    errorMessage: String?
) {
    Text(
        text = "Buat akun sebelum mendaftar",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold
    )
    Text(
        text = "Kamu belum perlu punya toko atau status approved. Buat akun TEMBUS dulu, lalu isi pengajuan merchant perorangan. Jika verifikasi email aktif, kode akan diminta setelah data dikirim.",
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )

    Spacer(modifier = Modifier.height(8.dp))
    OutlinedTextField(
        value = state.fullName,
        onValueChange = onFullNameChange,
        label = { Text("Nama lengkap") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
        modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = state.email,
        onValueChange = onEmailChange,
        label = { Text("Email") },
        supportingText = { Text("Dipakai untuk verifikasi bila diwajibkan.") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Email,
            imeAction = ImeAction.Next
        ),
        modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = state.phoneNumber,
        onValueChange = onPhoneChange,
        label = { Text("Nomor handphone") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Phone,
            imeAction = ImeAction.Next
        ),
        modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = state.password,
        onValueChange = onPasswordChange,
        label = { Text("Password") },
        supportingText = { Text("Minimal 8 karakter.") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Password,
            imeAction = ImeAction.Next
        ),
        modifier = Modifier.fillMaxWidth()
    )
    OutlinedTextField(
        value = state.passwordConfirmation,
        onValueChange = onPasswordConfirmationChange,
        label = { Text("Ulangi password") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Password,
            imeAction = ImeAction.Done
        ),
        modifier = Modifier.fillMaxWidth()
    )

    Text(
        text = "Setelah akun siap, persetujuan dan dokumen merchant akan diminta di langkah pengajuan.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    errorMessage?.let { message ->
        Text(
            text = message,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium
        )
    }
    Spacer(modifier = Modifier.height(8.dp))
    Button(
        onClick = onSubmit,
        enabled = !state.isLoading,
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
    ) {
        if (state.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.height(22.dp),
                color = MaterialTheme.colorScheme.onPrimary,
                strokeWidth = 2.dp
            )
        } else {
            Text("Buat akun & lanjutkan")
        }
    }
    TextButton(
        onClick = onExistingAccount,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text("Sudah punya akun? Masuk")
    }
}

@Composable
private fun OtpForm(
    state: AccountRegistrationUiState,
    onOtpChange: (String) -> Unit,
    onVerify: () -> Unit,
    onResend: () -> Unit,
    onEdit: () -> Unit,
    errorMessage: String?
) {
    Text(
        text = "Verifikasi email",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold
    )
    Text(
        text = "Kode verifikasi dikirim ke ${maskEmail(state.email)}. Masukkan kode tersebut untuk mengaktifkan akun TEMBUS.",
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
    errorMessage?.let { message ->
        Text(
            text = message,
            color = MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodyMedium
        )
    }
    Spacer(modifier = Modifier.height(12.dp))
    OutlinedTextField(
        value = state.otp,
        onValueChange = onOtpChange,
        label = { Text("Kode verifikasi") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Number,
            imeAction = ImeAction.Done
        ),
        modifier = Modifier.fillMaxWidth()
    )
    Button(
        onClick = onVerify,
        enabled = !state.isLoading,
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
    ) {
        if (state.isLoading) {
            CircularProgressIndicator(
                modifier = Modifier.height(22.dp),
                color = MaterialTheme.colorScheme.onPrimary,
                strokeWidth = 2.dp
            )
        } else {
            Text("Verifikasi & lanjutkan")
        }
    }
    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
    TextButton(onClick = onResend, enabled = !state.isLoading, modifier = Modifier.fillMaxWidth()) {
        Text("Kirim ulang kode")
    }
    TextButton(onClick = onEdit, enabled = !state.isLoading, modifier = Modifier.fillMaxWidth()) {
        Text("Ubah data akun")
    }
    Text(
        text = "Setelah verifikasi berhasil, kamu langsung diarahkan ke pengajuan merchant perorangan.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth()
    )
}

private fun maskEmail(email: String): String {
    val separator = email.indexOf('@')
    if (separator <= 1) return email
    return email.first() + "***" + email.substring(separator)
}
