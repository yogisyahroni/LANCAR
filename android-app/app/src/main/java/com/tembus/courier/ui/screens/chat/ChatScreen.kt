package com.tembus.courier.ui.screens.chat

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.tembus.courier.data.model.ChatMessage
import com.tembus.courier.data.model.Order
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.Secondary
import com.tembus.courier.BuildConfig
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    orderId: String,
    conversationTitle: String = "Hubungi Pelanggan",
    conversationSubtitle: String = "Kirim pesan jika Anda butuh arahan atau konfirmasi pekerjaan.",
    inputPlaceholder: String = "Tulis pesan untuk pelanggan...",
    isDeliveryGroup: Boolean = false,
    onCallClick: () -> Unit = {},
    onBackClick: () -> Unit,
    order: Order? = null,
    viewModel: ChatViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val messages by viewModel.messages.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    val courierId by viewModel.currentCourierId.collectAsState()
    val conversation by viewModel.conversation.collectAsState()

    var textInput by remember { mutableStateOf("") }
    val listState = rememberLazyListState()
    val showDeliveryGroupContext = isDeliveryGroup ||
        conversation?.isGroup == true ||
        conversation?.phase in setOf("delivery_group", "delivered")
    val effectiveTitle = if (showDeliveryGroupContext) "Percakapan Pengantaran" else conversationTitle
    val effectiveSubtitle = if (showDeliveryGroupContext) {
        "Customer, kurir, dan penerima berada dalam satu ruang koordinasi."
    } else {
        conversationSubtitle
    }
    val effectivePlaceholder = if (showDeliveryGroupContext) {
        "Tulis pesan di grup pengantaran..."
    } else {
        inputPlaceholder
    }

    // Dynamic Side-Effects: Load chat history on mounting
    LaunchedEffect(orderId) {
        viewModel.loadChatHistory(orderId)
    }

    // Toast trigger for ephemeral real-time errors
    LaunchedEffect(errorMessage) {
        errorMessage?.let {
            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
        }
    }

    // Fluid Auto-scrolling when new messages emit
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) {
            listState.animateScrollToItem(messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // FB-113: foto customer (yang di-chat kurir) — dari API
                        val customerPhoto = if (BuildConfig.DEBUG)
                            "http://10.0.2.2:8899/courier.png"
                        else order?.customerPhotoUrl?.takeIf { it.isNotBlank() }
                        if (customerPhoto != null) {
                            AsyncImage(
                                model = customerPhoto,
                                contentDescription = "Foto ${order?.customerName ?: "Customer"}",
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(20.dp)),
                                contentScale = ContentScale.Crop
                            )
                        }
                        Column(horizontalAlignment = Alignment.Start) {
                            Text(
                                text = effectiveTitle,
                                fontWeight = FontWeight.Bold,
                                fontSize = 18.sp,
                                color = Color.White
                            )
                            Text(
                                text = effectiveSubtitle,
                                fontSize = 12.sp,
                                color = Color.LightGray
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Kembali",
                            tint = Color.White
                        )
                    }
                },
                actions = {
                    IconButton(onClick = onCallClick) {
                        Icon(
                            imageVector = Icons.Default.Phone,
                            contentDescription = "Telepon dalam aplikasi",
                            tint = Color.White
                        )
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            )
        },
        containerColor = Color(0xFFF4F6FA)
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            if (showDeliveryGroupContext) {
                DeliveryGroupContextBanner(
                    notice = conversation?.visibilityNotice,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)
                )
            }

            // FB-113: food order summary card (parity dgn customer app) saat order food
            val foodItems = order?.foodItems
            if (!foodItems.isNullOrEmpty()) {
                CourierFoodOrderCard(
                    order = order,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }

            // ── MESSAGE STREAM CONTAINER ────────────────────────────────────
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
            ) {
                if (isLoading && messages.isEmpty()) {
                    ChatLoadingSkeleton()
                } else if (messages.isEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(32.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Belum ada percakapan",
                            style = MaterialTheme.typography.bodyLarge,
                            color = Color.Gray,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = effectiveSubtitle,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.DarkGray,
                            textAlign = TextAlign.Center
                        )
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(messages) { message ->
                            val isCourierSender = message.senderId == courierId
                            ChatBubble(
                                message = message,
                                isFromMe = isCourierSender
                            )
                        }
                    }
                }
                errorMessage?.let { message ->
                    ChatInlineNotice(
                        message = message,
                        modifier = Modifier
                            .align(Alignment.TopCenter)
                            .padding(12.dp)
                    )
                }
            }

            // ── DISPATCH INPUT BAR ──────────────────────────────────────────
            Surface(
                tonalElevation = 8.dp,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .navigationBarsPadding()
                        .imePadding()
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                ) {
                    OutlinedTextField(
                        value = textInput,
                        onValueChange = { textInput = it },
                        placeholder = { Text(effectivePlaceholder) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(24.dp),
                        maxLines = 4,
                        keyboardOptions = KeyboardOptions(
                            capitalization = KeyboardCapitalization.Sentences,
                            imeAction = ImeAction.Send
                        ),
                        keyboardActions = KeyboardActions(
                            onSend = {
                                if (textInput.isNotBlank()) {
                                    viewModel.sendMessage(textInput.trim())
                                    textInput = ""
                                }
                            }
                        ),
                        colors = OutlinedTextFieldDefaults.colors(
                            unfocusedBorderColor = Color.LightGray,
                            focusedBorderColor = MaterialTheme.colorScheme.primary
                        )
                    )

                    Spacer(modifier = Modifier.width(8.dp))

                    FilledIconButton(
                        onClick = {
                            if (textInput.isNotBlank()) {
                                viewModel.sendMessage(textInput.trim())
                                textInput = ""
                            }
                        },
                        enabled = textInput.isNotBlank(),
                        modifier = Modifier.size(48.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = MaterialTheme.colorScheme.primary
                        )
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.Send,
                            contentDescription = "Kirim",
                            tint = Color.White
                        )
                    }
                }
            }
        }
    }
}

/**
 * FB-113: Kartu ringkasan pesanan food di chat kurir (parity dgn customer app).
 * Menampilkan customer, jumlah item, total, dan foto makanan (dari API).
 */
@Composable
private fun CourierFoodOrderCard(
    order: Order?,
    modifier: Modifier = Modifier
) {
    if (order == null) return
    val items = order.foodItems
    val itemCount = items.size
    val subtotal = items.sumOf { it.price }
    val firstItemImageUrl = if (BuildConfig.DEBUG)
        "http://10.0.2.2:8899/food.png"
    else items.firstOrNull()?.photo

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(modifier = Modifier.padding(12.dp)) {
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFFF3F4F6))
            ) {
                if (firstItemImageUrl != null) {
                    AsyncImage(
                        model = firstItemImageUrl,
                        contentDescription = "Foto makanan",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Pesanan Food",
                    fontSize = 12.sp,
                    color = Color.Gray
                )
                Text(
                    text = order.customerName.ifBlank { "Customer" },
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    color = Color(0xFF111827)
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = "$itemCount produk • Rp ${String.format("%,d", subtotal)}",
                    fontSize = 13.sp,
                    color = Color(0xFF374151)
                )
            }

            Spacer(modifier = Modifier.width(8.dp))

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(Primary.copy(alpha = 0.12f))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = "$itemCount",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = Primary
                )
            }
        }
    }
}

@Composable
private fun ChatBubble(
    message: ChatMessage,
    isFromMe: Boolean
) {
    if (message.messageType.lowercase(Locale.getDefault()) == "system") {
        SystemMessageBubble(message = message.messageText)
        return
    }

    val timeFormatted = remember(message.createdAt) {
        try {
            if (message.createdAt.isNullOrBlank()) return@remember ""
            val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            val parsedDate = sdf.parse(message.createdAt)
            val localFormat = SimpleDateFormat("HH:mm", Locale.getDefault())
            localFormat.format(parsedDate ?: Date())
        } catch (e: Exception) {
            ""
        }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (isFromMe) Alignment.End else Alignment.Start
    ) {
        Box(
            modifier = Modifier
                .widthIn(max = 280.dp)
                .clip(
                    RoundedCornerShape(
                        topStart = 16.dp,
                        topEnd = 16.dp,
                        bottomStart = if (isFromMe) 16.dp else 4.dp,
                        bottomEnd = if (isFromMe) 4.dp else 16.dp
                    )
                )
                .background(
                    if (isFromMe) {
                        // Linear gradients for premium visual engagement
                        Brush.linearGradient(
                            colors = listOf(
                                Primary,
                                Secondary
                            )
                        )
                    } else {
                        Brush.linearGradient(
                            colors = listOf(
                                Color(0xFFFFFFFF),
                                Color(0xFFF9FAFB)
                            )
                        )
                    }
                )
                .padding(horizontal = 14.dp, vertical = 10.dp)
        ) {
            Column {
                Text(
                    text = message.messageText,
                    color = if (isFromMe) Color.White else Color.DarkGray,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = timeFormatted,
                    color = if (isFromMe) Color(0xB3FFFFFF) else Color.Gray,
                    fontSize = 10.sp,
                    modifier = Modifier.align(Alignment.End)
                )
            }
        }
    }
}

@Composable
private fun DeliveryGroupContextBanner(
    notice: String?,
    modifier: Modifier = Modifier
) {
    val caption = notice ?: "Penerima dapat bergabung setelah paket diambil. Semua koordinasi tetap berada di percakapan order ini."
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = Color(0xFFE8F5EE),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.18f))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp)
        ) {
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
private fun ChatInlineNotice(
    message: String,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.error.copy(alpha = 0.10f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Text(
            text = message,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

@Composable
private fun ChatLoadingSkeleton() {
    LazyColumn(
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxSize()
    ) {
        items(5) { index ->
            val alignEnd = index % 2 == 1
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = if (alignEnd) Arrangement.End else Arrangement.Start
            ) {
                Column(
                    modifier = Modifier.widthIn(min = 160.dp, max = 260.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth(if (alignEnd) 0.78f else 0.92f)
                            .height(42.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.12f))
                    )
                    Box(
                        modifier = Modifier
                            .width(68.dp)
                            .height(10.dp)
                            .clip(RoundedCornerShape(5.dp))
                            .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.10f))
                    )
                }
            }
        }
    }
}
