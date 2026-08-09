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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.CartItem
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Primary

// FOOD-BIKE-057: keranjang (list item + qty + catatan + ringkasan harga)
@Composable
fun FoodCartScreen(
    onBack: () -> Unit,
    onCheckout: () -> Unit,
    viewModel: FoodViewModel = hiltViewModel()
) {
    val cart by viewModel.cart.collectAsState()
    val cartTotal by viewModel.cartTotal.collectAsState()
    val cartSize by viewModel.cartSize.collectAsState()

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
                    "Keranjang",
                    modifier = Modifier.weight(1f),
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Primary
                )
            }
        },
        bottomBar = {
            if (cart.isNotEmpty()) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.White)
                        .padding(horizontal = 16.dp, vertical = 12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Total ($cartSize item)", fontSize = 13.sp, color = Color(0xFF64748B))
                        Text(
                            "Rp ${cartTotal.toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".")}",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Primary
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = onCheckout,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        Text("Lanjut ke Pembayaran", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    ) { padding ->
        if (cart.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Default.ShoppingCart,
                        contentDescription = null,
                        tint = Color(0xFFCBD5E1),
                        modifier = Modifier.size(52.dp)
                    )
                    Spacer(Modifier.height(12.dp))
                    Text("Keranjang masih kosong", fontSize = 14.sp, color = Color(0xFF64748B), fontWeight = FontWeight.SemiBold)
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // FB-108: key per kombinasi varian — 2 baris item sama dengan
                // pilihan berbeda tidak boleh bentrok.
                items(cart, key = { it.cartKey }) { item ->
                    CartItemRow(
                        item = item,
                        onIncrement = { viewModel.incrementItem(item.menuItem.id, item.selectedVariants) },
                        onDecrement = { viewModel.decrementItem(item.menuItem.id, item.selectedVariants) }
                    )
                }
                item {
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun CartItemRow(
    item: CartItem,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(Color.White)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                item.menuItem.name,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = Color(0xFF0F172A),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            if (item.notes.isNotBlank()) {
                Text("Catatan: ${item.notes}", fontSize = 11.sp, color = Color(0xFF94A3B8), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            // FB-108: tampilkan pilihan varian (mis. "Level Pedas: Extra Pedas")
            if (item.variantLabels.isNotEmpty()) {
                Text(
                    item.variantLabels.joinToString(" · "),
                    fontSize = 11.sp,
                    color = Color(0xFF64748B),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }
            Text(
                "Rp ${item.subtotal.toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".")}",
                fontSize = 13.sp,
                fontWeight = FontWeight.ExtraBold,
                color = Primary,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xFFF1F5F9))
        ) {
            IconButton(onClick = onDecrement, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.Remove, contentDescription = "Kurangi", tint = Primary, modifier = Modifier.size(16.dp))
            }
            Text(item.quantity.toString(), fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Color(0xFF0F172A))
            IconButton(onClick = onIncrement, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.Add, contentDescription = "Tambah", tint = Accent, modifier = Modifier.size(16.dp))
            }
        }
    }
}
