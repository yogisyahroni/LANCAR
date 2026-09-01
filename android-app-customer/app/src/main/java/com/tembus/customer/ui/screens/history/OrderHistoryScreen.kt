package com.tembus.customer.ui.screens.history

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material3.*
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.model.ReorderInfo
import com.tembus.customer.data.model.ReorderItem
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
    onOrderClick: (String) -> Unit,
    onReorderNavigate: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val reorderState by viewModel.reorderState.collectAsState()
    var isRefreshing by remember { mutableStateOf(false) }

    LaunchedEffect(state) {
        if (isRefreshing && state !is HistoryUiState.Loading) isRefreshing = false
    }

    Scaffold(
        containerColor = Background,
        topBar = {
            TopAppBar(
                title = { Text("Riwayat Pesanan", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
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
                viewModel.fetchHistory()
            },
            modifier = Modifier.fillMaxSize().padding(bottom = padding.calculateBottomPadding()),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
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
                                OrderCardItem(
                                    order = order,
                                    onClick = { onOrderClick(order.orderId) },
                                    isFood = order.serviceSubType == "food_delivery",
                                    onReorder = { viewModel.checkReorder(order.orderId) }
                                )
                            }
                        }
                    }
                }
                else -> {}
                }
            }
        }
    }

    // ── FB-084: dialog "Pesan Lagi" (reorder food) ──
    when (val reorder = reorderState) {
        is ReorderUiState.Loading -> {
            AlertDialog(
                onDismissRequest = { },
                title = { Text("Memeriksa menu…", fontWeight = FontWeight.Bold) },
                text = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(12.dp))
                        Text("Cek harga & ketersediaan item…", fontSize = 14.sp)
                    }
                },
                confirmButton = {}
            )
        }
        is ReorderUiState.Ready -> {
            ReorderConfirmDialog(
                info = reorder.info,
                onConfirm = {
                    viewModel.confirmReorder()
                    viewModel.dismissReorder()
                    onReorderNavigate()
                },
                onDismiss = { viewModel.dismissReorder() }
            )
        }
        is ReorderUiState.Error -> {
            AlertDialog(
                onDismissRequest = { viewModel.dismissReorder() },
                title = { Text("Gagal Pesan Lagi", fontWeight = FontWeight.Bold) },
                text = { Text(reorder.message, fontSize = 14.sp) },
                confirmButton = {
                    TextButton(onClick = { viewModel.dismissReorder() }) {
                        Text("OK", color = Primary)
                    }
                }
            )
        }
        else -> {}
    }
}

@Composable
fun OrderCardItem(
    order: Order,
    onClick: () -> Unit,
    isFood: Boolean = false,
    onReorder: (() -> Unit)? = null
) {
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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (isFood) {
                        // FB-084: badge tipe order food
                        Card(
                            colors = CardDefaults.cardColors(containerColor = PrimaryLight.copy(alpha = 0.25f)),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.padding(end = 6.dp)
                        ) {
                            Text(
                                text = "FOOD",
                                color = Primary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 10.sp,
                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                            )
                        }
                    }
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
            }
            Spacer(Modifier.height(8.dp))
            if (isFood && order.merchantName != null) {
                Text(order.merchantName!!, fontWeight = FontWeight.Bold, maxLines = 1, fontSize = 15.sp, color = OnSurface)
                if (order.foodItems.isNotEmpty()) {
                    val foodSummary = buildString {
                        order.foodItems.take(2).forEachIndexed { index, item ->
                            if (index > 0) append(", ")
                            append("${item.quantity}× ${item.name}")
                        }
                        if (order.foodItems.size > 2) append(" +${order.foodItems.size - 2} lainnya")
                    }
                    Text(
                        foodSummary,
                        color = OnSurfaceVariant,
                        fontSize = 12.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(Modifier.height(2.dp))
            }
            Text(
                text = order.pickupAddress,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                fontSize = 15.sp,
                color = OnSurface
            )
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

            // FB-084: tombol "Pesan Lagi" khusus order food
            if (isFood && onReorder != null) {
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = onReorder,
                    modifier = Modifier.fillMaxWidth().height(42.dp),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Restaurant, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Pesan Lagi", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

/** FB-084: konfirmasi reorder — tampilkan item lama vs harga sekarang. */
@Composable
private fun ReorderConfirmDialog(
    info: ReorderInfo,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text("Pesan Lagi?", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text(
                    info.merchantName,
                    fontSize = 13.sp,
                    color = OnSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .verticalScroll(rememberScrollState())
            ) {
                if (!info.merchantOpen) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = Error.copy(alpha = 0.1f)),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)
                    ) {
                        Text(
                            "⚠️ Merchant sedang tutup — cek jam buka sebelum checkout.",
                            fontSize = 12.sp,
                            color = Error,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(10.dp)
                        )
                    }
                }
                info.items.forEach { item ->
                    ReorderItemRow(item)
                }
                if (info.hasChanges) {
                    Spacer(Modifier.height(6.dp))
                    Divider(Modifier.fillMaxWidth(), thickness = 0.5.dp, color = Outline)
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Total saat itu", fontSize = 13.sp, color = OnSurfaceVariant)
                        Text(
                            "Rp ${formatRupiah(info.totalOld)}",
                            fontSize = 13.sp,
                            color = OnSurfaceVariant,
                            textDecoration = TextDecoration.LineThrough
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Total sekarang", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Text("Rp ${formatRupiah(info.totalNew)}", fontSize = 14.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = info.merchantOpen,
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Pesan Lagi", fontWeight = FontWeight.Bold)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Batal", color = OnSurfaceVariant)
            }
        }
    )
}

@Composable
private fun ReorderItemRow(item: ReorderItem) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "${item.quantity}× ${item.itemName}",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (item.available) OnSurface else OnSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            if (!item.available) {
                Text("Tidak tersedia", fontSize = 12.sp, color = Error, fontWeight = FontWeight.SemiBold)
            } else if (item.priceChanged) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Rp ${formatRupiah(item.oldPrice)}",
                        fontSize = 12.sp,
                        color = OnSurfaceVariant,
                        textDecoration = TextDecoration.LineThrough
                    )
                    Spacer(Modifier.width(6.dp))
                    Text(
                        "Rp ${formatRupiah(item.newPrice)}",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Primary
                    )
                }
            } else {
                Text("Rp ${formatRupiah(item.newPrice)}", fontSize = 12.sp, color = OnSurfaceVariant)
            }
        }
    }
}

private fun formatRupiah(value: Long): String =
    value.toString().replace(Regex("\\B(?=(\\d{3})+(?!\\d))"), ".")

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
