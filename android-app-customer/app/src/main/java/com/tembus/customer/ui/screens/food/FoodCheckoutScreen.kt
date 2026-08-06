package com.tembus.customer.ui.screens.food

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.theme.Primary
import kotlinx.coroutines.launch

// FOOD-BIKE-075: checkout — alamat antar + receiver + ringkasan + submit
@Composable
fun FoodCheckoutScreen(
    onBack: () -> Unit,
    onOrderCreated: (String) -> Unit,
    viewModel: FoodViewModel = hiltViewModel()
) {
    val cart by viewModel.cart.collectAsState()
    val cartTotal by viewModel.cartTotal.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val userLat by viewModel.userLat.collectAsState()
    val userLng by viewModel.userLng.collectAsState()
    val scope = rememberCoroutineScope()

    var address by remember { mutableStateOf("") }
    var receiverName by remember { mutableStateOf("") }
    var receiverPhone by remember { mutableStateOf("") }
    var submitError by remember { mutableStateOf<String?>(null) }

    val merchantId = cart.firstOrNull()?.menuItem?.merchantId ?: ""
    val formatRupiah = { v: Long -> v.toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".") }

    Scaffold(
        containerColor = Color(0xFFF7F8FA),
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .background(Color.White)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = Primary)
                }
                Text(
                    "Checkout",
                    modifier = Modifier.weight(1f),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Primary
                )
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Ringkasan pesanan
            Text("Ringkasan Pesanan", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF0F172A))
            Spacer(Modifier.height(10.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White, RoundedCornerShape(18.dp))
                    .padding(14.dp)
            ) {
                cart.forEach { item ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "${item.quantity}x ${item.menuItem.name}",
                            fontSize = 13.sp,
                            color = Color(0xFF334155),
                            maxLines = 1
                        )
                        Text(
                            "Rp ${formatRupiah(item.subtotal)}",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF0F172A)
                        )
                    }
                }
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Total", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF0F172A))
                    Text(
                        "Rp ${formatRupiah(cartTotal)}",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Primary
                    )
                }
            }

            Spacer(Modifier.height(16.dp))

            // Alamat pengantaran
            Text("Alamat Pengantaran", fontSize = 15.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF0F172A))
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = address,
                onValueChange = { address = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Contoh: Jl. Sudirman No. 12, Jakarta", fontSize = 14.sp) },
                minLines = 2,
                shape = RoundedCornerShape(14.dp)
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = receiverName,
                onValueChange = { receiverName = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Nama penerima (opsional)", fontSize = 14.sp) },
                singleLine = true,
                shape = RoundedCornerShape(14.dp)
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = receiverPhone,
                onValueChange = { receiverPhone = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("No. HP penerima (opsional)", fontSize = 14.sp) },
                singleLine = true,
                shape = RoundedCornerShape(14.dp)
            )

            submitError?.let {
                Spacer(Modifier.height(10.dp))
                Text(it, color = Color(0xFFEF4444), fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            }

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = {
                    submitError = null
                    if (address.isBlank()) {
                        submitError = "Alamat pengantaran wajib diisi"
                        return@Button
                    }
                    if (cart.isEmpty()) {
                        submitError = "Keranjang kosong"
                        return@Button
                    }
                    scope.launch {
                        viewModel.checkout(
                            merchantId = merchantId,
                            dropoffAddress = address,
                            dropoffLat = userLat,
                            dropoffLng = userLng,
                            receiverName = receiverName.ifBlank { null },
                            receiverPhone = receiverPhone.ifBlank { null },
                            onResult = { result ->
                                result.onSuccess { order ->
                                    viewModel.clearCart()
                                    onOrderCreated(order.id)
                                }.onFailure { e ->
                                    submitError = e.message ?: "Gagal membuat order"
                                }
                            }
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth().height(50.dp),
                shape = RoundedCornerShape(14.dp),
                enabled = !loading
            ) {
                if (loading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.height(22.dp).width(22.dp))
                } else {
                    Text("Buat Pesanan • Rp ${formatRupiah(cartTotal)}", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                }
            }

            Spacer(Modifier.height(8.dp))
            Text(
                "Harga dihitung ulang oleh server — biaya antar dihitung otomatis.",
                fontSize = 11.sp,
                color = Color(0xFF94A3B8),
                modifier = Modifier.align(Alignment.CenterHorizontally)
            )
            Spacer(Modifier.height(24.dp))
        }
    }
}
