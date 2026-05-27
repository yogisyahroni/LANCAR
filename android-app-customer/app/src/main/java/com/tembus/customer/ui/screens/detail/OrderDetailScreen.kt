package com.tembus.customer.ui.screens.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.theme.Primary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    orderId: String,
    viewModel: OrderDetailViewModel = hiltViewModel(),
    onBackClick: () -> Unit,
    onTrackClick: (String) -> Unit
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(orderId) {
        viewModel.fetchOrderDetail(orderId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Detail Order", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.1f))
        ) {
            when (val res = state) {
                is OrderDetailUiState.Loading -> {
                    Text(
                        text = "Memuat detail order...",
                        modifier = Modifier.align(Alignment.Center),
                        color = Primary,
                        fontWeight = FontWeight.Bold
                    )
                }
                is OrderDetailUiState.Error -> {
                    Text(res.message, color = MaterialTheme.colorScheme.error, modifier = Modifier.align(Alignment.Center))
                }
                is OrderDetailUiState.Success -> {
                    val order = res.order
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp)
                    ) {
                        // Status Card
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Primary)
                        ) {
                            Row(modifier = Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Info, contentDescription = null, tint = Color.White)
                                Spacer(Modifier.width(16.dp))
                                Column {
                                    Text("Status Saat Ini", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
                                    Text(order.status.uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                }
                            }
                        }

                        Spacer(Modifier.height(16.dp))

                        // Rute Card
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White)
                        ) {
                            Column(Modifier.padding(20.dp)) {
                                Text("Rute Pengiriman", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Spacer(Modifier.height(16.dp))
                                
                                RoutePoint(icon = Icons.Default.LocationOn, color = Primary, label = "Penjemputan", value = order.pickupAddress)
                                Spacer(Modifier.height(8.dp))
                                Divider(modifier = Modifier.padding(start = 12.dp).height(20.dp).width(2.dp), color = Color.LightGray)
                                Spacer(Modifier.height(8.dp))
                                RoutePoint(icon = Icons.Default.Flag, color = Color.Red, label = "Tujuan", value = order.dropAddress)
                            }
                        }

                        Spacer(Modifier.height(16.dp))

                        // Info Pembayaran
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White)
                        ) {
                            Column(Modifier.padding(20.dp)) {
                                Text("Rincian Pembayaran", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Spacer(Modifier.height(12.dp))
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Ongkos Kirim", color = Color.Gray)
                                    Text("Rp ${order.fee}", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                        
                        Spacer(Modifier.height(24.dp))

                        if (order.status.lowercase() != "delivered" && order.status.lowercase() != "cancelled") {
                            Button(
                                onClick = { onTrackClick(order.orderId) },
                                modifier = Modifier.fillMaxWidth().height(52.dp),
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Primary)
                            ) {
                                Icon(Icons.Default.MyLocation, contentDescription = null)
                                Spacer(Modifier.width(8.dp))
                                Text("Lacak Posisi Kurir", fontWeight = FontWeight.Bold)
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
fun RoutePoint(icon: androidx.compose.ui.graphics.vector.ImageVector, color: Color, label: String, value: String) {
    Row(verticalAlignment = Alignment.Top) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
        Spacer(Modifier.width(16.dp))
        Column {
            Text(label, color = Color.Gray, fontSize = 12.sp)
            Text(value, fontWeight = FontWeight.Medium, fontSize = 14.sp)
        }
    }
}
