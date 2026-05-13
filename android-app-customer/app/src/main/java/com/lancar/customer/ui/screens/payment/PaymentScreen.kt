package com.lancar.customer.ui.screens.payment

import android.annotation.SuppressLint
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentScreen(
    orderId: String,
    viewModel: PaymentViewModel = hiltViewModel(),
    onClose: () -> Unit,
    onPaymentSuccess: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(orderId) {
        viewModel.startPayment(orderId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pembayaran", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.surface)
        ) {
            when (val res = state) {
                is PaymentUiState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                is PaymentUiState.Error -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(res.message, color = MaterialTheme.colorScheme.error)
                    }
                }
                is PaymentUiState.Success -> {
                    PaymentWebView(
                        url = res.url,
                        onPaymentSuccess = onPaymentSuccess
                    )
                }
                else -> {}
            }
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PaymentWebView(url: String, onPaymentSuccess: () -> Unit) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                // =========================================================================
                // 🛡️ ENTERPRISE SECURITY: WEBVIEW HARDENING
                // =========================================================================
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                
                // Block access to local files to prevent local file inclusion (LFI) attacks
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                
                // Prevent mixed content (HTTP inside HTTPS)
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                
                // Enable SafeBrowsing
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    settings.safeBrowsingEnabled = true
                }

                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val loadedUrl = request?.url?.toString() ?: ""
                        
                        // Security check: Ensure URL is HTTPS
                        if (loadedUrl.startsWith("http://")) {
                            return true // Block cleartext redirects
                        }

                        // Detect gateway success redirect callbacks dynamically
                        if (loadedUrl.contains("/success") || loadedUrl.contains("/finish")) {
                            onPaymentSuccess()
                            return true
                        }
                        return false
                    }
                }
            }
        },
        update = { webView ->
            // Prevent loading plain http
            if (url.startsWith("https://")) {
                webView.loadUrl(url)
            }
        }
    )
}
