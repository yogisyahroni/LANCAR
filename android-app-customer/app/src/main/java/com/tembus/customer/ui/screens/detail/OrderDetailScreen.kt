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
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Outline
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.Secondary
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.Warning
import com.tembus.customer.ui.a11y.criticalAction

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
    val serviceAdjustments by viewModel.serviceAdjustments.collectAsState()
    val adjustmentDecisionState by viewModel.serviceAdjustmentDecisionState.collectAsState()
    val context = LocalContext.current
    var showDisputeDialog by remember { mutableStateOf(false) }
    var showCancelDialog by remember { mutableStateOf(false) }
    var isRefreshing by remember { mutableStateOf(false) }

    LaunchedEffect(state) {
        if (state !is OrderDetailUiState.Loading) isRefreshing = false
    }

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
        while (true) {
            kotlinx.coroutines.delay(5_000)
            viewModel.refreshServiceAdjustments(orderId)
        }
    }

    LaunchedEffect(adjustmentDecisionState) {
        when (val decisionState = adjustmentDecisionState) {
            is ServiceAdjustmentDecisionState.Success -> {
                Toast.makeText(context, decisionState.message, Toast.LENGTH_LONG).show()
                viewModel.resetServiceAdjustmentDecisionState()
            }
            is ServiceAdjustmentDecisionState.Error -> {
                Toast.makeText(context, decisionState.message, Toast.LENGTH_LONG).show()
                viewModel.resetServiceAdjustmentDecisionState()
            }
            else -> Unit
        }
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
                    IconButton(onClick = onBackClick, modifier = Modifier.criticalAction("Kembali dari detail pesanan")) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
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
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                viewModel.fetchOrderDetail(orderId)
            },
            modifier = Modifier.fillMaxSize()
        ) {
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
                    Column(
                        modifier = Modifier.align(Alignment.Center).padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text("Detail pesanan belum tersedia", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                        Text(res.message, color = OnSurfaceVariant)
                        Button(onClick = { viewModel.fetchOrderDetail(orderId) }) { Text("Coba lagi") }
                    }
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
                            shape = RoundedCornerShape(TembusRadius.Card),
                            colors = CardDefaults.cardColors(containerColor = Primary)
                        ) {
                            Row(modifier = Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Info, contentDescription = "", tint = Color.White)
                                Spacer(Modifier.width(16.dp))
                                Column {
                                    Text("Status Saat Ini", color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp)
                                    Text(statusDisplayText(order.status, order.serviceSubType), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                }
                            }
                        }

                        Spacer(Modifier.height(16.dp))

                        // Rute Card
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(TembusRadius.Card),
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

                        OrderServiceSpecificSections(order)

                        ServiceAdjustmentSection(
                            adjustments = serviceAdjustments,
                            isSubmitting = adjustmentDecisionState is ServiceAdjustmentDecisionState.Loading,
                            onApprove = { adjustmentId ->
                                viewModel.decideServiceAdjustment(order.orderId, adjustmentId, approve = true)
                            },
                            onReject = { adjustmentId, reason ->
                                viewModel.decideServiceAdjustment(order.orderId, adjustmentId, approve = false, rejectionReason = reason)
                            }
                        )
                        if (serviceAdjustments.isNotEmpty()) Spacer(Modifier.height(16.dp))

                        // Info Pembayaran
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(TembusRadius.Card),
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

                        if (OrderActionPolicy.canTrack(order.status) || OrderActionPolicy.canChat(order.status) || OrderActionPolicy.canCancel(order.status, order.serviceSubType)) {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                if (OrderActionPolicy.canTrack(order.status)) {
                                    Button(
                                        onClick = { onTrackClick(order.orderId) },
                                        modifier = Modifier.fillMaxWidth().height(52.dp).criticalAction("Lacak posisi kurir"),
                                        shape = RoundedCornerShape(TembusRadius.Button),
                                        colors = ButtonDefaults.buttonColors(containerColor = Accent, contentColor = Color.White)
                                    ) {
                                        Icon(Icons.Default.MyLocation, contentDescription = "")
                                        Spacer(Modifier.width(8.dp))
                                        Text("Lacak Posisi Kurir", fontWeight = FontWeight.Bold)
                                    }
                                }

                                if (canOpenConversation(order.status)) {
                                    OutlinedButton(
                                        onClick = { onChatClick(order.orderId, order.courierName) },
                                        modifier = Modifier.fillMaxWidth().height(52.dp).criticalAction("Chat kurir"),
                                        shape = RoundedCornerShape(TembusRadius.Button),
                                        border = BorderStroke(1.dp, Primary)
                                    ) {
                                        Icon(Icons.Default.ChatBubbleOutline, contentDescription = "", tint = Primary)
                                        Spacer(Modifier.width(8.dp))
                                        Text("Chat Kurir", color = Primary, fontWeight = FontWeight.Bold)
                                    }
                                }

                                // S2-CUSTOMER-02: Cancel button with reason picker
                                if (canCancelOrder(order.status, order.serviceSubType)) {
                                    OutlinedButton(
                                        onClick = { showCancelDialog = true },
                                        modifier = Modifier.fillMaxWidth().height(52.dp).criticalAction("Batalkan pesanan"),
                                        shape = RoundedCornerShape(TembusRadius.Button),
                                        border = BorderStroke(1.dp, Error),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Error)
                                    ) {
                                        Icon(Icons.Default.Close, contentDescription = "")
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
                                        modifier = Modifier.fillMaxWidth().height(52.dp).criticalAction("Lihat laporan layanan"),
                                        shape = RoundedCornerShape(TembusRadius.Button),
                                        border = BorderStroke(1.dp, Primary),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Primary)
                                    ) {
                                        Icon(Icons.Default.Assignment, contentDescription = "")
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
                            modifier = Modifier.fillMaxWidth().height(48.dp).criticalAction("Laporkan masalah pesanan")
                        ) {
                            Icon(Icons.Default.ReportProblem, contentDescription = "", tint = MaterialTheme.colorScheme.error)
                            Spacer(Modifier.width(8.dp))
                            Text("Bantuan / Laporkan Masalah / Ajukan Klaim", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                else -> {}
            }
            }
        }
    }
}

// statusDisplayText — label status yang ramah user (FB-123: scheduled → "Terjadwal").
private fun statusDisplayText(status: String, serviceSubType: String?): String {
    return OrderActionPolicy.statusLabel(status, serviceSubType)
}

private fun canOpenConversation(status: String): Boolean {
    return OrderActionPolicy.canChat(status)
}

// S2-CUSTOMER-02: Only allow cancellation before pickup
private fun canCancelOrder(status: String, serviceSubType: String?): Boolean {
    return OrderActionPolicy.canCancel(status, serviceSubType)
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
                        color = Warning.copy(alpha = 0.12f),
                        shape = RoundedCornerShape(TembusRadius.Chip),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            refundHint,
                            style = MaterialTheme.typography.bodySmall,
                            color = Warning,
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
                            colors = RadioButtonDefaults.colors(selectedColor = Error)
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
                Text("Batalkan Pesanan", color = Error, fontWeight = FontWeight.Bold)
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
        Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(TembusRadius.Chip)) {
            Icon(icon, contentDescription = "", tint = color, modifier = Modifier.padding(8.dp).size(20.dp))
        }
        Spacer(Modifier.width(16.dp))
        Column {
            Text(label, color = OnSurfaceVariant, fontSize = 12.sp)
            Text(value, fontWeight = FontWeight.Medium, fontSize = 14.sp, color = OnSurface)
        }
    }
}
