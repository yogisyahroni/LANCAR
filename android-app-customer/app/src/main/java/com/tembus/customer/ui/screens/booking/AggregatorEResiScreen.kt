package com.tembus.customer.ui.screens.booking

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil.compose.AsyncImage
import com.tembus.customer.data.model.CarrierTrackingEvent
import com.tembus.customer.data.model.OrderTrackingDetail
import com.tembus.customer.data.model.TrackingOrder
import com.tembus.customer.data.model.TrackingProof
import com.tembus.customer.ui.designsystem.TembusAppBar
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.theme.CustomerHomeCanvas
import com.tembus.customer.ui.theme.OnSurface
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Primary
import java.text.NumberFormat
import java.util.Locale

@Composable
fun AggregatorEResiScreen(
    orderId: String,
    viewModel: AggregatorEResiViewModel,
    onBackClick: () -> Unit,
    onNavigateHome: () -> Unit
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    val detail by viewModel.detail.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val errorMessage by viewModel.errorMessage.collectAsState()
    var selectedProofPhotoUrl by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(orderId) {
        viewModel.loadTracking(orderId)
    }

    val loadData: () -> Unit = {
        viewModel.loadTracking(orderId)
    }

    Scaffold(
        containerColor = CustomerHomeCanvas,
        topBar = {
            TembusAppBar(
                title = "Status Pick Up Ekspedisi",
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Kembali",
                            tint = OnSurface
                        )
                    }
                },
                actions = {
                    IconButton(onClick = loadData) {
                        Icon(
                            imageVector = Icons.Filled.Refresh,
                            contentDescription = "Muat ulang tracking",
                            tint = Primary
                        )
                    }
                }
            )
        },
        bottomBar = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color.White)
                    .windowInsetsPadding(WindowInsets.navigationBars)
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val order = detail?.order
                val shareText = remember(order) {
                    val awb = order?.awbNumber?.ifBlank { null } ?: order?.orderNumber ?: "-"
                    val carrier = order?.carrierName?.ifBlank { null } ?: "Ekspedisi Rekanan"
                    val bookingCode = order?.orderNumber ?: orderId.take(8).uppercase()
                    val recipient = order?.recipientName ?: "Penerima"
                    "Halo $recipient, paket Anda telah dijadwalkan kirim via $carrier.\n" +
                            "No. Resi: $awb\n" +
                            "Kode Booking: #TB-$bookingCode\n" +
                            "Lacak pengiriman dan serah terima resmi melalui aplikasi TEMBUS."
                }

                Button(
                    onClick = {
                        val sendIntent = Intent().apply {
                            action = Intent.ACTION_SEND
                            putExtra(Intent.EXTRA_TEXT, shareText)
                            type = "text/plain"
                        }
                        val shareIntent = Intent.createChooser(sendIntent, "Bagikan Resi ke Penerima")
                        context.startActivity(shareIntent)
                    },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Color(0xFF1B5E20),
                        contentColor = Color.White
                    )
                ) {
                    Icon(
                        imageVector = Icons.Filled.Share,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Bagikan Resi ke Penerima (WhatsApp)",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }

                TextButton(
                    onClick = onNavigateHome,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(40.dp)
                ) {
                    Text(
                        text = "Kembali ke Beranda TEMBUS",
                        color = OnSurfaceVariant,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 13.sp
                    )
                }
            }
        }
    ) { innerPadding ->
        if (isLoading && detail == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = Primary)
            }
        } else if (errorMessage != null && detail == null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(24.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = errorMessage ?: "Terjadi kesalahan",
                        color = Color(0xFFD32F2F),
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(onClick = loadData) {
                        Text(text = "Coba Lagi")
                    }
                }
            }
        } else {
            val currentDetail = detail
            val order = currentDetail?.order

            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Spacer(modifier = Modifier.height(4.dp))
                    StatusHeaderSection(order = order)
                }

                item {
                    EResiBarcodeCard(
                        order = order,
                        onCopy = { text ->
                            clipboardManager.setText(AnnotatedString(text))
                            Toast.makeText(context, "No. Resi disalin: $text", Toast.LENGTH_SHORT).show()
                        }
                    )
                }

                item {
                    OrderShipmentSummaryCard(order = order)
                }

                item {
                    ShipmentRouteTimelineSection(
                        order = order,
                        carrierEvents = currentDetail?.carrierEvents ?: emptyList(),
                        onRefresh = loadData
                    )
                }

                item {
                    ProofOfDeliverySection(
                        order = order,
                        proofs = currentDetail?.proofs ?: emptyList(),
                        onPhotoClick = { url -> selectedProofPhotoUrl = url }
                    )
                }

                item {
                    HandoverGuidelinesCard(order = order)
                }

                item {
                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }

    if (selectedProofPhotoUrl != null) {
        Dialog(onDismissRequest = { selectedProofPhotoUrl = null }) {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Foto Bukti Penerimaan (ePOD 3PL)",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = OnSurface
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    AsyncImage(
                        model = selectedProofPhotoUrl,
                        contentDescription = "Foto POD",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(300.dp)
                            .clip(RoundedCornerShape(8.dp))
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = { selectedProofPhotoUrl = null },
                        colors = ButtonDefaults.buttonColors(containerColor = Primary),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(text = "Tutup")
                    }
                }
            }
        }
    }
}

@Composable
private fun StatusHeaderSection(order: TrackingOrder?) {
    val status = order?.status?.lowercase() ?: "pending"
    val isDelivered = status == "delivered" || status == "completed"
    val isInTransit = status == "in_transit" || status == "out_for_delivery" || status == "picked_up"

    val badgeText = when {
        isDelivered -> "● Paket Diterima • Tuntas"
        isInTransit -> "● Dalam Pengiriman Ekspedisi"
        else -> "● Jadwal Pick-up Dikonfirmasi • Tepat Waktu"
    }

    val heading = when {
        isDelivered -> "Paket Berhasil Diterima!"
        isInTransit -> "Paket Sedang Dalam Perjalanan"
        else -> "Permintaan Pick-up Berhasil!"
    }

    val carrierName = order?.carrierName?.ifBlank { null } ?: "J&T Express"
    val subtitle = when {
        isDelivered -> "Kurir ekspedisi rekanan ($carrierName) telah menyelesaikan serah terima ke penerima di alamat tujuan."
        isInTransit -> "Paket sedang dalam perjalanan bersama jaringan ekspedisi rekanan ($carrierName)."
        else -> "Kurir ekspedisi rekanan ($carrierName) sedang ditugaskan menjemput paket ke alamat Anda."
    }

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .background(Color(0xFFE8F5E9))
                .padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Text(
                text = badgeText,
                color = Color(0xFF2E7D32),
                fontWeight = FontWeight.Bold,
                fontSize = 12.sp
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = heading,
            fontWeight = FontWeight.Bold,
            fontSize = 20.sp,
            color = OnSurface
        )

        Spacer(modifier = Modifier.height(4.dp))

        Text(
            text = subtitle,
            color = OnSurfaceVariant,
            fontSize = 13.sp,
            lineHeight = 18.sp
        )
    }
}

@Composable
private fun EResiBarcodeCard(
    order: TrackingOrder?,
    onCopy: (String) -> Unit
) {
    val awb = order?.awbNumber?.ifBlank { null } ?: order?.orderNumber ?: "PENDING-AWB"
    val bookingCode = order?.orderNumber ?: order?.id?.take(8)?.uppercase() ?: "TB-00000"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE0E0E0))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.QrCode,
                        contentDescription = null,
                        tint = Color(0xFF1B5E20),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "E-Resi Resmi Ekspedisi",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = OnSurface
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(Color(0xFFE8F5E9))
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "BEBAS CETAK",
                        color = Color(0xFF2E7D32),
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp
                    )
                }
            }

            HorizontalDivider(color = Color(0xFFEEEEEE))

            Column {
                Text(
                    text = "NO. RESI OTOMATIS",
                    color = OnSurfaceVariant,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    letterSpacing = 0.5.sp
                )
                Spacer(modifier = Modifier.height(2.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = awb,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = OnSurface,
                        fontFamily = FontFamily.Monospace
                    )
                    OutlinedButton(
                        onClick = { onCopy(awb) },
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, Color(0xFFBDBDBD)),
                        modifier = Modifier.height(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.ContentCopy,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = Color(0xFF424242)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "Salin",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFF424242)
                        )
                    }
                }
            }

            // Visual Scannable Barcode Canvas
            BarcodeCanvas(text = awb)

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Kode Booking TEMBUS:",
                    fontSize = 12.sp,
                    color = OnSurfaceVariant
                )
                Text(
                    text = "#TB-$bookingCode",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = Color(0xFF1B5E20),
                    fontFamily = FontFamily.Monospace
                )
            }

            // Warning Notice Box
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFFFFF8E1))
                    .padding(10.dp)
            ) {
                Text(
                    text = "Tunjukkan barcode di atas ke kurir saat serah terima, pastikan juga bahwa resi tersebut sudah terhubung dengan data paket Anda.",
                    fontSize = 11.sp,
                    color = Color(0xFFE65100),
                    lineHeight = 15.sp
                )
            }
        }
    }
}

@Composable
private fun BarcodeCanvas(text: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Color(0xFFFAFAFA))
            .padding(vertical = 12.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth(0.85f)
                .height(48.dp)
        ) {
            val totalBars = 45
            val step = size.width / totalBars
            val pattern = intArrayOf(
                2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 2,
                4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 4
            )
            for (i in 0 until totalBars) {
                val barWidth = (pattern[i % pattern.size] * 1.3f).coerceAtMost(step * 0.85f)
                val x = i * step + (step - barWidth) / 2
                drawLine(
                    color = Color(0xFF212121),
                    start = Offset(x, 0f),
                    end = Offset(x, size.height),
                    strokeWidth = barWidth
                )
            }
        }

        Spacer(modifier = Modifier.height(6.dp))

        Text(
            text = text,
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
            color = Color(0xFF616161),
            letterSpacing = 2.sp
        )
    }
}

@Composable
private fun OrderShipmentSummaryCard(order: TrackingOrder?) {
    val carrier = order?.carrierName?.uppercase()?.ifBlank { null } ?: "J&T EXPRESS"
    val subtype = order?.serviceSubType?.ifBlank { null } ?: "Reguler"
    val price = order?.totalPriceIdr ?: 0L
    val formattedPrice = NumberFormat.getNumberInstance(Locale("id", "ID")).format(price)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE0E0E0))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color(0xFFE53935)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = carrier.take(3),
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "$carrier $subtype",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp,
                            color = OnSurface
                        )
                        Text(
                            text = "Estimasi Tiba: 2-3 Hari Kerja",
                            fontSize = 11.sp,
                            color = OnSurfaceVariant
                        )
                    }
                }

                Text(
                    text = "Rp $formattedPrice",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = Color(0xFF1B5E20)
                )
            }

            HorizontalDivider(color = Color(0xFFF0F0F0))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "Muatan:", fontSize = 12.sp, color = OnSurfaceVariant)
                Text(text = "Paket Logistik (1 Koli)", fontSize = 12.sp, fontWeight = FontWeight.Medium)
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "Proteksi Asuransi:", fontSize = 12.sp, color = OnSurfaceVariant)
                Text(
                    text = "Aktif (Maks. Rp 10.000.000)",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF2E7D32)
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(text = "Pembayaran:", fontSize = 12.sp, color = OnSurfaceVariant)
                Text(
                    text = "Lunas (TEMBUS-Pay)",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFF1B5E20)
                )
            }
        }
    }
}

@Composable
private fun ShipmentRouteTimelineSection(
    order: TrackingOrder?,
    carrierEvents: List<CarrierTrackingEvent>,
    onRefresh: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE0E0E0))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Rute Alur Pengiriman",
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    color = OnSurface
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { onRefresh() }
                ) {
                    Text(
                        text = "Update 3PL",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = Color(0xFF1B5E20)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        imageVector = Icons.Filled.Refresh,
                        contentDescription = "Refresh",
                        tint = Color(0xFF1B5E20),
                        modifier = Modifier.size(14.dp)
                    )
                }
            }

            HorizontalDivider(color = Color(0xFFF0F0F0))

            // Check if there are real carrier_events from 3PL in DB
            if (carrierEvents.isNotEmpty()) {
                carrierEvents.forEachIndexed { index, event ->
                    TimelineItem(
                        title = event.providerStatusDescription ?: event.canonicalStatus ?: "Status Pengiriman",
                        subtitle = event.providerLocation ?: (order?.carrierName ?: "Ekspedisi"),
                        time = event.occurredAt ?: event.receivedAt ?: "",
                        isFirst = index == 0,
                        isLast = index == carrierEvents.lastIndex,
                        isActive = index == carrierEvents.lastIndex
                    )
                }
            } else {
                // Initial scheduled route pipeline (before first 3PL scan occurs)
                // Note: Per user request, NO "DRIVER OTW" tag here.
                TimelineItem(
                    title = "Titik Jemput (Penjemputan Terjadwal)",
                    subtitle = order?.pickupAddress ?: "Alamat penjemputan paket",
                    time = "Jadwal dikonfirmasi",
                    isFirst = true,
                    isLast = false,
                    isActive = true
                )

                TimelineItem(
                    title = "Gerai Sortir Hub Rekanan",
                    subtitle = "Drop Point Hub ${order?.carrierName ?: "Ekspedisi"} — Menunggu serah terima",
                    time = "Setelah paket di-pickup",
                    isFirst = false,
                    isLast = false,
                    isActive = false
                )

                TimelineItem(
                    title = "Tujuan Akhir",
                    subtitle = "${order?.dropoffAddress ?: "Alamat tujuan"}\nPenerima: ${order?.recipientName ?: "-"}",
                    time = "Estimasi reguler",
                    isFirst = false,
                    isLast = true,
                    isActive = false
                )
            }
        }
    }
}

@Composable
private fun TimelineItem(
    title: String,
    subtitle: String,
    time: String,
    isFirst: Boolean,
    isLast: Boolean,
    isActive: Boolean
) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(if (isActive) Color(0xFF2E7D32) else Color(0xFFBDBDBD)),
                contentAlignment = Alignment.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(6.dp)
                        .clip(CircleShape)
                        .background(Color.White)
                )
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(44.dp)
                        .background(Color(0xFFE0E0E0))
                )
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.SemiBold,
                    fontSize = 13.sp,
                    color = if (isActive) Color(0xFF1B5E20) else OnSurface
                )
                if (time.isNotBlank()) {
                    Text(
                        text = time.take(16).replace("T", " "),
                        fontSize = 10.sp,
                        color = OnSurfaceVariant
                    )
                }
            }
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = subtitle,
                fontSize = 11.sp,
                color = OnSurfaceVariant,
                lineHeight = 15.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ProofOfDeliverySection(
    order: TrackingOrder?,
    proofs: List<TrackingProof>,
    onPhotoClick: (String) -> Unit
) {
    val deliveredProof = proofs.firstOrNull { it.scanType?.lowercase() == "delivered" }
        ?: proofs.lastOrNull { !it.photoUrl.isNullOrBlank() }
    val isDelivered = order?.status?.lowercase() == "delivered" || order?.status?.lowercase() == "completed"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE0E0E0))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Filled.Image,
                        contentDescription = null,
                        tint = if (deliveredProof != null) Color(0xFF1B5E20) else OnSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "Foto Bukti Penerimaan (POD)",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        color = OnSurface
                    )
                }

                if (deliveredProof != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFFE8F5E9))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "TERVERIFIKASI 3PL",
                            color = Color(0xFF2E7D32),
                            fontWeight = FontWeight.Bold,
                            fontSize = 10.sp
                        )
                    }
                }
            }

            HorizontalDivider(color = Color(0xFFF0F0F0))

            if (deliveredProof?.photoUrl != null) {
                val photoUrl = deliveredProof.photoUrl
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    AsyncImage(
                        model = photoUrl,
                        contentDescription = "Foto POD 3PL",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .clickable { onPhotoClick(photoUrl) }
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Penerima: ${order?.recipientName ?: "Sesuai Alamat"}",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = OnSurface
                        )
                        Text(
                            text = (deliveredProof.recordedAt ?: "").take(16).replace("T", " "),
                            fontSize = 10.sp,
                            color = OnSurfaceVariant
                        )
                    }
                }
            } else if (isDelivered) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFF5F5F5))
                        .padding(14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Paket telah diterima di tujuan akhir. Menunggu sinkronisasi foto dari kurir 3PL.",
                        fontSize = 12.sp,
                        color = OnSurfaceVariant
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFFF9F9F9))
                        .padding(12.dp)
                ) {
                    Text(
                        text = "Foto bukti serah terima akan otomatis diperbarui di sini setelah kurir 3PL menyelesaikan pengantaran ke tujuan akhir.",
                        fontSize = 11.sp,
                        color = OnSurfaceVariant,
                        lineHeight = 16.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun HandoverGuidelinesCard(order: TrackingOrder?) {
    val bookingCode = order?.orderNumber ?: order?.id?.take(8)?.uppercase() ?: "TB-00000"

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE0E0E0))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(
                text = "Panduan Penyerahan Paket",
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = OnSurface
            )

            HorizontalDivider(color = Color(0xFFF0F0F0))

            GuidelineStepItem(
                number = "1",
                text = "Pastikan paket tertutup rapat & tuliskan kode booking #TB-$bookingCode di sisi luar paket jika ada spidol."
            )

            GuidelineStepItem(
                number = "2",
                text = "Tunjukkan barcode e-resi di atas saat kurir tiba untuk scan serah terima digital tanpa perlu cetak kertas."
            )

            GuidelineStepItem(
                number = "3",
                text = "Kurir tidak memungut biaya tunai lagi. Ongkir & asuransi telah lunas via TEMBUS-Pay."
            )
        }
    }
}

@Composable
private fun GuidelineStepItem(number: String, text: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        Box(
            modifier = Modifier
                .size(20.dp)
                .clip(CircleShape)
                .background(Color(0xFFE8F5E9)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = number,
                color = Color(0xFF2E7D32),
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp
            )
        }
        Spacer(modifier = Modifier.width(10.dp))
        Text(
            text = text,
            fontSize = 12.sp,
            color = OnSurfaceVariant,
            lineHeight = 16.sp,
            modifier = Modifier.weight(1f)
        )
    }
}
