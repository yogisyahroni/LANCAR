package com.tembus.customer.ui.screens.profile

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.model.MarketLegalDocument

private val LegalCanvas = androidx.compose.ui.graphics.Color(0xFFF7F8F6) // Figma legal-document shell

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacyTermsScreen(
    onBack: () -> Unit,
    viewModel: PrivacyTermsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    Scaffold(
        containerColor = LegalCanvas,
        topBar = {
            TopAppBar(
                title = { Text("Privasi & Ketentuan", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = LegalCanvas,
                    scrolledContainerColor = LegalCanvas,
                )
            )
        },
    ) { padding ->
        when (val current = state) {
            PrivacyTermsUiState.Loading -> Column(
                modifier = Modifier.fillMaxSize().padding(padding).background(LegalCanvas),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) { CircularProgressIndicator() }
            is PrivacyTermsUiState.Error -> Column(
                modifier = Modifier.fillMaxSize().padding(24.dp).background(LegalCanvas),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(current.message, color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(12.dp))
                Button(onClick = viewModel::load) { Text("Coba lagi") }
            }
            is PrivacyTermsUiState.Content -> LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).background(LegalCanvas),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Text(
                        "Dokumen berikut berasal dari konfigurasi pasar yang telah disetujui server.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                items(current.documents, key = { "${it.documentType}:${it.locale}:${it.version}" }) { document ->
                    LegalDocumentCard(
                        document = document,
                        onOpen = {
                            val uri = resolveApprovedLegalUri(document.documentUri, BuildConfig.BASE_URL, allowHttp = BuildConfig.DEBUG)
                            if (uri != null) {
                                try {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))
                                } catch (_: ActivityNotFoundException) {
                                    // No browser is available; keep the UI safe and actionable.
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun LegalDocumentCard(document: MarketLegalDocument, onOpen: () -> Unit) {
    val title = when (document.documentType.lowercase()) {
        "privacy" -> "Kebijakan Privasi"
        "terms" -> "Syarat & Ketentuan"
        else -> document.documentType.replace('_', ' ').replaceFirstChar { it.uppercase() }
    }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Description, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(title, fontWeight = FontWeight.Bold)
                Text(
                    "${document.locale} • versi ${document.version}",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            TextButton(onClick = onOpen) {
                Icon(Icons.Default.OpenInNew, contentDescription = null)
                Text("Buka")
            }
        }
    }
}
