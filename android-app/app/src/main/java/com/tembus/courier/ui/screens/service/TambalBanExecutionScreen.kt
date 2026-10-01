package com.tembus.courier.ui.screens.service

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

private val ExecutionBackground = Color(0xFFF7F8F6)
private val ExecutionForest = Color(0xFF005438)
private val ExecutionOrange = Color(0xFFFF7800)
private val ExecutionInk = Color(0xFF17221D)
private val ExecutionMuted = Color(0xFF6A766F)
private val ExecutionSoftGreen = Color(0xFFE8F2EC)
private val ExecutionSoftOrange = Color(0xFFFFF0E5)
private val ExecutionBorder = Color(0xFFDDE6E0)

/**
 * Figma-aligned execution surface for an accepted Tambal Ban job.
 *
 * This screen intentionally consumes the existing flow state. It does not
 * invent customer, vehicle, photo, or payout data when the server has not
 * supplied it.
 */
@Composable
fun TambalBanExecutionScreen(
    orderId: String,
    uiState: TambalBanFlowUiState,
    onBackClick: () -> Unit,
    onOpenCompletion: () -> Unit,
) {
    val context = LocalContext.current
    val vehicle = uiState.customerVehicle
    val phone = uiState.customerPhone.trim().replace(Regex("[^0-9+]"), "")
    val canContact = phone.isNotBlank()
    val ticket = uiState.orderNumber.ifBlank { orderId.take(8).uppercase() }
    val vehicleLabel = listOf(vehicle?.make.orEmpty(), vehicle?.model.orEmpty())
        .filter { it.isNotBlank() }
        .joinToString(" ")
        .ifBlank { "Detail kendaraan belum tersedia" }
    val vehiclePhoto = vehicle?.photoItems?.firstOrNull { it.url.isNotBlank() }?.url
        ?: vehicle?.photoUrls?.firstOrNull { it.isNotBlank() }
    val damage = vehicle?.damage?.takeIf { it.isNotBlank() }
        ?: "Detail kerusakan belum tersedia dari customer."
    val earnings = uiState.earnings
    val netEarnings = earnings?.estimatedNetEarnings ?: 0L

    Scaffold(
        containerColor = ExecutionBackground,
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ExecutionBackground)
                    .padding(start = 8.dp, end = 20.dp, top = 12.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBackClick) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Kembali",
                        tint = ExecutionInk,
                    )
                }
                Column {
                    Text(
                        text = "TIKET AKTIF",
                        color = ExecutionOrange,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 0.6.sp,
                    )
                    Text(
                        text = "Eksekusi Tambal Ban $ticket",
                        color = ExecutionInk,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ExecutionTicketCard(
                ticket = ticket,
                customerName = uiState.customerName,
                vehicleLabel = vehicleLabel,
                address = uiState.activeAddress,
                canContact = canContact,
                onCall = {
                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone")))
                },
                onMessage = {
                    context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phone")))
                },
            )

            SafetyProtocolCard()

            ExecutionEvidenceCard(
                photoUrl = vehiclePhoto,
                damage = damage,
            )

            ExecutionProcedureCard()

            LockedTariffCard(earnings = earnings)

            OutlinedButton(
                onClick = onOpenCompletion,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
                shape = RoundedCornerShape(28.dp),
                border = ButtonDefaults.outlinedButtonBorder(enabled = true),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = ExecutionForest),
            ) {
                Icon(Icons.Default.CameraAlt, contentDescription = null, tint = ExecutionOrange)
                Spacer(Modifier.width(8.dp))
                Text("Ambil Foto Bukti Tuntas (Watermark GPS)", fontWeight = FontWeight.Bold)
            }

            Button(
                onClick = onOpenCompletion,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(28.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ExecutionOrange,
                    contentColor = Color.White,
                ),
            ) {
                Icon(Icons.Default.CheckCircle, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(
                    text = if (netEarnings > 0) {
                        "Selesaikan & Verifikasi (${formatExecutionRupiah(netEarnings)})"
                    } else {
                        "Selesaikan & Verifikasi"
                    },
                    fontWeight = FontWeight.Bold,
                )
            }

            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ExecutionTicketCard(
    ticket: String,
    customerName: String,
    vehicleLabel: String,
    address: String,
    canContact: Boolean,
    onCall: () -> Unit,
    onMessage: () -> Unit,
) {
    ExecutionCard {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            ExecutionPill("#$ticket • BAN TUBELESS", ExecutionSoftGreen, ExecutionForest)
            ExecutionPill("● Tiba di Lokasi Konsumen", ExecutionSoftGreen, ExecutionForest)
        }
        Spacer(Modifier.height(14.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(ExecutionForest),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = customerName.trim().split(Regex("\\s+")).take(2)
                        .mapNotNull { it.firstOrNull()?.uppercase() }.joinToString("")
                        .ifBlank { "CU" },
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        customerName.ifBlank { "Pelanggan" },
                        color = ExecutionInk,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                    )
                    Spacer(Modifier.width(4.dp))
                    Icon(Icons.Default.CheckCircle, contentDescription = "Terverifikasi", tint = ExecutionForest, modifier = Modifier.size(16.dp))
                }
                Text(vehicleLabel, color = ExecutionMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (canContact) {
                IconButton(onClick = onCall) {
                    Icon(Icons.Default.Call, contentDescription = "Telepon pelanggan", tint = ExecutionForest)
                }
                IconButton(onClick = onMessage) {
                    Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Kirim pesan", tint = ExecutionOrange)
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Surface(
            color = Color(0xFFF4F6F4),
            shape = RoundedCornerShape(28.dp),
        ) {
            Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Default.LocationOn, contentDescription = null, tint = ExecutionOrange, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Column {
                    Text(address.ifBlank { "Alamat lokasi layanan sedang disinkronkan" }, color = ExecutionInk, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    Text("Pastikan customer berada di titik aman sebelum pengerjaan.", color = ExecutionMuted, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun SafetyProtocolCard() {
    ExecutionCard(containerColor = ExecutionSoftOrange) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Default.WarningAmber, contentDescription = null, tint = ExecutionOrange, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(10.dp))
            Column {
                Text("PROTOKOL KESELAMATAN BAHU JALAN", color = Color(0xFF9E4B14), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(
                    "Pasang kerucut segitiga mini 3m di belakang motor, nyalakan lampu hazard, dan pastikan konsumen menunggu di trotoar aman.",
                    color = ExecutionMuted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                )
            }
        }
    }
}

@Composable
private fun ExecutionEvidenceCard(photoUrl: String?, damage: String) {
    ExecutionCard(contentPadding = 0.dp) {
        if (!photoUrl.isNullOrBlank()) {
            AsyncImage(
                model = photoUrl,
                contentDescription = "Foto verifikasi lapangan",
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp),
                contentScale = ContentScale.Crop,
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(128.dp)
                    .background(Color(0xFFE9EFEB)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.CameraAlt, contentDescription = null, tint = ExecutionForest, modifier = Modifier.size(28.dp))
                    Spacer(Modifier.height(6.dp))
                    Text("Foto verifikasi lapangan belum tersedia", color = ExecutionMuted, fontSize = 12.sp)
                }
            }
        }
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Default.Info, contentDescription = null, tint = ExecutionForest, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(8.dp))
            Column {
                Text("IDENTIFIKASI KERUSAKAN", color = ExecutionMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
                Text(damage, color = ExecutionInk, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun ExecutionProcedureCard() {
    val items = listOf(
        "Titik Kebocoran Ditemukan" to "Uji air sabun & deteksi luka fisik pada alur ban.",
        "Paku Dicabut dengan Extractor" to "Benda asing dibersihkan tanpa merusak anyaman sabuk baja.",
        "Pemasangan String Vulkanisir Cepat" to "Pengaplikasian lem cold-cure anti-rembes sekunder secara merata.",
        "Pompa Kalibrasi & Uji Ulang" to "Target tekanan mengikuti spesifikasi pabrikan kendaraan.",
    )
    ExecutionCard {
        Text("PROSEDUR STANDAR", color = ExecutionMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
        Row(verticalAlignment = Alignment.Top) {
            Text("SOP Eksekusi Tambal Ban Siaga", color = ExecutionInk, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            ExecutionPill("2/4\nSelesai", ExecutionSoftGreen, ExecutionForest)
        }
        Spacer(Modifier.height(8.dp))
        items.forEachIndexed { index, (title, description) ->
            val completed = index < 2
            val active = index == 2
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(if (active) Color(0xFFFFF8F2) else Color.Transparent, RoundedCornerShape(14.dp))
                    .padding(horizontal = 8.dp, vertical = 9.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Box(
                    modifier = Modifier
                        .padding(top = 2.dp)
                        .size(20.dp)
                        .border(1.dp, if (completed) ExecutionForest else if (active) ExecutionOrange else ExecutionMuted.copy(alpha = 0.5f), RoundedCornerShape(2.dp))
                        .background(if (completed) ExecutionForest else Color.Transparent, RoundedCornerShape(2.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    if (completed) Icon(Icons.Default.Check, contentDescription = "Selesai", tint = Color.White, modifier = Modifier.size(15.dp))
                }
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(title, color = if (active) Color(0xFF9E4B14) else ExecutionInk, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        if (active) {
                            Spacer(Modifier.width(6.dp))
                            ExecutionPill("Aktif", ExecutionOrange, Color.White)
                        }
                    }
                    Text(description, color = ExecutionMuted, fontSize = 11.sp, lineHeight = 15.sp)
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        Surface(color = ExecutionSoftGreen, shape = RoundedCornerShape(16.dp)) {
            Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = ExecutionForest, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(6.dp))
                Text("Standar pabrikan", color = ExecutionForest, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                Text("Ikuti spesifikasi kendaraan", color = ExecutionForest, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun LockedTariffCard(earnings: com.tembus.courier.ui.components.service.EarningsData?) {
    ExecutionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Lock, contentDescription = null, tint = ExecutionForest, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(7.dp))
            Text("Tarif Resmi Terkunci", color = ExecutionInk, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            ExecutionPill("PASTI PAS • BEBAS PUNGLI", ExecutionSoftGreen, ExecutionForest)
        }
        Spacer(Modifier.height(10.dp))
        ExecutionMoneyRow("Jasa Tambal Ban", earnings?.serviceFee ?: 0L)
        ExecutionMoneyRow("Biaya Panggilan Siaga On-Demand", earnings?.travelFee ?: 0L)
        Spacer(Modifier.height(8.dp))
        Surface(color = ExecutionSoftGreen, shape = RoundedCornerShape(14.dp)) {
            Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("TOTAL PENGHASILAN MITRA", color = ExecutionForest, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Text("Otomatis Masuk Dompet TEMBUS", color = ExecutionForest, fontSize = 11.sp)
                }
                Text(formatExecutionRupiah(earnings?.estimatedNetEarnings ?: 0L), color = ExecutionForest, fontSize = 18.sp, fontWeight = FontWeight.Black)
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = ExecutionForest, modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(6.dp))
            Text("Garansi penanganan 24 jam bebas bocor halus sekunder.", color = ExecutionMuted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun ExecutionMoneyRow(label: String, amount: Long) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = ExecutionMuted, fontSize = 12.sp)
        Text(if (amount > 0) formatExecutionRupiah(amount) else "—", color = ExecutionInk, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

private fun formatExecutionRupiah(amount: Long): String =
    "Rp%,d".format(amount).replace(',', '.')

@Composable
private fun ExecutionCard(
    containerColor: Color = Color.White,
    contentPadding: androidx.compose.ui.unit.Dp = 14.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(contentPadding), content = content)
    }
}

@Composable
private fun ExecutionPill(text: String, background: Color, contentColor: Color) {
    Surface(color = background, contentColor = contentColor, shape = RoundedCornerShape(16.dp)) {
        Text(text, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold, lineHeight = 12.sp)
    }
}
