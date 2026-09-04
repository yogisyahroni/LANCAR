package com.tembus.merchant.ui.screens.staff

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import com.tembus.merchant.ui.localization.MerchantText as Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.ui.appViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StaffAcceptScreen(
    merchantRepository: MerchantRepository,
    onDone: () -> Unit,
    initialToken: String? = null,
    viewModel: StaffAcceptViewModel = appViewModel { StaffAcceptViewModel(merchantRepository) }
) {
    val state by viewModel.uiState.collectAsState()
    var token by remember { mutableStateOf(initialToken?.trim() ?: "") }

    LaunchedEffect(initialToken) {
        if (initialToken != null && initialToken.isNotBlank() && !state.isLoading && !state.success) {
            viewModel.accept(initialToken)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Terima Undangan Staff") },
                navigationIcon = {
                    IconButton(onClick = onDone) {
                        Icon(Icons.Filled.Close, contentDescription = "Tutup")
                    }
                }
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                if (state.success) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = Icons.Filled.CheckCircle,
                            contentDescription = "",
                            modifier = Modifier.size(72.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = "Berhasil!",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            text = state.message,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(24.dp))
                        Button(onClick = onDone) { Text("Lanjut ke App") }
                    }
                } else {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            imageVector = getStaffIcon(),
                            contentDescription = "",
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(
                            text = "Undangan Staff",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "Masukkan token undangan yang dikirim ke email/WA kamu",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(32.dp))

                        OutlinedTextField(
                            value = token,
                            onValueChange = { token = it },
                            label = { Text("Token Undangan") },
                            placeholder = { Text("Contoh: abc123xyz...") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                            modifier = Modifier.fillMaxWidth(),
                            isError = state.errorMessage?.isNotBlank() == true
                        )

                        state.errorMessage?.let { msg ->
                            Spacer(Modifier.height(8.dp))
                            Text(msg, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
                        }

                        Spacer(Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.accept(token) },
                            enabled = !state.isLoading && token.isNotBlank(),
                            modifier = Modifier.fillMaxWidth().height(52.dp)
                        ) {
                            if (state.isLoading) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(22.dp),
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Text("Terima Undangan", style = MaterialTheme.typography.titleMedium)
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun getStaffIcon() = Icons.Filled.Groups
