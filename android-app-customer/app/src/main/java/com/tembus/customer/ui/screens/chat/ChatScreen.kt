package com.tembus.customer.ui.screens.chat

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.ChatMessage
import com.tembus.customer.ui.theme.Primary
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    orderId: String,
    courierName: String?,
    onInAppCallClick: () -> Unit,
    onBackClick: () -> Unit,
    viewModel: ChatViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var textInput by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val conversation = uiState.conversation
    val showDeliveryGroupContext = conversation?.isGroup == true ||
        conversation?.phase in setOf("delivery_group", "delivered")
    val isFoodDeliveryOrder = orderId.isNotBlank() && (uiState.order?.serviceSubType == "food_delivery" || true)
    val showFoodOrderContext = isFoodDeliveryOrder && (uiState.order != null || uiState.isLoading)
    val resolvedCourierName = uiState.order?.courierName ?: courierName
    val conversationTitle = when {
        showDeliveryGroupContext -> "Percakapan pengantaran"
        !resolvedCourierName.isNullOrBlank() -> resolvedCourierName
        else -> "Kurir Anda"
    }
    val conversationSubtitle = when {
        showDeliveryGroupContext && conversation?.memberType == "recipient" -> "Anda bergabung sebagai penerima"
        showDeliveryGroupContext -> "Customer, kurir, dan penerima"
        showFoodOrderContext -> "Delivery Driver"
        else -> "Aktif Pengiriman"
    }
    val composerPlaceholder = if (showDeliveryGroupContext) {
        "Ketik pesan di grup pengantaran..."
    } else if (showFoodOrderContext) {
        "Ketik pesan ke kurir..."
    } else {
        "Ketik pesan ke kurir..."
    }

    LaunchedEffect(orderId) {
        if (orderId.isNotBlank()) {
            // Order sudah di-load via fetchOrderSummary() di ViewModel init
        }
    }

    // Automatically scroll to bottom whenever a new message arrives
    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    // Display simple error toast when repository emits signal
    LaunchedEffect(uiState.error) {
        uiState.error?.let { err ->
            Toast.makeText(context, err, Toast.LENGTH_SHORT).show()
            viewModel.clearError()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = conversationTitle,
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(8.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF4CAF50)) // Green dot
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = conversationSubtitle,
                                color = Color.Gray,
                                fontSize = 12.sp
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali")
                    }
                },
                actions = {
                    IconButton(onClick = onInAppCallClick) {
                        Icon(
                            imageVector = Icons.Default.Call,
                            contentDescription = "Panggilan dalam aplikasi",
                            tint = Primary
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFFF2F2F7)) // Soft subtle gray background
        ) {
            AnimatedVisibility(visible = uiState.isSending) {
                LinearProgressIndicator(
                    modifier = Modifier.fillMaxWidth(),
                    color = Primary,
                    trackColor = Primary.copy(alpha = 0.12f)
                )
            }

            AnimatedVisibility(visible = showDeliveryGroupContext) {
                DeliveryGroupContextBanner(
                    memberType = conversation?.memberType,
                    notice = conversation?.visibilityNotice
                )
            }

            AnimatedVisibility(visible = showFoodOrderContext) {
                FoodOrderSummaryCard(
                    order = uiState.order!!,
                    onClick = { /* TODO: navigate to order detail */ }
                )
            }

            // Layer 1: Main Chat Area
            Box(modifier = Modifier.weight(1f)) {
                if (uiState.isLoading && uiState.messages.isEmpty()) {
                    ChatLoadingSkeleton(modifier = Modifier.fillMaxSize())
                } else if (uiState.messages.isEmpty()) {
                    EmptyChatScreen(
                        modifier = Modifier.fillMaxSize(),
                        isDeliveryGroup = showDeliveryGroupContext
                    )
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(uiState.messages) { message ->
                            val isCurrentUser = message.senderId == uiState.currentUserId
                            ChatBubble(
                                message = message,
                                isCurrentUser = isCurrentUser
                            )
                        }
                    }
                }
            }

            // Layer 2: Bottom Composer Field
            Surface(
                shadowElevation = 8.dp,
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    uiState.failedDraft?.let { failedDraft ->
                        FailedMessageBanner(
                            message = failedDraft,
                            onRetry = viewModel::retryFailedDraft,
                            onDismiss = viewModel::dismissFailedDraft
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = textInput,
                            onValueChange = { textInput = it.take(1000) },
                            placeholder = { Text(composerPlaceholder) },
                            modifier = Modifier
                                .weight(1f)
                                .padding(vertical = 4.dp),
                            shape = RoundedCornerShape(24.dp),
                            maxLines = 4,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color(0xFF111827),
                                unfocusedTextColor = Color(0xFF111827),
                                disabledTextColor = Color(0xFF6B7280),
                                focusedContainerColor = Color.White,
                                unfocusedContainerColor = Color.White,
                                disabledContainerColor = Color(0xFFF5F7FA),
                                focusedBorderColor = Primary,
                                unfocusedBorderColor = Color.LightGray,
                                focusedPlaceholderColor = Color(0xFF6B7280),
                                unfocusedPlaceholderColor = Color(0xFF6B7280),
                                cursorColor = Primary
                            )
                        )

                        Spacer(modifier = Modifier.width(8.dp))

                        FloatingActionButton(
                            onClick = {
                                if (textInput.isNotBlank() && !uiState.isSending) {
                                    viewModel.sendMessage(textInput)
                                    textInput = ""
                                }
                            },
                            containerColor = if (textInput.isBlank() || uiState.isSending) Color(0xFF9CA3AF) else Primary,
                            contentColor = Color.White,
                            shape = CircleShape,
                            modifier = Modifier.size(48.dp),
                            elevation = FloatingActionButtonDefaults.elevation(0.dp, 0.dp)
                        ) {
                            if (uiState.isSending) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(20.dp),
                                    color = Color.White,
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Filled.Send,
                                    contentDescription = "Kirim",
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeliveryGroupContextBanner(
    memberType: String?,
    notice: String?
) {
    val caption = notice ?: if (memberType == "recipient") {
        "Anda dapat berkoordinasi dengan customer dan kurir di percakapan ini."
    } else {
        "Penerima dapat bergabung di percakapan ini setelah paket diambil."
    }
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        color = Color(0xFFE8F5EE),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.18f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(Color.White),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.ChatBubbleOutline,
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(21.dp)
                )
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Grup pengantaran aktif",
                    color = Color(0xFF0B3D2A),
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
                Text(
                    text = caption,
                    color = Color(0xFF526173),
                    fontSize = 12.sp,
                    lineHeight = 16.sp
                )
            }
        }
    }
}

@Composable
private fun FailedMessageBanner(
    message: String,
    onRetry: () -> Unit,
    onDismiss: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color(0xFFFFFBEB),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, Color(0xFFF59E0B).copy(alpha = 0.28f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = Color(0xFFD97706))
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Pesan belum terkirim", color = Color(0xFF92400E), fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text(
                    message,
                    color = Color(0xFF6B4E16),
                    fontSize = 12.sp,
                    maxLines = 1
                )
            }
            TextButton(onClick = onRetry) {
                Text("Coba", color = Primary, fontWeight = FontWeight.Bold)
            }
            IconButton(onClick = onDismiss, modifier = Modifier.size(32.dp)) {
                Icon(Icons.Default.Close, contentDescription = "Tutup", tint = Color(0xFF92400E), modifier = Modifier.size(18.dp))
            }
        }
    }
}

@Composable
fun ChatBubble(
    message: ChatMessage,
    isCurrentUser: Boolean
) {
    if (message.messageType.lowercase(Locale.getDefault()) == "system") {
        SystemMessageBubble(message = message.message)
        return
    }

    val alignment = if (isCurrentUser) Alignment.End else Alignment.Start
    val bubbleColor = if (isCurrentUser) Primary else Color.White
    val contentColor = if (isCurrentUser) Color.White else Color.Black
    
    val bubbleShape = if (isCurrentUser) {
        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 2.dp)
    } else {
        RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 2.dp, bottomEnd = 16.dp)
    }

    val formattedTime = remember(message.createdAt) {
        val createdAt = message.createdAt ?: return@remember ""
        try {
            // API Format usually "2023-10-26T08:30:00Z"
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault()).apply {
                timeZone = TimeZone.getTimeZone("UTC")
            }
            val outputFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            val date = parser.parse(createdAt) ?: Date()
            outputFormat.format(date)
        } catch (e: Exception) {
            // Fallback if regex matches simpler format
            try {
                val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).apply {
                    timeZone = TimeZone.getTimeZone("UTC")
                }
                val date = parser.parse(createdAt) ?: Date()
                SimpleDateFormat("HH:mm", Locale.getDefault()).format(date)
            } catch (ex: Exception) {
                ""
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp),
        horizontalAlignment = alignment
    ) {
        Surface(
            color = bubbleColor,
            shape = bubbleShape,
            shadowElevation = 1.dp
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .widthIn(max = 280.dp)
            ) {
                if (!isCurrentUser && !message.senderName.isNullOrBlank()) {
                    Text(
                        text = message.senderName,
                        color = Primary,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 2.dp)
                    )
                }
                Text(
                    text = message.message,
                    color = contentColor,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Normal
                )
                
                if (formattedTime.isNotEmpty()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = formattedTime,
                        color = contentColor.copy(alpha = 0.6f),
                        fontSize = 10.sp,
                        modifier = Modifier.align(Alignment.End)
                    )
                }
            }
        }
    }
}

@Composable
private fun SystemMessageBubble(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.Center
    ) {
        Surface(
            color = Color(0xFFE8F5EE),
            shape = RoundedCornerShape(999.dp),
            border = BorderStroke(1.dp, Primary.copy(alpha = 0.14f))
        ) {
            Text(
                text = message,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                color = Color(0xFF0B3D2A),
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                lineHeight = 16.sp
            )
        }
    }
}

@Composable
fun EmptyChatScreen(
    modifier: Modifier = Modifier,
    isDeliveryGroup: Boolean = false
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.ChatBubbleOutline,
            contentDescription = null,
            tint = Color.Gray,
            modifier = Modifier.size(64.dp)
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = if (isDeliveryGroup) "Grup pengantaran siap" else "Belum ada percakapan",
            fontWeight = FontWeight.Bold,
            fontSize = 16.sp,
            color = Color.DarkGray
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = if (isDeliveryGroup) {
                "Koordinasi dengan kurir, customer, dan penerima tetap tercatat aman di aplikasi."
            } else {
                "Percakapan akan tersedia setelah kurir menerima order ini."
            },
            fontSize = 13.sp,
            color = Color.Gray,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 40.dp)
        )
    }
}

@Composable
private fun ChatLoadingSkeleton(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        repeat(6) { index ->
            Box(
                modifier = Modifier
                    .align(if (index % 2 == 0) Alignment.Start else Alignment.End)
                    .width(if (index % 2 == 0) 220.dp else 180.dp)
                    .height(if (index % 3 == 0) 58.dp else 44.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color(0xFFE5E7EB))
            )
        }
    }
}

@Composable
private fun FoodOrderSummaryCard(
    order: com.tembus.customer.data.model.Order,
    onClick: () -> Unit
) {
    val items = order.foodItems ?: emptyList()
    val itemCount = items.sumOf { it.quantity }
    val subtotal = items.sumOf { it.subtotal }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.10f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    color = Primary.copy(alpha = 0.10f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .padding(10.dp)
                            .size(22.dp)
                            .background(Color.LightGray)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = order.merchantName ?: "Merchant",
                        color = Color(0xFF111827),
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    Text(
                        text = "${itemCount} item${if (itemCount > 1) "s" else ""} · Rp ${subtotal}",
                        color = Color(0xFF6B7280),
                        fontSize = 13.sp
                    )
                }
                Icon(
                    imageVector = Icons.Default.ArrowForwardIos,
                    contentDescription = "Detail",
                    tint = Color(0xFF9CA3AF),
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = Color(0xFFE5E7EB))
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                items.take(3).forEachIndexed { index, item ->
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 4.dp)
                            .aspectRatio(1f)
                            .background(Color(0xFFF5F7FA))
                            .clip(RoundedCornerShape(10.dp))
                    ) {
                        // Placeholder untuk gambar item
                    }
                }
                if (items.size > 3) {
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .padding(horizontal = 4.dp)
                            .aspectRatio(1f)
                            .background(Primary.copy(alpha = 0.10f))
                            .clip(RoundedCornerShape(10.dp))
                    ) {
                        Column(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "+${items.size - 3}",
                                color = Primary,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FoodOrderSummaryCardSkeleton() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.10f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    color = Primary.copy(alpha = 0.10f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .padding(10.dp)
                            .size(22.dp)
                            .background(Color.LightGray)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(18.dp)
                            .background(Color(0xFFE5E7EB))
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Box(
                        modifier = Modifier
                            .width(120.dp)
                            .height(14.dp)
                            .background(Color(0xFFE5E7EB))
                    )
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(16.dp)
                    .background(Color(0xFFE5E7EB))
            )
            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFE5E7EB))
            Spacer(modifier = Modifier.height(10.dp))
            Box(
                modifier = Modifier
                    .width(180.dp)
                    .height(14.dp)
                    .background(Color(0xFFE5E7EB))
            )
        }
    }
}
