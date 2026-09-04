package com.tembus.customer.ui.screens.payment

import android.annotation.SuppressLint
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.tembus.customer.ui.withTestTag
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.FoodPaymentItem
import com.tembus.customer.data.security.LocalDeviceSecurityManager
import com.tembus.customer.ui.security.LocalSecurityChallengeDialog
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.Warning
import com.tembus.customer.ui.a11y.criticalAction
import java.text.NumberFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentScreen(
    orderId: String,
    viewModel: PaymentViewModel = hiltViewModel(),
    onClose: () -> Unit,
    onPaymentSuccess: () -> Unit
) {
    val context = LocalContext.current
    val localSecurityManager = remember(context) {
        LocalDeviceSecurityManager(context.applicationContext)
    }
    val localSecuritySettings by localSecurityManager.settings.collectAsState()
    val state by viewModel.uiState.collectAsState()
    var pendingSecurePayment by remember { mutableStateOf(false) }

    LaunchedEffect(orderId) {
        viewModel.loadPaymentStatus(orderId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Pembayaran", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onClose, modifier = Modifier.criticalAction("Tutup pembayaran")) {
                        Icon(Icons.Default.Close, contentDescription = CustomerTextCatalog.translate("Tutup pembayaran"))
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            when (val result = state) {
                is PaymentUiState.Choosing -> PaymentMethodChooser(
                    state = result,
                    onSelectMethod = viewModel::selectMethod,
                    onPay = {
                        if (localSecuritySettings.active) {
                            pendingSecurePayment = true
                        } else {
                            viewModel.startPayment(orderId)
                        }
                    }
                )
                is PaymentUiState.Loading -> CenterPaymentState(
                    title = "Menyiapkan ${result.method.title}",
                    subtitle = "Kami sedang membuat sesi pembayaran yang aman."
                )
                is PaymentUiState.Verifying -> CenterPaymentState(
                    title = "Mengecek pembayaran",
                    subtitle = "Status dikonfirmasi dari server pembayaran."
                )
                is PaymentUiState.Paid -> {
                    LaunchedEffect(Unit) {
                        onPaymentSuccess()
                    }
                    CenterPaymentState(
                        title = "Pembayaran berhasil",
                        subtitle = "Order diteruskan ke sistem dispatch kurir."
                    )
                }
                is PaymentUiState.Expired -> PaymentMessageState(
                    title = "Sesi kedaluwarsa",
                    message = result.message,
                    actionLabel = "Pilih metode lagi",
                    onAction = { viewModel.selectMethod(result.selectedMethod) }
                )
                is PaymentUiState.Error -> PaymentMessageState(
                    title = "Pembayaran belum bisa diproses",
                    message = result.message,
                    actionLabel = "Coba lagi",
                    onAction = { viewModel.selectMethod(result.selectedMethod) }
                )
                is PaymentUiState.Ready -> PaymentWebView(
                    url = result.url,
                    onPaymentSuccess = { viewModel.verifyPayment(orderId) }
                )
            }
        }
    }

    if (pendingSecurePayment) {
        LocalSecurityChallengeDialog(
            securityManager = localSecurityManager,
            title = "Verifikasi pembayaran",
            message = "Gunakan PIN atau biometrik lokal untuk melanjutkan pembayaran.",
            onCancel = { pendingSecurePayment = false },
            onVerified = {
                pendingSecurePayment = false
                viewModel.startPayment(orderId)
            }
        )
    }
}

@Composable
private fun PaymentMethodChooser(
    state: PaymentUiState.Choosing,
    onSelectMethod: (CustomerPaymentMethod) -> Unit,
    onPay: () -> Unit
) {
    val selectedMethod = state.selectedMethod
    val lapayInsufficient = selectedMethod == CustomerPaymentMethod.LAPAY &&
        state.amountIdr > 0L &&
        state.walletBalanceIdr < state.amountIdr
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(TembusRadius.Card),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp)
            ) {
                Text(
                    text = "Pilih metode pembayaran",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "Pembayaran hanya diproses oleh server. Mobile app tidak bisa mengubah status lunas.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                PaymentItemsBlock(state.items)
                PaymentAmountBlock(state.amountIdr)
                PaymentMethodCard(
                    method = CustomerPaymentMethod.LAPAY,
                    selected = selectedMethod == CustomerPaymentMethod.LAPAY,
                    amountIdr = state.amountIdr,
                    walletBalanceIdr = state.walletBalanceIdr,
                    onClick = { onSelectMethod(CustomerPaymentMethod.LAPAY) }
                )
                if (state.activePaymentProvider != "none" && state.activePaymentProvider != "lapay") {
                    PaymentMethodCard(
                        method = CustomerPaymentMethod.QRIS,
                        selected = selectedMethod == CustomerPaymentMethod.QRIS,
                        amountIdr = state.amountIdr,
                        walletBalanceIdr = state.walletBalanceIdr,
                        onClick = { onSelectMethod(CustomerPaymentMethod.QRIS) }
                    )
                }
                state.message?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = Warning
                    )
                }
                Button(
                    onClick = onPay,
                    enabled = !lapayInsufficient,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(58.dp)
                        .criticalAction("Lanjutkan pembayaran")
                        .withTestTag("payment_pay_button"),
                    shape = RoundedCornerShape(TembusRadius.Button),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF07884A))
                ) {
                    Text(
                        text = when (selectedMethod) {
                            CustomerPaymentMethod.LAPAY -> if (lapayInsufficient) "Saldo LAPAY belum cukup" else "Bayar dengan LAPAY"
                            CustomerPaymentMethod.QRIS -> "Lanjutkan ke QRIS"
                        },
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "")
                }
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(TembusRadius.Card),
            color = MaterialTheme.colorScheme.primaryContainer
        ) {
            Row(
                modifier = Modifier.padding(18.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Security,
                    contentDescription = "",
                    tint = Color(0xFF07884A),
                    modifier = Modifier.size(28.dp)
                )
                Spacer(modifier = Modifier.width(14.dp))
                Text(
                    text = if (state.activePaymentProvider == "none" || state.activePaymentProvider == "lapay") {
                        "Pembayaran diproses aman melalui saldo LAPAY resmi TEMBUS."
                    } else {
                        "Pembayaran diproses aman melalui saldo LAPAY atau QRIS resmi TEMBUS."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = Color(0xFF084C2E)
                )
            }
        }
    }
}

@Composable
private fun PaymentItemsBlock(items: List<FoodPaymentItem>?) {
    if (items.isNullOrEmpty()) return
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "Ringkasan pesanan",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            items.forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Top
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "${item.quantity}× ${item.itemName}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        if (!item.notes.isNullOrBlank()) {
                            Text(
                                text = item.notes,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    Text(
                        text = formatRupiah(item.subtotal),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }
    }
}

@Composable
private fun PaymentAmountBlock(amountIdr: Long) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(TembusRadius.Card),
        color = MaterialTheme.colorScheme.primaryContainer
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = "Total pembayaran",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = formatRupiah(amountIdr),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}

@Composable
private fun PaymentMethodCard(
    method: CustomerPaymentMethod,
    selected: Boolean,
    amountIdr: Long,
    walletBalanceIdr: Long,
    onClick: () -> Unit
) {
    val isLapay = method == CustomerPaymentMethod.LAPAY
    val balanceSufficient = !isLapay || walletBalanceIdr >= amountIdr
    val borderColor = when {
        selected -> Color(0xFF07884A)  // brand LAPAY green (by design)
        !balanceSufficient -> Warning
        else -> MaterialTheme.colorScheme.outline
    }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(TembusRadius.Card))
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(TembusRadius.Card),
        color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.5.dp, borderColor)
    ) {
        Row(
            modifier = Modifier.padding(18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(if (isLapay) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.secondaryContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = if (isLapay) Icons.Default.AccountBalanceWallet else Icons.Default.Payment,
                    contentDescription = "",
                    tint = if (isLapay) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary
                )
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    text = method.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = if (isLapay) {
                        "Saldo: ${formatRupiah(walletBalanceIdr)}"
                    } else {
                        method.description
                    },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (balanceSufficient) MaterialTheme.colorScheme.onSurfaceVariant else Warning
                )
            }
            if (selected) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = CustomerTextCatalog.translate("Dipilih"),
                    tint = MaterialTheme.colorScheme.primary
                )
            }
        }
    }
}

@Composable
private fun CenterPaymentState(title: String, subtitle: String) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.height(18.dp))
        Text(title, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = subtitle,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

@Composable
private fun PaymentMessageState(
    title: String,
    message: String,
    actionLabel: String,
    onAction: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(title, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        Spacer(modifier = Modifier.height(8.dp))
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(modifier = Modifier.height(18.dp))
        OutlinedButton(onClick = onAction, modifier = Modifier.criticalAction(actionLabel), shape = RoundedCornerShape(TembusRadius.Button)) {
            Text(actionLabel)
        }
    }
}

private fun formatRupiah(value: Long): String {
    val formatter = NumberFormat.getCurrencyInstance(Locale("id", "ID"))
    formatter.maximumFractionDigits = 0
    return formatter.format(value).replace("Rp", "Rp ")
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun PaymentWebView(url: String, onPaymentSuccess: () -> Unit) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    settings.safeBrowsingEnabled = true
                }

                webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                        val loadedUrl = request?.url?.toString() ?: ""
                        if (loadedUrl.startsWith("http://")) return true
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
            if (url.startsWith("https://")) {
                webView.loadUrl(url)
            }
        }
    )
}
