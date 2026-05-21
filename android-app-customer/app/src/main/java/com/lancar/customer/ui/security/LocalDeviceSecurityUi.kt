package com.lancar.customer.ui.security

import android.content.Context
import android.content.ContextWrapper
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.Divider
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.lancar.customer.data.security.LocalDeviceSecurityManager

private val SecureBlue = Color(0xFF1565C0)
private val SecureGreen = Color(0xFF07884A)

@Composable
fun LocalSecuritySettingsPanel(
    securityManager: LocalDeviceSecurityManager,
    modifier: Modifier = Modifier,
    onNotice: (String) -> Unit = {}
) {
    val settings by securityManager.settings.collectAsState()
    var showPinSetup by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8FAFF)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(shape = RoundedCornerShape(14.dp), color = SecureBlue.copy(alpha = 0.12f)) {
                    Icon(
                        imageVector = Icons.Default.Security,
                        contentDescription = null,
                        tint = SecureBlue,
                        modifier = Modifier.padding(10.dp)
                    )
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Proteksi perangkat", fontWeight = FontWeight.Bold)
                    Text(
                        "PIN dan biometrik diproses lokal di HP ini.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF5D6B82)
                    )
                }
                Switch(
                    checked = settings.enabled,
                    onCheckedChange = { enabled ->
                        runCatching {
                            if (enabled && !settings.pinConfigured) {
                                showPinSetup = true
                            } else {
                                securityManager.setEnabled(enabled)
                                onNotice(if (enabled) "Proteksi perangkat aktif." else "Proteksi perangkat nonaktif.")
                            }
                        }.onFailure { errorMessage = it.message }
                    }
                )
            }

            Divider(color = Color(0xFFE1E7F0))

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = SecureGreen)
                Column(modifier = Modifier.weight(1f)) {
                    Text(if (settings.pinConfigured) "PIN 6 digit sudah aktif" else "PIN 6 digit belum dibuat")
                    Text(
                        "Dipakai sebagai fallback saat biometrik tidak tersedia.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF5D6B82)
                    )
                }
                OutlinedButton(onClick = { showPinSetup = true }) {
                    Text(if (settings.pinConfigured) "Ubah" else "Atur")
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Icon(Icons.Default.Fingerprint, contentDescription = null, tint = SecureBlue)
                Column(modifier = Modifier.weight(1f)) {
                    Text(if (settings.biometricSupported) "Biometrik perangkat" else "Biometrik belum tersedia")
                    Text(
                        if (settings.biometricSupported) "Sidik jari atau Face Unlock sesuai dukungan perangkat." else "Tambahkan biometric di pengaturan HP untuk mengaktifkan.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF5D6B82)
                    )
                }
                Switch(
                    checked = settings.biometricEnabled,
                    enabled = settings.pinConfigured && settings.enabled && settings.biometricSupported,
                    onCheckedChange = { enabled ->
                        runCatching {
                            securityManager.setBiometricEnabled(enabled)
                            onNotice(if (enabled) "Biometrik lokal aktif." else "Biometrik lokal nonaktif.")
                        }.onFailure { errorMessage = it.message }
                    }
                )
            }

            errorMessage?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (showPinSetup) {
        PinSetupDialog(
            onDismiss = { showPinSetup = false },
            onSubmit = { pin ->
                runCatching {
                    securityManager.configurePin(pin)
                    showPinSetup = false
                    errorMessage = null
                    onNotice("PIN perangkat tersimpan dan proteksi aktif.")
                }.onFailure { errorMessage = it.message }
            }
        )
    }
}

@Composable
fun LocalSecurityChallengeDialog(
    securityManager: LocalDeviceSecurityManager,
    title: String,
    message: String,
    onCancel: () -> Unit,
    onVerified: () -> Unit
) {
    val context = LocalContext.current
    val settings by securityManager.settings.collectAsState()
    var pin by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var biometricStarted by remember { mutableStateOf(false) }

    fun runBiometric() {
        biometricStarted = true
        launchBiometricPrompt(
            context = context,
            title = title,
            subtitle = message,
            onSuccess = onVerified,
            onUnavailable = { errorMessage = "Gunakan PIN perangkat untuk melanjutkan." }
        )
    }

    LaunchedEffect(settings.biometricEnabled, settings.biometricSupported) {
        if (settings.biometricEnabled && settings.biometricSupported && !biometricStarted) {
            runBiometric()
        }
    }

    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(title, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Text(message, color = Color(0xFF5D6B82))
                if (settings.biometricEnabled && settings.biometricSupported) {
                    OutlinedButton(onClick = { runBiometric() }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.Fingerprint, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text("Gunakan biometrik")
                    }
                }
                OutlinedTextField(
                    value = pin,
                    onValueChange = { value -> pin = value.filter(Char::isDigit).take(6) },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("PIN 6 digit") },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)
                )
                errorMessage?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (securityManager.verifyPin(pin)) {
                        errorMessage = null
                        onVerified()
                    } else {
                        errorMessage = "PIN tidak sesuai."
                    }
                },
                enabled = pin.length == 6,
                colors = ButtonDefaults.buttonColors(containerColor = SecureGreen)
            ) {
                Text("Verifikasi")
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text("Batal")
            }
        }
    )
}

@Composable
private fun PinSetupDialog(
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit
) {
    var pin by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    val canSubmit = pin.length == 6 && pin == confirmation

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Atur PIN perangkat", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("PIN ini hanya tersimpan terenkripsi di perangkat dan tidak dikirim ke server.")
                SecurePinField(label = "PIN 6 digit", value = pin, onValueChange = { pin = it })
                SecurePinField(label = "Ulangi PIN", value = confirmation, onValueChange = { confirmation = it })
                if (confirmation.isNotEmpty() && pin != confirmation) {
                    Text("Konfirmasi PIN belum sama.", color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(onClick = { onSubmit(pin) }, enabled = canSubmit) {
                Text("Simpan PIN")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Batal")
            }
        }
    )
}

@Composable
private fun SecurePinField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit
) {
    OutlinedTextField(
        value = value,
        onValueChange = { onValueChange(it.filter(Char::isDigit).take(6)) },
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword)
    )
}

private fun launchBiometricPrompt(
    context: Context,
    title: String,
    subtitle: String,
    onSuccess: () -> Unit,
    onUnavailable: () -> Unit
) {
    val activity = context.findFragmentActivity()
    if (activity == null) {
        onUnavailable()
        return
    }
    val prompt = BiometricPrompt(
        activity,
        ContextCompat.getMainExecutor(context),
        object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                onSuccess()
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                onUnavailable()
            }

            override fun onAuthenticationFailed() {
                onUnavailable()
            }
        }
    )
    val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle(title)
        .setSubtitle(subtitle)
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        .setNegativeButtonText("Gunakan PIN")
        .build()
    prompt.authenticate(promptInfo)
}

private tailrec fun Context.findFragmentActivity(): FragmentActivity? {
    return when (this) {
        is FragmentActivity -> this
        is ContextWrapper -> baseContext.findFragmentActivity()
        else -> null
    }
}
