package com.tembus.customer.ui.screens.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.Order
import com.tembus.customer.ui.components.FullScreenError
import com.tembus.customer.ui.components.LoadingListPlaceholder
import com.tembus.customer.ui.components.getTembusServiceIconSpec
import com.tembus.customer.ui.designsystem.TembusBottomNavigation
import com.tembus.customer.ui.designsystem.TembusNavigationItem
import com.tembus.customer.ui.screens.detail.OrderActionPolicy
import com.tembus.customer.ui.screens.history.HistoryUiState
import com.tembus.customer.ui.screens.history.OrderHistoryViewModel

private val MessagesCanvas @Composable get() = MaterialTheme.colorScheme.background

/**
 * Figma's Pesan tab is an order-scoped inbox. Conversations remain owned by
 * the mobile chat bridge; this screen only discovers eligible orders from the
 * canonical customer history and opens the existing chat route.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MessagesScreen(
    viewModel: OrderHistoryViewModel = hiltViewModel(),
    onBackClick: () -> Unit,
    onOpenChat: (orderId: String, participantName: String?) -> Unit,
    onOpenOrder: (orderId: String) -> Unit,
    onHomeClick: () -> Unit = {},
    onHistoryClick: () -> Unit = {},
    onNotificationsClick: () -> Unit = {},
    onProfileClick: () -> Unit = {},
) {
    val state by viewModel.uiState.collectAsState()
    var selectedFilter by rememberSaveable { mutableStateOf("Semua") }

    LaunchedEffect(Unit) {
        if (state is HistoryUiState.Idle) viewModel.fetchHistory()
    }

    Scaffold(
        containerColor = MessagesCanvas,
        bottomBar = {
            TembusBottomNavigation(
                items = listOf(
                    TembusNavigationItem("Beranda", Icons.Default.LocalShipping, false, onHomeClick),
                    TembusNavigationItem("Aktivitas", Icons.Default.History, false, onHistoryClick),
                    TembusNavigationItem("Pesan", Icons.Default.ChatBubbleOutline, true, onClick = {}),
                    TembusNavigationItem("Notifikasi", Icons.Default.NotificationsActive, false, onNotificationsClick),
                    TembusNavigationItem("Akun", Icons.Default.Person, false, onProfileClick),
                ),
            )
        },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Pesan", fontWeight = FontWeight.ExtraBold)
                        Text("Hubungi kurir, merchant, & bantuan", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = CustomerTextCatalog.translate("Kembali")
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MessagesCanvas)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MessagesCanvas)
        ) {
            when (val result = state) {
                is HistoryUiState.Loading, HistoryUiState.Idle -> LoadingListPlaceholder(itemCount = 4)
                is HistoryUiState.Error -> FullScreenError(
                    message = result.message,
                    onRetry = viewModel::fetchHistory
                )
                is HistoryUiState.Success -> {
                    val conversations = result.orders
                        .asSequence()
                        .filter { it.orderId.isNotBlank() && canOpenConversation(it) }
                        .distinctBy { it.orderId }
                        .sortedByDescending { it.updatedAt }
                        .toList()
                    val filteredConversations = conversations.filter { order ->
                        when (selectedFilter) {
                            // An active order can be chat-eligible before the
                            // courier profile name is present in the read model.
                            // Filter by the canonical action policy, not by a
                            // display field that may still be pending.
                            "Kurir Aktif" -> OrderActionPolicy.canChat(order.status)
                            "Merchant Food" -> isFoodConversation(order)
                            else -> true
                        }
                    }
                    val activeConversation = filteredConversations.firstOrNull { OrderActionPolicy.canChat(it.status) }

                    if (conversations.isEmpty()) {
                        EmptyMessagesState()
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 24.dp),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            item(key = "filters") {
                                MessageFilters(
                                    selected = selectedFilter,
                                    onSelected = { selectedFilter = it },
                                )
                            }
                            if (activeConversation != null) {
                                item(key = "active-conversation") {
                                    ActiveConversationCard(
                                        order = activeConversation,
                                        onOpenChat = {
                                            onOpenChat(
                                                activeConversation.orderId,
                                                activeConversation.courierName ?: activeConversation.merchantName,
                                            )
                                        },
                                        onOpenOrder = { onOpenOrder(activeConversation.orderId) },
                                    )
                                }
                            }
                            item(key = "all-conversations-header") {
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Text("Semua Percakapan", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                                    Spacer(Modifier.weight(1f))
                                    Text("${filteredConversations.size} Riwayat", color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                            if (filteredConversations.isEmpty()) {
                                item(key = "filtered-empty") { FilteredMessagesEmptyState(selectedFilter) }
                            } else {
                                items(filteredConversations, key = { it.orderId }) { order ->
                                    MessageOrderCard(
                                        order = order,
                                        onOpenChat = { onOpenChat(order.orderId, order.courierName ?: order.merchantName) },
                                        onOpenOrder = { onOpenOrder(order.orderId) }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun isFoodConversation(order: Order): Boolean =
    listOf(order.serviceCategory, order.serviceSubType)
        .filterNotNull()
        .any { it.contains("food", ignoreCase = true) || it.contains("kuliner", ignoreCase = true) }

@Composable
private fun MessageFilters(
    selected: String,
    onSelected: (String) -> Unit,
) {
    val filters = listOf("Semua", "Kurir Aktif", "Merchant Food")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        filters.forEach { filter ->
            FilterChip(
                selected = selected == filter,
                onClick = { onSelected(filter) },
                label = { Text(filter, fontSize = 11.sp, fontWeight = FontWeight.SemiBold) },
                shape = RoundedCornerShape(999.dp),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = MaterialTheme.colorScheme.primary,
                    selectedLabelColor = MaterialTheme.colorScheme.onPrimary,
                    containerColor = MaterialTheme.colorScheme.surface,
                    labelColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
                border = FilterChipDefaults.filterChipBorder(
                    enabled = true,
                    selected = selected == filter,
                    borderColor = MaterialTheme.colorScheme.outline,
                    selectedBorderColor = MaterialTheme.colorScheme.primary,
                ),
            )
        }
    }
}

@Composable
private fun ActiveConversationCard(
    order: Order,
    onOpenChat: () -> Unit,
    onOpenOrder: () -> Unit,
) {
    val serviceSpec = getTembusServiceIconSpec(order.serviceSubType ?: order.serviceCategory)
    val participant = order.courierName ?: order.merchantName ?: "Tim TEMBUS"
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("SEDANG BERJALAN", color = MaterialTheme.colorScheme.primary, fontSize = 9.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
                Text(
                    OrderActionPolicy.statusLabel(order.status, order.serviceSubType),
                    color = MaterialTheme.colorScheme.tertiary,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(42.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                    contentAlignment = Alignment.Center,
                ) { Icon(serviceSpec.icon, contentDescription = serviceSpec.label, tint = MaterialTheme.colorScheme.primary) }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(participant, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(serviceSpec.label, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("Order ${order.orderNumber.ifBlank { order.orderId }}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onOpenOrder) {
                    Icon(Icons.Default.ChevronRight, contentDescription = "Detail order", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text(
                "Kontak tersedia untuk koordinasi order ini.",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = onOpenChat, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, modifier = Modifier.size(17.dp))
                Spacer(Modifier.width(6.dp))
                Text("Buka Chat Kurir", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun FilteredMessagesEmptyState(filter: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Text(
            "Belum ada percakapan $filter yang tersedia.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            modifier = Modifier.padding(16.dp),
        )
    }
}

private fun canOpenConversation(order: Order): Boolean {
    return OrderActionPolicy.canChat(order.status) ||
        !order.courierName.isNullOrBlank() ||
        !order.merchantName.isNullOrBlank()
}

@Composable
private fun MessageOrderCard(
    order: Order,
    onOpenChat: () -> Unit,
    onOpenOrder: () -> Unit,
) {
    val serviceSpec = getTembusServiceIconSpec(order.serviceSubType ?: order.serviceCategory)
    val participant = order.courierName ?: order.merchantName ?: "Tim TEMBUS"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(serviceSpec.icon, contentDescription = serviceSpec.label, tint = MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(participant, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    "${serviceSpec.label} • ${OrderActionPolicy.statusLabel(order.status, order.serviceSubType)}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    "Order ${order.orderNumber.ifBlank { order.orderId }}",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                TextButton(onClick = onOpenChat) { Text("Buka") }
                IconButton(onClick = onOpenOrder) {
                    Icon(Icons.Default.ChevronRight, contentDescription = "Detail order")
                }
            }
        }
    }
}

@Composable
private fun EmptyMessagesState() {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Default.ChatBubbleOutline,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.65f),
            modifier = Modifier.size(64.dp)
        )
        Spacer(Modifier.size(16.dp))
        Text("Belum ada percakapan", fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(Modifier.size(6.dp))
        Text(
            "Percakapan dengan kurir atau merchant akan muncul setelah order memiliki kontak yang tersedia.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp
        )
    }
}
