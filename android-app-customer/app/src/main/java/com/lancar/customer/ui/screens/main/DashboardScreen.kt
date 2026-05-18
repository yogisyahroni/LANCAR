package com.lancar.customer.ui.screens.main

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.lancar.customer.data.model.DeliveryServiceProduct
import com.lancar.customer.ui.theme.Primary
import com.lancar.customer.ui.theme.Secondary

private val Ink = Color(0xFF17202A)
private val Muted = Color(0xFF657086)
private val LcGreen = Color(0xFF067A46)
private val SoftGreen = Color(0xFFEAF8EF)
private val SoftBlue = Color(0xFFEAF4FF)
private val SoftOrange = Color(0xFFFFF3E8)

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel(),
    onLogout: () -> Unit = {},
    onBookingClick: () -> Unit = {},
    onTrackingClick: (String) -> Unit = {},
    onHistoryClick: () -> Unit = {},
    onProfileClick: () -> Unit = {}
) {
    val customerName by viewModel.customerName.collectAsState()
    val activeOrder by viewModel.activeOrder.collectAsState()
    val services by viewModel.services.collectAsState()

    Scaffold(
        containerColor = Color(0xFFF3F5F8),
        bottomBar = {
            NavigationBar(containerColor = Color.White, tonalElevation = 8.dp) {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Home, "Beranda") },
                    label = { Text("Beranda") },
                    selected = true,
                    onClick = {}
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.History, "Riwayat") },
                    label = { Text("Riwayat") },
                    selected = false,
                    onClick = onHistoryClick
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Person, "Profil") },
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
            contentPadding = PaddingValues(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            item {
                HeroHeader(
                    customerName = customerName ?: "Pelanggan",
                    onLogout = onLogout,
                    onBookingClick = onBookingClick
                )
            }
            activeOrder?.let { order ->
                item {
                    ActiveOrderCard(
                        title = "Order sedang berjalan",
                        subtitle = order.pickupAddress.ifBlank { order.orderId },
                        onClick = { onTrackingClick(order.orderId) }
                    )
                }
            }
            item {
                QuickOrderCard(onBookingClick = onBookingClick)
            }
            item {
                BenefitsCard()
            }
            item {
                ServicesCarousel(services = services, onBookingClick = onBookingClick)
            }
        }
    }
}

@Composable
private fun HeroHeader(
    customerName: String,
    onLogout: () -> Unit,
    onBookingClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(390.dp)
            .background(
                Brush.verticalGradient(
                    listOf(Color(0xFF0A6ED1), Color(0xFF0B8F69), Color(0xFFF3F5F8)),
                    startY = 0f,
                    endY = 900f
                )
            )
            .statusBarsPadding()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 22.dp, vertical = 18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text("LANCAR", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.ExtraBold)
                Text("Kirim instan, pantau real-time.", color = Color.White.copy(alpha = 0.86f), fontSize = 15.sp)
            }
            IconButton(
                onClick = onLogout,
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.14f))
            ) {
                Icon(Icons.Default.Logout, "Keluar", tint = Color.White)
            }
        }

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 22.dp)
                .align(Alignment.Center),
            shape = RoundedCornerShape(28.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(8.dp)
        ) {
            Column(Modifier.padding(22.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Halo, $customerName", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = Ink)
                        Text("Mau kirim paket ke mana hari ini?", color = Muted, fontSize = 15.sp)
                    }
                    Box(
                        modifier = Modifier
                            .size(54.dp)
                            .clip(RoundedCornerShape(18.dp))
                            .background(SoftBlue),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.LocalShipping, null, tint = Primary, modifier = Modifier.size(30.dp))
                    }
                }
                Spacer(Modifier.height(20.dp))
                RouteEntry(onBookingClick = onBookingClick)
            }
        }
    }
}

@Composable
private fun RouteEntry(onBookingClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(22.dp))
            .background(Color(0xFFF7F9FC))
            .clickable { onBookingClick() }
            .padding(16.dp)
    ) {
        RouteLine(Icons.Default.Place, LcGreen, "Ambil paket di", "Lokasi kamu saat ini")
        Spacer(Modifier.height(10.dp))
        RouteLine(Icons.Default.Navigation, Secondary, "Kirim paket ke mana?", "Tambah alamat tujuan")
    }
}

@Composable
private fun RouteLine(icon: ImageVector, color: Color, label: String, value: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(color.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = color)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(label, fontSize = 12.sp, color = Muted)
            Text(value, fontSize = 17.sp, color = Ink, fontWeight = FontWeight.ExtraBold)
        }
        Icon(Icons.Default.KeyboardArrowRight, null, tint = Color(0xFFAAB2C0))
    }
}

@Composable
private fun QuickOrderCard(onBookingClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Row(
            modifier = Modifier.padding(18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Map, null, tint = LcGreen)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Minta lokasi penerima", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
                Text("Bagikan link agar alamat dropoff lebih akurat.", color = Muted, fontSize = 13.sp)
            }
            TextButton(onClick = onBookingClick) { Text("Mulai") }
        }
    }
}

@Composable
private fun ActiveOrderCard(title: String, subtitle: String, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = SoftGreen)
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Navigation, null, tint = LcGreen)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.ExtraBold, color = Ink)
                Text(subtitle, color = Muted, maxLines = 1)
            }
            Text("Lacak", color = LcGreen, fontWeight = FontWeight.ExtraBold)
        }
    }
}

@Composable
private fun BenefitsCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(Modifier.padding(18.dp)) {
            Text("Siap bantu kebutuhan harian", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
            Spacer(Modifier.height(12.dp))
            BenefitRow(Icons.Default.LocalShipping, "Kurir on-demand", "Request diteruskan ke kurir aktif terdekat.")
            BenefitRow(Icons.Default.Map, "Tracking transparan", "Pantau posisi, timeline, chat, dan bukti pengiriman.")
            BenefitRow(Icons.Default.VerifiedUser, "Bukti pickup & POD", "Foto dan status tersimpan untuk audit pengiriman.")
        }
    }
}

@Composable
private fun BenefitRow(icon: ImageVector, title: String, body: String) {
    Row(Modifier.padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(SoftBlue),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = Primary)
        }
        Spacer(Modifier.width(14.dp))
        Column {
            Text(title, fontWeight = FontWeight.ExtraBold, color = Ink)
            Text(body, color = Muted, fontSize = 13.sp, lineHeight = 18.sp)
        }
    }
}

@Composable
private fun ServicesCarousel(
    services: List<DeliveryServiceProduct>,
    onBookingClick: () -> Unit
) {
    Column(Modifier.padding(start = 16.dp)) {
        Text("Layanan LANCAR", fontSize = 21.sp, fontWeight = FontWeight.ExtraBold, color = Ink)
        Text("Pilihan layanan mengikuti pricing admin.", color = Muted, fontSize = 13.sp)
        Spacer(Modifier.height(12.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(end = 16.dp)) {
            items(services.ifEmpty { fallbackServices() }) { service ->
                ServiceCard(service = service, onClick = onBookingClick)
            }
        }
    }
}

@Composable
private fun ServiceCard(service: DeliveryServiceProduct, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .width(220.dp)
            .height(152.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (service.vehicleTypes.contains("car")) SoftOrange else Color.White
        )
    ) {
        Column(Modifier.padding(18.dp)) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (service.vehicleTypes.contains("car")) Color.White else SoftBlue),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.LocalShipping, null, tint = if (service.vehicleTypes.contains("car")) Secondary else Primary)
            }
            Spacer(Modifier.height(12.dp))
            Text(service.name, fontWeight = FontWeight.ExtraBold, color = Ink, maxLines = 1)
            Text(
                "ETA maks ${service.maxEtaMinutes.takeIf { it > 0 } ?: 120} menit",
                color = Muted,
                fontSize = 13.sp
            )
        }
    }
}

private fun fallbackServices(): List<DeliveryServiceProduct> = listOf(
    DeliveryServiceProduct(code = "lancar_instant", name = "LANCAR Instant", maxEtaMinutes = 240, vehicleTypes = listOf("motor")),
    DeliveryServiceProduct(code = "lancar_prioritas", name = "LANCAR Prioritas", maxEtaMinutes = 120, vehicleTypes = listOf("motor")),
    DeliveryServiceProduct(code = "lancar_mobil", name = "LANCAR Mobil", maxEtaMinutes = 240, vehicleTypes = listOf("car"))
)
