package com.lancar.customer.ui.screens.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Logout
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SwapVert
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.lancar.customer.data.model.DeliveryServiceProduct
import com.lancar.customer.ui.theme.Primary
import com.lancar.customer.ui.theme.Secondary

private val Ink = Color(0xFF17202A)
private val Muted = Color(0xFF657086)
private val LcGreen = Color(0xFF067A46)
private val LcGreenDark = Color(0xFF06412B)
private val SoftGreen = Color(0xFFEAF8EF)
private val SoftBlue = Color(0xFFEAF4FF)
private val SoftOrange = Color(0xFFFFF3E8)
private val SurfaceLine = Color(0xFFE1E7F0)

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    onLogout: () -> Unit = {},
    onBookingClick: (String?) -> Unit = {},
    onTrackingClick: (String) -> Unit = {},
    onHistoryClick: () -> Unit = {},
    onProfileClick: () -> Unit = {}
) {
    val customerName by viewModel.customerName.collectAsState()
    val activeOrder by viewModel.activeOrder.collectAsState()
    val services by viewModel.services.collectAsState()
    val dataError by viewModel.dataError.collectAsState()

    Scaffold(
        containerColor = Color(0xFFF3F5F8),
        bottomBar = {
            NavigationBar(containerColor = Color.White, tonalElevation = 8.dp) {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Home, contentDescription = "Beranda") },
                    label = { Text("Beranda") },
                    selected = true,
                    onClick = {}
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.History, contentDescription = "Riwayat") },
                    label = { Text("Riwayat") },
                    selected = false,
                    onClick = onHistoryClick
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Person, contentDescription = "Profil") },
                    label = { Text("Profil") },
                    selected = false,
                    onClick = onProfileClick
                )
            }
        }
    ) { paddingValues ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentPadding = PaddingValues(bottom = 30.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                HomeHero(
                    customerName = customerName.orEmpty().ifBlank { "Pelanggan" },
                    onLogout = onLogout,
                    onPickupClick = { onBookingClick("pickup") },
                    onDestinationClick = { onBookingClick("dropoff") }
                )
            }
            activeOrder?.let { order ->
                item {
                    ActiveOrderCard(
                        title = "Pengiriman aktif",
                        subtitle = order.dropAddress.ifBlank { order.pickupAddress.ifBlank { order.orderId } },
                        status = order.status,
                        onClick = { onTrackingClick(order.orderId) }
                    )
                }
            }
            dataError?.let { message ->
                item {
                    DashboardDataErrorCard(
                        message = message,
                        onRetry = viewModel::refreshData
                    )
                }
            }
            item {
                LocationRequestCard(onBookingClick = { onBookingClick("dropoff") })
            }
            item {
                ServiceOverview(services = services, onBookingClick = { onBookingClick(null) })
            }
            item {
                TrustCard()
            }
        }
    }
}

@Composable
private fun DashboardDataErrorCard(
    message: String,
    onRetry: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
        border = BorderStroke(1.dp, Color(0xFFF4D58D))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Shield, contentDescription = null, tint = Color(0xFFB45309))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Data live belum tersedia", color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
                Text(message, color = Color(0xFF8A5A0A), fontSize = 12.sp, lineHeight = 17.sp)
            }
            TextButton(onClick = onRetry) {
                Text("Coba Lagi", fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
private fun HomeHero(
    customerName: String,
    onLogout: () -> Unit,
    onPickupClick: () -> Unit,
    onDestinationClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(410.dp)
            .background(Color(0xFFF3F5F8))
            .statusBarsPadding()
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(280.dp)
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF0B68C7), Color(0xFF087A54)),
                        startY = 0f,
                        endY = 580f
                    )
                )
        )

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 22.dp, vertical = 20.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("LANCAR", color = Color.White, fontSize = 31.sp, fontWeight = FontWeight.ExtraBold)
                Text("Kirim instan, pantau real-time.", color = Color.White.copy(alpha = 0.9f), fontSize = 15.sp)
            }
            IconButton(
                onClick = onLogout,
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.15f))
            ) {
                Icon(Icons.Default.Logout, contentDescription = "Keluar", tint = Color.White)
            }
        }

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .align(Alignment.BottomCenter),
            shape = RoundedCornerShape(30.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
        ) {
            Column(Modifier.padding(22.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Halo, $customerName",
                            fontSize = 23.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = Ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text("Mau kirim paket ke mana hari ini?", color = Muted, fontSize = 15.sp)
                    }
                    Box(
                        modifier = Modifier
                            .size(58.dp)
                            .clip(RoundedCornerShape(21.dp))
                            .background(SoftBlue),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.LocalShipping, contentDescription = null, tint = Primary, modifier = Modifier.size(33.dp))
                    }
                }

                Spacer(Modifier.height(18.dp))
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(24.dp))
                        .background(Color(0xFFF5F8FC))
                        .padding(14.dp)
                ) {
                    RouteLine(
                        icon = Icons.Default.Place,
                        color = LcGreen,
                        label = "Ambil paket di",
                        value = "Cari lokasi pickup",
                        onClick = onPickupClick
                    )
                    Row(Modifier.padding(start = 19.dp)) {
                        Box(
                            Modifier
                                .height(18.dp)
                                .width(1.dp)
                                .background(SurfaceLine)
                        )
                        Spacer(Modifier.weight(1f))
                        Box(
                            modifier = Modifier
                                .size(42.dp)
                                .clip(CircleShape)
                                .background(Color.White)
                                .border(BorderStroke(1.dp, SurfaceLine), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.SwapVert, contentDescription = null, tint = Muted, modifier = Modifier.size(20.dp))
                        }
                    }
                    RouteLine(
                        icon = Icons.Default.Navigation,
                        color = Secondary,
                        label = "Kirim paket ke mana?",
                        value = "Tambah alamat tujuan",
                        onClick = onDestinationClick
                    )
                }
            }
        }
    }
}

@Composable
private fun RouteLine(
    icon: ImageVector,
    color: Color,
    label: String,
    value: String,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .clickable { onClick() }
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(color.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = color)
        }
        Spacer(Modifier.width(13.dp))
        Column(Modifier.weight(1f)) {
            Text(label, color = Muted, fontSize = 12.sp)
            Text(
                value,
                color = Ink,
                fontSize = 17.sp,
                fontWeight = FontWeight.ExtraBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, tint = Color(0xFFAAB2C0))
    }
}

@Composable
private fun ActiveOrderCard(
    title: String,
    subtitle: String,
    status: String,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = SoftGreen),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(17.dp))
                    .background(Color.White),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Navigation, contentDescription = null, tint = LcGreen)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp)
                Text(
                    subtitle,
                    color = Muted,
                    fontSize = 13.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(status.replace("_", " ").uppercase(), color = LcGreen, fontWeight = FontWeight.Bold, fontSize = 11.sp)
            }
            Text("Lacak", color = LcGreen, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun LocationRequestCard(onBookingClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp)
            .clickable { onBookingClick() },
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 18.dp, vertical = 17.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Map, contentDescription = null, tint = LcGreen, modifier = Modifier.size(30.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Minta lokasi penerima", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                Text("Bagikan link agar titik dropoff lebih akurat.", color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
            }
            Text("Mulai", color = LcGreen, fontWeight = FontWeight.ExtraBold)
            Icon(Icons.Default.KeyboardArrowRight, contentDescription = null, tint = LcGreen)
        }
    }
}

@Composable
private fun ServiceOverview(
    services: List<DeliveryServiceProduct>,
    onBookingClick: () -> Unit
) {
    Column(Modifier.padding(start = 18.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(end = 18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("Layanan LANCAR", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold)
                Text("Aktif dari pricing admin dan siap dihitung real-time.", color = Muted, fontSize = 13.sp)
            }
            TextButton(onClick = onBookingClick) {
                Text("Order", fontWeight = FontWeight.ExtraBold)
            }
        }
        Spacer(Modifier.height(12.dp))
        if (services.isEmpty()) {
            EmptyServiceCard()
        } else {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(end = 18.dp)
            ) {
                items(services, key = { it.code }) { service ->
                    ServiceCard(service = service, onClick = onBookingClick)
                }
            }
        }
    }
}

@Composable
private fun EmptyServiceCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(end = 18.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.padding(18.dp)) {
            Text("Layanan belum tersedia", color = Ink, fontWeight = FontWeight.ExtraBold)
            Text("Pastikan service on-demand aktif di admin pricing.", color = Muted, fontSize = 13.sp)
        }
    }
}

@Composable
private fun ServiceCard(service: DeliveryServiceProduct, onClick: () -> Unit) {
    val usesCar = service.vehicleTypes.any { it.equals("car", ignoreCase = true) || it.equals("mobil", ignoreCase = true) }
    Card(
        modifier = Modifier
            .width(232.dp)
            .height(166.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(26.dp),
        colors = CardDefaults.cardColors(containerColor = if (usesCar) SoftOrange else Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(17.dp))
                        .background(if (usesCar) Color.White else SoftBlue),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Default.LocalShipping, contentDescription = null, tint = if (usesCar) Secondary else Primary)
                }
                Spacer(Modifier.weight(1f))
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = LcGreen, modifier = Modifier.size(20.dp))
            }
            Spacer(Modifier.height(14.dp))
            Text(service.name, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, maxLines = 1)
            Text(
                "ETA maks ${service.maxEtaMinutes.takeIf { it > 0 } ?: 120} menit",
                color = Muted,
                fontSize = 13.sp
            )
            Text(
                if (usesCar) "Mobil" else "Motor",
                color = LcGreen,
                fontWeight = FontWeight.ExtraBold,
                fontSize = 12.sp
            )
        }
    }
}

@Composable
private fun TrustCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.padding(18.dp)) {
            Text("Siap bantu kebutuhan harian", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
            Spacer(Modifier.height(12.dp))
            TrustRow(Icons.Default.LocalShipping, "Kurir on-demand", "Request diteruskan ke kurir aktif terdekat.")
            TrustRow(Icons.Default.Map, "Tracking transparan", "Pantau posisi, timeline, chat, dan bukti pengiriman.")
            TrustRow(Icons.Default.VerifiedUser, "Bukti pickup & POD", "Foto dan status tersimpan untuk audit pengiriman.")
            TrustRow(Icons.Default.Shield, "Keamanan transaksi", "Order, pembayaran, dan log pengiriman tercatat.")
        }
    }
}

@Composable
private fun TrustRow(icon: ImageVector, title: String, body: String) {
    Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(17.dp))
                .background(SoftBlue),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = Primary)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Ink, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
            Text(body, color = Muted, fontSize = 13.sp, lineHeight = 18.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icons.Default.ArrowForward, contentDescription = null, tint = Color(0xFFB2BAC6), modifier = Modifier.size(18.dp))
    }
}
