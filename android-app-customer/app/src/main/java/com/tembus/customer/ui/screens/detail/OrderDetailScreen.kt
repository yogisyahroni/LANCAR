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
        val order = (state as? OrderDetailUiState.Success)?.order
        DisputeDialog(
            onDismiss = { showDisputeDialog = false },
            onSubmit = { type, desc, bytes, mime ->
                viewModel.submitDispute(orderId, type, desc, bytes, mime)
            },
            submitState = disputeState,
            isFood = order?.serviceSubType == "food_delivery"
        )
    }

    // S2-CUSTOMER-02: Cancel Reason Dialog
    if (showCancelDialog) {
        val order = (state as? OrderDetailUiState.Success)?.order
        CancelReasonDialog(
            reasons = cancelReasons,
            refundHint = order?.let { refundHintForStatus(it.status, it.serviceSubType == "food_delivery") } ?: "",
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

                        // FB-111: Rincian item pesanan food (snapshot
                        // food_order_items dari backend) — customer bisa lihat
                        // lagi isi pesanan setelah order selesai.
                        if (order.foodItems.isNotEmpty()) {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                shape = RoundedCornerShape(20.dp),
                                colors = CardDefaults.cardColors(containerColor = Color.White),
                                border = BorderStroke(1.dp, Outline)
                            ) {
                            Column(Modifier.padding(20.dp)) {
                                    Text("Rincian Pesanan", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = OnSurface)
                                    Spacer(Modifier.height(12.dp))
                                    order.foodItems.forEach { item ->
                                        Row(
                                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                                            verticalAlignment = Alignment.Top,
                                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                                        ) {
                                            Text(
                                                "${item.quantity}×",
                                                fontWeight = FontWeight.Black,
                                                color = Accent
                                            )
                                            Column(modifier = Modifier.weight(1f)) {
                                                Text(item.name, fontWeight = FontWeight.SemiBold, color = OnSurface)
                                                // FB-108: tampilkan pilihan varian yang dipilih
                                                // (mis. "Level Pedas: Extra Pedas").
                                                if (!item.variants.isNullOrEmpty()) {
                                                    Text(
                                                        item.variants.joinToString(" · ") { v ->
                                                            "${v.variantName ?: ""}${if (v.variantName.isNullOrBlank()) "" else ": "}${v.optionName ?: ""}"
                                                        },
                                                        fontSize = 12.sp,
                                                        color = OnSurfaceVariant
                                                    )
                                                }
                                                if (!item.notes.isNullOrBlank()) {
                                                    Text(
                                                        "Catatan: ${item.notes}",
                                                        fontSize = 12.sp,
                                                        color = OnSurfaceVariant
                                                    )
                                                }
                                            }
                                            if (item.subtotal > 0) {
                                                Text(
                                                    "Rp ${item.subtotal}",
                                                    fontWeight = FontWeight.Bold,
                                                    color = Primary
                                                )
                                            }
                                        }
                                        HorizontalDivider(color = Outline.copy(alpha = 0.4f))
                                    }
                                    // FB-121: catatan level order (mis. "pisahin sambal semua")
                                    if (!order.orderNotes.isNullOrBlank()) {
                                        Spacer(Modifier.height(10.dp))
                                        Text(
                                            "Catatan untuk merchant:",
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = OnSurfaceVariant
                                        )
                                        Text(
                                            order.orderNotes!!,
                                            fontSize = 14.sp,
                                            color = OnSurface,
                                            modifier = Modifier.padding(top = 2.dp)
                                        )
                                    }
                                }
                            }
                            Spacer(Modifier.height(16.dp))
                        }

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
                                        Text(if (order.status.lowercase() == "no_courier_found") "Batalkan & Ajukan Refund" else "Batalkan Pesanan", fontWeight = FontWeight.Bold)
                                    }
                                }
                                
                                // Service Report button for tambal ban/towing only
                                // FB-112: sebelumnya muncul utk SEMUA serviceSubType
                                // (termasuk food) padahal aslinya utk tambal ban/towing.
                                if (order.serviceSubType in setOf(
                                        "tambal_ban_motor", "tambal_ban_mobil",
                                        "towing_motor", "towing_mobil"
                                    ) && order.status.lowercase() == "delivered") {
                                    OutlinedButton(
                                        onClick = { /* Navigate to service report */ },
                                        modifier = Modifier.fillMaxWidth().height(52.dp),
                                        shape = RoundedCornerShape(16.dp),
                                        border = BorderStroke(1.dp, Primary),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary)
                                    ) {
                                        Icon(Icons.Default.Assignment, contentDescription = null)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Lihat Laporan Layanan", fontWeight = FontWeight.Bold)
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
        "pending_payment",
        "no_courier_found",
        // FB-079: food order — cancel window diperpanjang (free sebelum driver,
        // kena biaya layanan saat accepted/picking_up)
        "pending_merchant",
        "preparing",
        "ready_for_pickup",
        "picking_up"
    )
}

/**
 * FB-079: info refund yang ditampilkan di dialog pembatalan.
 * - FREE: pembatalan gratis, refund penuh
 * - FEE: dikenakan biaya layanan (cancellation fee)
 */
private fun refundHintForStatus(status: String, isFood: Boolean): String {
    val s = status.lowercase()
    if (!isFood) {
        return if (s in setOf("accepted", "picking_up")) {
            "Pembatalan dikenakan biaya 20% dari total pesanan."
        } else {
            "Pembatalan gratis — dana dikembalikan penuh."
        }
    }
    return when (s) {
        "accepted", "picking_up" ->
            "Pembatalan dikenakan biaya layanan (biaya jasa tidak dikembalikan)."
        "searching" ->
            "Gratis jika kurir belum ditugaskan. Jika kurir sudah menerima pesanan, biaya layanan ditahan."
        else ->
            "Pembatalan gratis — dana dikembalikan penuh."
    }
}

@Composable
private fun CancelReasonDialog(
    reasons: List<String>,
    refundHint: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedReason by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Alasan Pembatalan", fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                // FB-079: info refund window (free / kena biaya layanan)
                if (refundHint.isNotEmpty()) {
                    Surface(
                        color = Color(0xFFFFF3E0),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            refundHint,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFB26A00),
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
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



