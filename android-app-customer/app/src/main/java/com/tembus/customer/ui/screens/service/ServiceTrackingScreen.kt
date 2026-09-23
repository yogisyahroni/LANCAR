package com.tembus.customer.ui.screens.service

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Wallet
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.tembus.customer.BuildConfig
import com.tembus.customer.ui.components.ServiceProgressBar
import com.tembus.customer.ui.components.RadarPulseIndicator
import com.tembus.customer.ui.components.TambalBanProgressSteps
import com.tembus.customer.ui.components.TowingProgressSteps
import com.tembus.customer.ui.localization.CustomerTextCatalog
import com.tembus.customer.ui.theme.BrandHeader
import com.tembus.customer.ui.theme.CustomerHomeCanvas
import com.tembus.customer.ui.theme.OnBrandHeader
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.OrangeCta

private val TrackingCanvas = CustomerHomeCanvas
private val TrackingGreen = BrandHeader
private val TrackingSoftGreen = Color(0xFFEAF4ED)
private val TrackingOrangeSoft = Color(0xFFFFF0E4)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceTrackingScreen(
    orderId: String,
    serviceSubType: String,
    onBackClick: () -> Unit,
    onChatClick: (String) -> Unit,
    onCallClick: (String) -> Unit,
    onReportClick: (String) -> Unit = {},
    viewModel: ServiceTrackingViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var isRefreshing by remember { mutableStateOf(false) }

    LaunchedEffect(orderId, serviceSubType) {
        viewModel.startTracking(orderId, serviceSubType)
    }
    LaunchedEffect(uiState.isLoading) {
        if (!uiState.isLoading) isRefreshing = false
    }

    val isTambalBan = serviceSubType.startsWith("tambal_ban")
    val steps = if (isTambalBan) TambalBanProgressSteps.steps else TowingProgressSteps.steps
    val isSearching = !uiState.isTerminal &&
        uiState.courierName.isNullOrBlank() &&
        (uiState.currentStepIndex == 0 || uiState.statusText.orEmpty().contains("mencari", ignoreCase = true))

    Scaffold(
        containerColor = TrackingCanvas,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            uiState.orderNumber?.let { "Order #$it" } ?: "Pelacakan layanan",
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(formatServiceName(serviceSubType), fontSize = 11.sp, color = OnSurfaceVariant)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = TrackingCanvas, scrolledContainerColor = TrackingCanvas),
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                viewModel.startTracking(orderId, serviceSubType)
            },
            modifier = Modifier.fillMaxSize(),
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(TrackingCanvas)
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                TrackingHero(
                    serviceSubType = serviceSubType,
                    statusText = uiState.statusText,
                    etaMinutes = uiState.etaMinutes,
                    isStale = uiState.isStale,
                    isLoading = uiState.isLoading && !uiState.hasSnapshot,
                )

                if (uiState.isLoading && !uiState.hasSnapshot) {
                    LoadingCard()
                } else {
                    if (isSearching) {
                        SearchingServiceCard(isTambalBan = isTambalBan)
                    }
                    ProgressCard(steps = steps, currentStep = uiState.currentStepIndex)
                }

                uiState.courierName?.let { name ->
                    CourierTrackingCard(
                        name = name,
                        photoUrl = uiState.courierPhotoUrl,
                        vehicle = uiState.courierVehicle,
                        plate = uiState.courierPlate,
                        onChatClick = { onChatClick(orderId) },
                        onCallClick = { onCallClick(orderId) },
                    )
                }

                RouteCard(
                    pickupAddress = uiState.pickupAddress,
                    dropoffAddress = uiState.dropoffAddress,
                    distanceMeters = uiState.routeDistanceMeters,
                    durationSeconds = uiState.routeDurationSeconds,
                )

                PaymentCard(
                    totalPriceIdr = uiState.totalPriceIdr,
                    paymentStatus = uiState.paymentStatus,
                    paymentMethod = uiState.paymentMethod,
                )

                if (uiState.isStale && uiState.hasSnapshot) {
                    Surface(color = TrackingOrangeSoft, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "Koneksi terputus. Data di atas adalah status terakhir yang berhasil diterima server.",
                            color = Color(0xFF8A4300),
                            fontSize = 12.sp,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                }

                if (uiState.noSupply) {
                    Surface(color = Color.White, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                        Text(
                            "Belum ada petugas yang dapat menerima layanan di lokasi ini. Coba lagi setelah kondisi berubah atau kembali untuk memilih layanan lain.",
                            color = OnSurfaceVariant,
                            fontSize = 13.sp,
                            modifier = Modifier.padding(14.dp),
                        )
                    }
                }

                uiState.error?.let { error ->
                    Surface(color = Color(0xFFFFECEB), shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(error, color = MaterialTheme.colorScheme.error, fontSize = 13.sp)
                            OutlinedButton(onClick = { viewModel.startTracking(orderId, serviceSubType) }, shape = RoundedCornerShape(12.dp)) {
                                Text("Coba lagi")
                            }
                        }
                    }
                }

                if (uiState.canViewReport) {
                    Button(
                        onClick = { onReportClick(orderId) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(15.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TrackingGreen, contentColor = OnBrandHeader),
                    ) {
                        Text("Lihat status, bukti & bantuan", fontWeight = FontWeight.Bold)
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun SearchingServiceCard(isTambalBan: Boolean) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = TrackingSoftGreen),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.76f)),
                contentAlignment = Alignment.Center,
            ) {
                RadarPulseIndicator(active = true, size = 30.dp, dotSize = 8.dp)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    if (isTambalBan) "Mencari teknisi terdekat" else "Mencari petugas towing terdekat",
                    color = TrackingGreen,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                )
                Text(
                    "Radar aktif — petugas akan tampil setelah menerima order.",
                    color = OnSurfaceVariant,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@Composable
private fun TrackingHero(
    serviceSubType: String,
    statusText: String?,
    etaMinutes: Int?,
    isStale: Boolean,
    isLoading: Boolean,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = TrackingGreen),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("TEMBUS ${if (serviceSubType.startsWith("towing")) "DEREK" else "SIAGA"}", color = Color(0xFFBDE9C8), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text("${if (serviceSubType.startsWith("towing")) "Towing" else "Tambal ban"} sedang diproses", color = OnBrandHeader, fontSize = 20.sp, fontWeight = FontWeight.ExtraBold)
                }
                Surface(color = if (isStale) TrackingOrangeSoft else Color(0xFF1B6548), shape = RoundedCornerShape(20.dp)) {
                    Text(if (isStale) "TERAKHIR" else "LIVE", color = if (isStale) Color(0xFF8A4300) else Color(0xFFDBF6DF), fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp))
                }
            }
            Text(statusText ?: if (isLoading) "Mengambil status terbaru…" else "Status layanan belum tersedia", color = OnBrandHeader.copy(alpha = .82f), fontSize = 13.sp)
            if (isLoading) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = Color(0xFF8DF0A7), trackColor = Color(0xFF1B6548))
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Surface(color = Color(0xFF0A4B31), shape = RoundedCornerShape(12.dp)) {
                        Text(
                            etaMinutes?.takeIf { it >= 0 }?.let { "ETA $it menit" } ?: "ETA menunggu update",
                            color = OnBrandHeader,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                        )
                    }
                    Text("Status dari server", color = OnBrandHeader.copy(alpha = .62f), fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun LoadingCard() {
    Surface(color = Color.White, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 3.dp, color = TrackingGreen)
            Spacer(Modifier.width(10.dp))
            Text("Mengambil status terbaru…", fontSize = 13.sp, color = OnSurfaceVariant)
        }
    }
}

@Composable
private fun ProgressCard(steps: List<String>, currentStep: Int) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Route, contentDescription = null, tint = TrackingGreen, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Perjalanan layanan", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text("${(currentStep + 1).coerceIn(1, steps.size)}/${steps.size}", fontSize = 11.sp, color = OnSurfaceVariant)
            }
            ServiceProgressBar(steps = steps, currentStep = currentStep)
        }
    }
}

@Composable
private fun CourierTrackingCard(
    name: String,
    photoUrl: String?,
    vehicle: String?,
    plate: String?,
    onChatClick: () -> Unit,
    onCallClick: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Petugas terpilih", fontSize = 12.sp, color = OnSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(photoUrl = photoUrl, name = name, size = 56.dp)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(name, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text(vehicle?.takeIf { it.isNotBlank() } ?: "Kendaraan belum terisi", fontSize = 12.sp, color = OnSurfaceVariant)
                    plate?.takeIf { it.isNotBlank() }?.let { Text(it, fontSize = 12.sp, color = TrackingGreen, fontWeight = FontWeight.Bold) }
                }
                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = TrackingGreen, modifier = Modifier.size(22.dp))
            }
            HorizontalDivider(color = Color(0xFFE5EAE6))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onChatClick, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp)) {
                    Icon(Icons.Default.ChatBubbleOutline, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Chat")
                }
                Button(onClick = onCallClick, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), colors = ButtonDefaults.buttonColors(containerColor = TrackingGreen, contentColor = OnBrandHeader)) {
                    Icon(Icons.Default.Phone, contentDescription = null, modifier = Modifier.size(17.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Telepon")
                }
            }
        }
    }
}

@Composable
private fun RouteCard(
    pickupAddress: String?,
    dropoffAddress: String?,
    distanceMeters: Int?,
    durationSeconds: Int?,
) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.LocationOn, contentDescription = null, tint = TrackingGreen, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Rute layanan", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                val routeMeta = listOfNotNull(
                    distanceMeters?.takeIf { it > 0 }?.let { formatDistance(it) },
                    durationSeconds?.takeIf { it > 0 }?.let { formatDuration(it) },
                ).joinToString(" • ")
                if (routeMeta.isNotBlank()) Text(routeMeta, fontSize = 11.sp, color = OnSurfaceVariant)
            }
            AddressRow(label = "Lokasi kendaraan", value = pickupAddress, isStart = true)
            AddressRow(label = "Tujuan layanan", value = dropoffAddress, isStart = false)
        }
    }
}

@Composable
private fun AddressRow(label: String, value: String?, isStart: Boolean) {
    Row(verticalAlignment = Alignment.Top) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(22.dp)) {
            Box(modifier = Modifier.size(10.dp).clip(CircleShape).background(if (isStart) OrangeCta else TrackingGreen))
            if (isStart) Box(modifier = Modifier.width(1.dp).height(28.dp).background(Color(0xFFCBD6CE)))
        }
        Spacer(Modifier.width(8.dp))
        Column(Modifier.weight(1f)) {
            Text(label, fontSize = 10.sp, color = OnSurfaceVariant)
            Text(value?.takeIf { it.isNotBlank() } ?: "Alamat belum tersedia dari server", fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = if (value.isNullOrBlank()) OnSurfaceVariant else MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun PaymentCard(totalPriceIdr: Long?, paymentStatus: String?, paymentMethod: String?) {
    val hasPaymentData = totalPriceIdr != null || !paymentStatus.isNullOrBlank() || !paymentMethod.isNullOrBlank()
    if (!hasPaymentData) return
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Wallet, contentDescription = null, tint = TrackingGreen, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Pembayaran", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                paymentStatus?.takeIf { it.isNotBlank() }?.let { status ->
                    Surface(color = if (status.equals("paid", true) || status.equals("success", true)) Color(0xFFEAF4ED) else TrackingOrangeSoft, shape = RoundedCornerShape(10.dp)) {
                        Text(status.replace('_', ' '), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = TrackingGreen, modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp))
                    }
                }
            }
            totalPriceIdr?.takeIf { it > 0 }?.let { Text("Rp ${formatRupiah(it)}", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = TrackingGreen) }
            paymentMethod?.takeIf { it.isNotBlank() }?.let { Text("Metode: ${it.replace('_', ' ')}", fontSize = 12.sp, color = OnSurfaceVariant) }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Security, contentDescription = null, tint = TrackingGreen, modifier = Modifier.size(15.dp))
                Text("Rincian mengikuti invoice dan status pembayaran dari server", fontSize = 11.sp, color = OnSurfaceVariant)
            }
        }
    }
}

@Composable
private fun Avatar(photoUrl: String?, name: String, size: Dp) {
    val initials = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifBlank { "TM" }
    Box(modifier = Modifier.size(size).clip(CircleShape).background(TrackingSoftGreen), contentAlignment = Alignment.Center) {
        if (!photoUrl.isNullOrBlank()) {
            AsyncImage(model = absoluteMediaUrl(photoUrl), contentDescription = "Foto $name", modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        } else {
            Text(initials, color = TrackingGreen, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
        }
    }
}

private fun absoluteMediaUrl(path: String): String {
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    return BuildConfig.BASE_URL.substringBefore("/api/v1").trimEnd('/') + "/" + path.trimStart('/')
}

private fun formatServiceName(serviceSubType: String): String = when (serviceSubType) {
    "tambal_ban_motor" -> "Tambal Ban Motor"
    "tambal_ban_mobil" -> "Tambal Ban Mobil"
    "towing_motor" -> "Towing Motor"
    "towing_mobil" -> "Towing Mobil"
    else -> serviceSubType.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

private fun formatDistance(meters: Int): String = if (meters >= 1000) "%.1f km".format(java.util.Locale.US, meters / 1000.0) else "$meters m"

private fun formatDuration(seconds: Int): String = if (seconds >= 3600) "${seconds / 3600} jam" else "${(seconds / 60).coerceAtLeast(1)} mnt"

private fun formatRupiah(amount: Long): String = amount.toString().reversed().chunked(3).joinToString(".").reversed()
