package com.tembus.customer.ui.screens.history

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.History
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.Order
import com.tembus.customer.ui.components.*
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderHistoryScreen(
    viewModel: OrderHistoryViewModel = hiltViewModel(),
    onBackClick: () -> Unit,
    onOrderClick: (String) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    Scaffold(
        containerColor = Background,
        topBar = {
            TopAppBar(
                title = { Text("Riwayat Pesanan", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Primary,
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Background)
        ) {
            when (val res = state) {
                is HistoryUiState.Loading -> {
                    LoadingListPlaceholder(itemCount = 5)
                }
                is HistoryUiState.Error -> {
                    FullScreenError(message = res.message, onRetry = { viewModel.fetchHistory() })
                }
                is HistoryUiState.Success -> {
                    if (res.orders.isEmpty()) {
                        EmptyHistoryState(modifier = Modifier.align(Alignment.Center))
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(20.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            items(res.orders) { order ->
                                OrderCardItem(order = order, onClick = { onOrderClick(order.orderId) })
                            }
                        }
                    }
                }
                else -> {}
            }
        }
    }
}

@Composable
fun OrderCardItem(order: Order, onClick: () -> Unit) {
    val statusColor = when(order.status.lowercase()) {
        "delivered" -> Color(0xFF22C55E)
        "failed", "cancelled" -> Error
        else -> Primary
    }
    
    val dateFormat = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale("id", "ID"))
    val dateString = dateFormat.format(Date(order.createdAt))

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(20.dp),
        elevation = CardDefaults.cardElevation(1.dp),
        border = BorderStroke(1.dp, Outline),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("No. Resi ${order.orderNumber}", fontSize = 12.sp, color = OnSurfaceVariant)
                Card(
                    colors = CardDefaults.cardColors(containerColor = statusColor.copy(alpha = 0.1f)),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = order.status.uppercase(),
                        color = statusColor,
                        fontWeight = FontWeight.Bold,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }
            Spacer(Modifier.height(8.dp))
            Text(order.pickupAddress, fontWeight = FontWeight.Bold, maxLines = 1, fontSize = 15.sp, color = OnSurface)
            Spacer(Modifier.height(2.dp))
            Text("Tujuan: " + order.dropAddress, color = OnSurfaceVariant, fontSize = 14.sp, maxLines = 1)
            
            Divider(Modifier.padding(vertical = 12.dp), thickness = 0.5.dp, color = Outline)
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(dateString, fontSize = 12.sp, color = OnSurfaceVariant)
                Text("Rp ${order.fee}", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = Primary)
            }
        }
    }
}

@Composable
fun EmptyHistoryState(modifier: Modifier) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(Icons.Default.History, contentDescription = null, modifier = Modifier.size(64.dp), tint = PrimaryLight)
        Spacer(Modifier.height(16.dp))
        Text("Belum Ada Riwayat", fontWeight = FontWeight.Bold, color = OnSurface)
        Text("Semua order Anda akan muncul di sini", fontSize = 14.sp, color = OnSurfaceVariant)
    }
}
