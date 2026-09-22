package com.tembus.customer.ui.screens.profile

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Payment
import androidx.compose.material.icons.filled.ReportProblem
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.Order
import com.tembus.customer.ui.localization.CustomerTextCatalog

private val SupportCanvas = Color(0xFFF7F8F6)
private val SupportSurface = Color.White
private val SupportGreen = Color(0xFF075C2F)
private val SupportGreenSoft = Color(0xFFE8F5EC)
private val SupportOrange = Color(0xFFFF6B00)
private val SupportText = Color(0xFF18231D)
private val SupportMuted = Color(0xFF66736B)
private val SupportBorder = Color(0xFFD7E8DC)

private data class SupportTopic(
    val title: String,
    val subtitle: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
)

private data class SupportFaq(
    val question: String,
    val answer: String,
)

private val supportTopics = listOf(
    SupportTopic("Kendala Pesanan", "Kurir, status, atau bukti layanan", Icons.Default.LocalShipping),
    SupportTopic("Pembayaran & Saldo", "Top up, voucher, atau transaksi", Icons.Default.Payment),
    SupportTopic("Layanan Darurat", "Tambal ban atau towing aktif", Icons.Default.Build),
    SupportTopic("Akun & Keamanan", "PIN, privasi, atau akses akun", Icons.Default.Lock),
)

private val supportFaqs = listOf(
    SupportFaq("Bagaimana cara melihat status pesanan?", "Buka Aktivitas lalu pilih pesanan. Status dan tindakan yang tersedia mengikuti data order dari server."),
    SupportFaq("Kenapa chat atau telepon kurir belum tersedia?", "Kontak order baru dibuka ketika order memiliki konteks layanan dan status yang mengizinkannya."),
    SupportFaq("Bagaimana jika harga atau layanan berubah?", "Tinjau quote terbaru dari server sebelum menyetujui. Jangan melanjutkan jika rincian belum sesuai."),
    SupportFaq("Apakah nomor pribadi dibagikan ke kurir?", "Tidak. Komunikasi customer dan mitra memakai jalur order-scoped dan nomor yang disamarkan."),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SupportScreen(
    onBackClick: () -> Unit,
    onOpenOrder: (String) -> Unit,
    viewModel: SupportViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var expandedFaqIndex by rememberSaveable { mutableIntStateOf(-1) }
    val context = androidx.compose.ui.platform.LocalContext.current

    Scaffold(
        containerColor = SupportCanvas,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Pusat Bantuan", color = SupportText, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("BANTUAN RESMI TEMBUS", color = SupportOrange, fontWeight = FontWeight.Bold, fontSize = 9.sp, letterSpacing = 0.8.sp)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"), tint = SupportText)
                    }
                },
                actions = {
                    Icon(Icons.Default.SupportAgent, contentDescription = "Support TEMBUS", tint = SupportGreen, modifier = Modifier.padding(end = 16.dp).size(22.dp))
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = SupportCanvas)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().background(SupportCanvas).padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item { SupportTrustHeader() }
            item {
                ActiveOrderContext(
                    isLoading = uiState.isLoading,
                    activeOrder = uiState.activeOrder,
                    loadError = uiState.loadError,
                    onOpenOrder = onOpenOrder,
                )
            }
            item {
                SectionTitle(
                    title = if (uiState.activeOrder != null) "Pilih kendala pesanan ini" else "Pilih topik bantuan",
                    trailing = if (uiState.activeOrder != null) "Order aktif" else "Umum"
                )
            }
            items(supportTopics) { topic ->
                SupportTopicCard(topic = topic, onClick = { openSupportChannel(context, topic.title) })
            }
            item { SupportEscalationCard(context) }
            item { SupportTicketCard() }
            item { SectionTitle(title = "Topik bantuan populer", trailing = null) }
            items(supportFaqs.indices.toList()) { index ->
                FaqCard(
                    faq = supportFaqs[index],
                    expanded = expandedFaqIndex == index,
                    onClick = { expandedFaqIndex = if (expandedFaqIndex == index) -1 else index }
                )
            }
        }
    }
}

@Composable
private fun SupportTrustHeader() {
    Surface(modifier = Modifier.fillMaxWidth(), color = SupportGreenSoft, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, SupportBorder)) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(42.dp).clip(RoundedCornerShape(13.dp)).background(SupportSurface), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.SupportAgent, contentDescription = null, tint = SupportGreen, modifier = Modifier.size(23.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column {
                Text("Bantuan cepat untuk order kamu", color = SupportText, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("Pilih kendala agar tim TEMBUS mendapat konteks yang tepat.", color = SupportMuted, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 3.dp))
            }
        }
    }
}

@Composable
private fun ActiveOrderContext(
    isLoading: Boolean,
    activeOrder: Order?,
    loadError: String?,
    onOpenOrder: (String) -> Unit,
) {
    when {
        isLoading -> Surface(color = SupportSurface, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, SupportBorder), modifier = Modifier.fillMaxWidth()) {
            Row(modifier = Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(color = SupportGreen, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
                Text("Memuat konteks order...", color = SupportMuted, fontSize = 12.sp, modifier = Modifier.padding(start = 10.dp))
            }
        }
        activeOrder != null -> {
            val orderLabel = activeOrder.orderNumber.ifBlank { activeOrder.orderId }
            Surface(color = SupportSurface, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, SupportBorder), modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = SupportGreen, modifier = Modifier.size(18.dp))
                        Text("Pesanan aktif terpilih", color = SupportGreen, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(start = 7.dp))
                        Spacer(Modifier.weight(1f))
                        Text(supportStatusLabel(activeOrder.status), color = SupportOrange, fontWeight = FontWeight.Bold, fontSize = 10.sp)
                    }
                    Text(orderLabel, color = SupportText, fontWeight = FontWeight.Bold, fontSize = 16.sp, modifier = Modifier.padding(top = 8.dp))
                    Text(serviceLabel(activeOrder), color = SupportMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 2.dp))
                    Row(modifier = Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = SupportMuted, modifier = Modifier.size(16.dp))
                        Text("Konteks berasal dari riwayat order customer.", color = SupportMuted, fontSize = 11.sp, modifier = Modifier.padding(start = 5.dp))
                        Spacer(Modifier.weight(1f))
                        Surface(modifier = Modifier.clickable { onOpenOrder(activeOrder.orderId) }, color = SupportGreenSoft, shape = RoundedCornerShape(10.dp)) {
                            Text("Lihat", color = SupportGreen, fontWeight = FontWeight.Bold, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp))
                        }
                    }
                }
            }
        }
        else -> Surface(color = SupportSurface, shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, SupportBorder), modifier = Modifier.fillMaxWidth()) {
            Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Info, contentDescription = null, tint = SupportMuted, modifier = Modifier.size(20.dp))
                Column(modifier = Modifier.padding(start = 9.dp)) {
                    Text("Belum ada order aktif", color = SupportText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Text(loadError ?: "Pilih topik umum untuk menghubungi kanal resmi TEMBUS.", color = SupportMuted, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.padding(top = 3.dp))
                }
            }
        }
    }
}

@Composable
private fun SectionTitle(title: String, trailing: String?) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, color = SupportText, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, modifier = Modifier.weight(1f))
        if (!trailing.isNullOrBlank()) Text(trailing, color = SupportOrange, fontWeight = FontWeight.Bold, fontSize = 10.sp)
    }
}

@Composable
private fun SupportTopicCard(topic: SupportTopic, onClick: () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick), color = SupportSurface, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, SupportBorder)) {
        Row(modifier = Modifier.padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(SupportGreenSoft), contentAlignment = Alignment.Center) {
                Icon(topic.icon, contentDescription = topic.title, tint = SupportGreen, modifier = Modifier.size(21.dp))
            }
            Column(modifier = Modifier.weight(1f).padding(start = 11.dp)) {
                Text(topic.title, color = SupportText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text(topic.subtitle, color = SupportMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
            }
            Icon(Icons.Default.ChevronRight, contentDescription = "Buka ${topic.title}", tint = SupportMuted, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun SupportEscalationCard(context: Context) {
    Surface(color = SupportGreen, shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(color = SupportOrange, shape = RoundedCornerShape(9.dp)) {
                    Text("SIAGA 24 JAM", color = Color.White, fontWeight = FontWeight.Black, fontSize = 10.sp, modifier = Modifier.padding(horizontal = 9.dp, vertical = 6.dp))
                }
                Spacer(Modifier.weight(1f))
                Icon(Icons.Default.SupportAgent, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
            Text("Butuh bantuan sekarang?", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 19.sp, modifier = Modifier.padding(top = 12.dp))
            Text("Gunakan kanal resmi agar konteks bantuan tetap tercatat dan nomor pribadi tidak dibagikan.", color = Color.White.copy(alpha = 0.82f), fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 4.dp))
            Button(onClick = { openSupportChannel(context, "Live Chat CS") }, modifier = Modifier.fillMaxWidth().padding(top = 13.dp), colors = ButtonDefaults.buttonColors(containerColor = SupportOrange, contentColor = Color.White), shape = RoundedCornerShape(13.dp)) {
                Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, modifier = Modifier.size(18.dp))
                Text("Live Chat CS", fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 7.dp))
            }
            OutlinedButton(onClick = { openEmail(context) }, modifier = Modifier.fillMaxWidth().padding(top = 7.dp), colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White), border = BorderStroke(1.dp, Color.White.copy(alpha = 0.5f)), shape = RoundedCornerShape(13.dp)) {
                Icon(Icons.Default.Email, contentDescription = null, modifier = Modifier.size(18.dp))
                Text("Kirim Email", fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 7.dp))
            }
        }
    }
}

@Composable
private fun SupportTicketCard() {
    Surface(color = SupportSurface, shape = RoundedCornerShape(17.dp), border = BorderStroke(1.dp, SupportBorder), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(40.dp).clip(RoundedCornerShape(12.dp)).background(SupportGreenSoft), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.ReportProblem, contentDescription = null, tint = SupportGreen, modifier = Modifier.size(20.dp))
            }
            Column(modifier = Modifier.weight(1f).padding(start = 10.dp)) {
                Text("Status tiket pengaduan", color = SupportText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text("Belum ada tiket aktif pada akun ini.", color = SupportMuted, fontSize = 11.sp, modifier = Modifier.padding(top = 3.dp))
            }
            Icon(Icons.Default.ChevronRight, contentDescription = null, tint = SupportMuted, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun FaqCard(faq: SupportFaq, expanded: Boolean, onClick: () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick), color = SupportSurface, shape = RoundedCornerShape(15.dp), border = BorderStroke(1.dp, SupportBorder)) {
        Column(modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(faq.question, color = SupportText, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.weight(1f))
                Icon(Icons.Default.ChevronRight, contentDescription = if (expanded) "Tutup" else "Buka", tint = SupportMuted, modifier = Modifier.size(20.dp).rotate(if (expanded) 90f else 0f))
            }
            if (expanded) Text(faq.answer, color = SupportMuted, fontSize = 11.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 8.dp))
        }
    }
}

private fun serviceLabel(order: Order): String {
    return when {
        order.serviceCategory.equals("food", ignoreCase = true) || !order.merchantName.isNullOrBlank() -> "Pesanan Food"
        order.serviceCategory.equals("tambal_ban", ignoreCase = true) -> "Layanan Tambal Ban"
        order.serviceCategory.equals("towing", ignoreCase = true) -> "Layanan Towing"
        else -> "Kirim Paket"
    }
}

private fun supportStatusLabel(status: String): String {
    return when (status.trim().lowercase()) {
        "pending_payment" -> "Menunggu pembayaran"
        "pending", "created" -> "Menunggu proses"
        "accepted", "courier_assigned", "assigned" -> "Mitra ditugaskan"
        "picked_up", "in_transit", "delivering", "arriving" -> "Sedang berjalan"
        else -> status.ifBlank { "Status order" }.replace('_', ' ').replaceFirstChar { it.uppercase() }
    }
}

private fun openSupportChannel(context: Context, topic: String) {
    val encodedTopic = Uri.encode("Halo TEMBUS, saya butuh bantuan: $topic")
    val whatsappUrl = "https://wa.me/6285156448966?text=$encodedTopic"
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(whatsappUrl))
    try {
        context.startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        openEmail(context)
    }
}

private fun openEmail(context: Context) {
    val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:support@tembus.id"))
    runCatching { context.startActivity(intent) }
}
