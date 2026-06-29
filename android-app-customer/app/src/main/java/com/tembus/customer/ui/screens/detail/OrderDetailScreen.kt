package com.tembus.customer.ui.screens.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import android.widget.Toast
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Background
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.Secondary

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    orderId: String,
    viewModel: OrderDetailViewModel = hiltViewModel(),
    onBackClick: () -> Unit,
    onTrackClick: (String) -> Unit,
    onChatClick: (String, String?) -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val disputeState by viewModel.disputeState.collectAsState()
    val cancelState by viewModel.cancelState.collectAsState()
    val context = LocalContext.current
    var showDisputeDialog by remember { mutableStateOf(false) }
    var showCancelDialog by remember { mutableStateOf(false) }

    // S2-CUSTOMER-02: Predefined cancel reasons per skill 01 B.5
    val cancelReasons = remember {
        listOf(
            "Harga terlalu mahal",
            "Waktu tunggu terlalu lama",
            "Tidak jadi mengirim",
            "Alamat pickup/drop salah",
            "Kesalahan input data",
            "Lainnya"
        )
    }

    LaunchedEffect(disputeState) {
        if (disputeState is DisputeSubmitState.Success) {
            Toast.makeText(context, "Laporan berhasil dikirim. Tim kami akan segera meninjau.", Toast.LENGTH_LONG).show()
            showDisputeDialog = false
            viewModel.resetDisputeState()
        }
    }

    LaunchedEffect(cancelState) {
        when (val cs = cancelState) {
            is CancelOrderState.Success -> {
                Toast.makeText(context, cs.message, Toast.LENGTH_LONG).show()
                viewModel.resetCancelState()
                onBackClick()
            }
            is CancelOrderState.Error -> {
                Toast.makeText(context, cs.message, Toast.LENGTH_LONG).show()
                viewModel.resetCancelState()
            }
            else -> Unit
        }
    }

    LaunchedEffect(orderId) {
        viewModel.fetchOrderDetail(orderId)
    }

    if (showDisputeDialog) {
        DisputeDialog(
            onDismiss = { showDisputeDialog = false },
            onSubmit = { type, desc, bytes, mime ->
                viewModel.submitDispute(orderId, type, desc, bytes, mime)
            },
            submitState = disputeState
        )
    }

    // S2-CUSTOMER-02: Cancel Reason Dialog
    if (showCancelDialog) {
        CancelReasonDialog(
            reasons = cancelReasons,
            onConfirm = { reason ->
                showCancelDialog = false
                viewModel.cancelOrder(orderId, reason)
            },
            onDismiss = { showCancelDialog = false }
        )
    }

    Scaffold(
        containerColor = Background,
        topBar = {
            TopAppBar(
                title = { Text("Detail Pengiriman", fontWeight = FontWeight.Bold) },
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
                            .padding(20.dp)
                    ) {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(20.dp),
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
                            shape = RoundedCornerShape(20.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, Outline)
                        ) {
                            Column(Modifier.padding(20.dp)) {
                                Text("Rute Pengiriman", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = OnSurface)
                                Spacer(Modifier.height(16.dp))
                                
                                RoutePoint(icon = Icons.Default.LocationOn, color = Primary, label = "Penjemputan", value = order.pickupAddress)
                                Spacer(Modifier.height(8.dp))
                                HorizontalDivider(
                                    modifier = Modifier
                                        .padding(start = 12.dp)
                                        .height(20.dp)
                                        .width(2.dp),
                                    color = Outline
                                )
                                Spacer(Modifier.height(8.dp))
                                RoutePoint(icon = Icons.Default.Flag, color = Secondary, label = "Tujuan", value = order.dropAddress)
                            }
                        }

                        Spacer(Modifier.height(16.dp))

                        // Info Pembayaran
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(20.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            border = BorderStroke(1.dp, Outline)
                        ) {
                            Column(Modifier.padding(20.dp)) {
                                Text("Rincian Pembayaran", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = OnSurface)
                                Spacer(Modifier.height(12.dp))
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("Ongkos Kirim", color = OnSurfaceVariant)
                                    Text("Rp ${order.fee}", fontWeight = FontWeight.Bold, color = Primary)
                                }
                            }
                        }
                        
                        Spacer(Modifier.height(24.dp))

                        if (order.status.lowercase() != "delivered" && order.status.lowercase() != "cancelled") {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Button(
                                    onClick = { onTrackClick(order.orderId) },
                                    modifier = Modifier.fillMaxWidth().height(52.dp),
                                    shape = RoundedCornerShape(16.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.White)
                                ) {
                                    Icon(Icons.Default.MyLocation, contentDescription = null)
                                    Spacer(Modifier.width(8.dp))
                                    Text("Lacak Posisi Kurir", fontWeight = FontWeight.Bold)
                                }

                                if (canOpenConversation(order.status)) {
                                    OutlinedButton(
                                        onClick = { onChatClick(order.orderId, order.courierName) },
                                        modifier = Modifier.fillMaxWidth().height(52.dp),
                                        shape = RoundedCornerShape(16.dp),
                                        border = BorderStroke(1.dp, Primary)
                                    ) {
                                        Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, tint = Primary)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Chat Kurir", color = Primary, fontWeight = FontWeight.Bold)
                                    }
                                }

                                // S2-CUSTOMER-02: Cancel button with reason picker
                                if (canCancelOrder(order.status)) {
                                    OutlinedButton(
                                        onClick = { showCancelDialog = true },
                                        modifier = Modifier.fillMaxWidth().height(52.dp),
                                        shape = RoundedCornerShape(16.dp),
                                        border = BorderStroke(1.dp, Color(0xFFFF5252)),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF5252))
                                    ) {
                                        Icon(Icons.Default.Close, contentDescription = null)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Batalkan Pesanan", fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }

                        Spacer(Modifier.height(16.dp))

                        // Tombol Bantuan / Komplain
                        TextButton(
                            onClick = { showDisputeDialog = true },
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Icon(Icons.Default.ReportProblem, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(8.dp))
                            Text("Laporkan Masalah / Barang Hilang", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                else -> {}
            }
        }
    }
}

private fun canOpenConversation(status: String): Boolean {
    return status.lowercase() in setOf(
        "assigned",
        "accepted",
        "picking_up",
        "picked_up",
        "in_transit",
        "delivering"
    )
}

// S2-CUSTOMER-02: Only allow cancellation before pickup
private fun canCancelOrder(status: String): Boolean {
    return status.lowercase() in setOf(
        "searching",
        "assigned",
        "accepted",
        "pending_assignment",
        "pending",
        "pending_payment"
    )
}

@Composable
private fun CancelReasonDialog(
    reasons: List<String>,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedReason by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Alasan Pembatalan", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Pilih alasan pembatalan pesanan:",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(8.dp))
                reasons.forEach { reason ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = selectedReason == reason,
                            onClick = { selectedReason = reason },
                            colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFFF5252))
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(reason, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    selectedReason?.let { onConfirm(it) }
                },
                enabled = selectedReason != null
            ) {
                Text("Batalkan Pesanan", color = Color(0xFFFF5252), fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Tutup")
            }
        }
    )
}

@Composable
fun RoutePoint(icon: androidx.compose.ui.graphics.vector.ImageVector, color: Color, label: String, value: String) {
    Row(verticalAlignment = Alignment.Top) {
        Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(14.dp)) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.padding(8.dp).size(20.dp))
        }
        Spacer(Modifier.width(16.dp))
        Column {
            Text(label, color = OnSurfaceVariant, fontSize = 12.sp)
            Text(value, fontWeight = FontWeight.Medium, fontSize = 14.sp, color = OnSurface)
        }
    }
}
