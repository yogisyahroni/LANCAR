package com.tembus.customer.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.AddCircleOutline
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.QrCode2
import androidx.compose.material.icons.filled.Security
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.designsystem.TembusBadge
import com.tembus.customer.ui.designsystem.TembusBadgeTone
import com.tembus.customer.ui.theme.OrangeCta

private val PaymentCanvas = Color(0xFFF7F8F6)
private val WalletGreen = Color(0xFF006640)

/**
 * Figma: TEMBUS - Metode Pembayaran & Dompet (node 2-6624).
 *
 * The wallet balance is server-backed. Linked cards and digital wallets are
 * intentionally rendered as honest empty states because this customer app has
 * no saved-method management contract yet; the screen must not invent cards,
 * masked numbers, or provider connection status.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentMethodsScreen(
    onBack: () -> Unit,
    onTopUp: () -> Unit,
    onSecurity: () -> Unit,
    viewModel: WalletTopUpViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val balanceLabel = state.balance?.balance?.let(WalletTopUpViewModel::formatRupiah)
        ?: if (state.isLoading) "Memuat saldo..." else "Saldo belum tersedia"

    Scaffold(
        containerColor = PaymentCanvas,
        topBar = {
            TopAppBar(
                title = { Text("Metode Pembayaran", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Kembali")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PaymentCanvas),
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                WalletHero(
                    balanceLabel = balanceLabel,
                    onTopUp = onTopUp,
                )
            }

            item {
                PaymentSectionTitle("Metode Pembayaran Utama")
                Spacer(Modifier.height(8.dp))
                PaymentMethodCard(
                    icon = Icons.Default.AccountBalanceWallet,
                    title = "TEMBUS-Pay",
                    subtitle = "Saldo utama untuk transaksi TEMBUS",
                    trailing = { TembusBadge("Aktif", tone = TembusBadgeTone.Success) },
                )
            }

            item {
                PaymentSectionTitle("Kartu Debit & Kredit")
                Spacer(Modifier.height(8.dp))
                EmptyPaymentMethodCard(
                    icon = Icons.Default.CreditCard,
                    title = "Belum ada kartu tersimpan",
                    subtitle = "Kartu akan tampil di sini setelah fitur simpan kartu tersedia.",
                )
            }

            item {
                PaymentSectionTitle("Dompet Digital Terhubung")
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PaymentMethodRow(Icons.Default.PhoneAndroid, "GoPay", "Belum terhubung")
                    PaymentMethodRow(Icons.Default.PhoneAndroid, "OVO", "Belum terhubung")
                    PaymentMethodRow(Icons.Default.PhoneAndroid, "DANA & ShopeePay", "Belum terhubung")
                }
            }

            item {
                PaymentSectionTitle("Pembayaran Instan Tanpa Repot")
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PaymentMethodRow(Icons.Default.QrCode2, "QRIS Nasional", "Dipilih saat checkout")
                    PaymentMethodRow(Icons.Default.AccountBalance, "Virtual Account Bank", "Dipilih saat checkout")
                }
            }

            item {
                PaymentSectionTitle("Keamanan & Otorisasi")
                Spacer(Modifier.height(8.dp))
                Card(
                    onClick = onSecurity,
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Icon(Icons.Default.Security, contentDescription = null, tint = WalletGreen, modifier = Modifier.size(24.dp))
                        Column(Modifier.weight(1f)) {
                            Text("PIN transaksi & biometrik", fontWeight = FontWeight.SemiBold)
                            Text("Kelola otorisasi pembayaran dari menu keamanan akun.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("Kelola", color = OrangeCta, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }

            item {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF6EE)),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(14.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(Icons.Default.Security, contentDescription = null, tint = WalletGreen, modifier = Modifier.size(22.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text("Pembayaran lebih aman", fontWeight = FontWeight.Bold, color = WalletGreen)
                            Text(
                                "Detail saldo dan metode pembayaran mengikuti data server. TEMBUS tidak menyimpan PIN di perangkat.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            item { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun WalletHero(balanceLabel: String, onTopUp: () -> Unit) {
    Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = WalletGreen),
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
                Spacer(Modifier.size(10.dp))
                Text("TEMBUS-Pay", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
            Text("Saldo tersedia", color = Color.White.copy(alpha = 0.78f), fontSize = 12.sp)
            Text(balanceLabel, color = Color.White, fontWeight = FontWeight.Black, fontSize = 28.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onTopUp,
                    colors = ButtonDefaults.buttonColors(containerColor = OrangeCta, contentColor = Color.Black),
                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp),
                ) { Text("Top Up", fontWeight = FontWeight.Bold) }
                OutlinedButton(
                    onClick = {},
                    enabled = false,
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                ) { Text("Riwayat", color = Color.White.copy(alpha = 0.7f)) }
            }
        }
    }
}

@Composable
private fun PaymentSectionTitle(title: String) {
    Text(title, fontSize = 16.sp, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onSurface)
}

@Composable
private fun PaymentMethodCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    trailing: @Composable () -> Unit,
) {
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(shape = RoundedCornerShape(12.dp), color = Color(0xFFEAF6EE)) {
                Icon(icon, contentDescription = null, tint = WalletGreen, modifier = Modifier.padding(10.dp).size(24.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold)
                Text(subtitle, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            trailing()
        }
    }
}

@Composable
private fun EmptyPaymentMethodCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
) {
    Card(shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(24.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(subtitle, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(Icons.Default.AddCircleOutline, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(22.dp))
        }
    }
}

@Composable
private fun PaymentMethodRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    status: String,
) {
    Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(icon, contentDescription = null, tint = WalletGreen, modifier = Modifier.size(22.dp))
            Text(title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Text(status, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
