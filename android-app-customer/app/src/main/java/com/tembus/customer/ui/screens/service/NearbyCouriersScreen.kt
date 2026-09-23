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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.Surface
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.components.CourierPriceCard
import com.tembus.customer.ui.components.RadarPulseIndicator
import androidx.compose.ui.graphics.Color
import com.tembus.customer.ui.theme.CustomerHomeCanvas
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.OnBrandHeader
import com.tembus.customer.ui.theme.PrimarySoft
import com.tembus.customer.ui.theme.BrandHeader
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyCouriersScreen(
    serviceSubType: String,
    customerLat: Double,
    customerLng: Double,
    onBackClick: () -> Unit,
    onCourierSelected: (String, Long, String, Double) -> Unit,
    viewModel: NearbyCouriersViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedCourierId by rememberSaveable { mutableStateOf<String?>(null) }
    var sortOption by rememberSaveable { mutableStateOf(NearbySortOption.NEAREST) }

    LaunchedEffect(serviceSubType, customerLat, customerLng) {
        var firstLoad = true
        while (isActive) {
            viewModel.loadNearbyCouriersAwait(
                serviceSubType = serviceSubType,
                lat = customerLat,
                lng = customerLng,
                showLoading = firstLoad,
            )
            firstLoad = false
            delay(10_000)
        }
    }

    LaunchedEffect(uiState.couriers) {
        if (selectedCourierId != null && uiState.couriers.none { it.courierId == selectedCourierId }) {
            selectedCourierId = null
        }
    }

    val visibleCouriers = remember(uiState.couriers, sortOption) {
        when (sortOption) {
            NearbySortOption.NEAREST -> uiState.couriers.sortedWith(compareBy({ it.distanceKm }, { it.courierServicePrice }))
            NearbySortOption.CHEAPEST -> uiState.couriers.sortedWith(compareBy({ it.courierServicePrice }, { it.distanceKm }))
            NearbySortOption.FASTEST -> uiState.couriers.sortedWith(compareBy({ it.etaMinutes }, { it.distanceKm }))
            NearbySortOption.RATING -> uiState.couriers.sortedWith(compareByDescending<com.tembus.customer.data.model.NearbyCourier> { it.rating }.thenByDescending { it.ratingCount }.thenBy { it.distanceKm })
        }
    }

    val isTowing = serviceSubType.startsWith("towing")
    Scaffold(
        containerColor = CustomerHomeCanvas,
        topBar = {
            TopAppBar(
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = CustomerHomeCanvas,
                ),
                title = {
                    Text("Pilih penawaran", fontWeight = FontWeight.Bold)
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                }
            )
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.loadNearbyCouriers(serviceSubType, customerLat, customerLng) },
            modifier = Modifier.fillMaxSize()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
            ) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp),
                ) {
                    item {
                        OfferHero(
                            isTowing = isTowing,
                            serviceSubType = serviceSubType,
                            optionCount = uiState.couriers.size,
                            customerLat = customerLat,
                            customerLng = customerLng,
                            searchRadiusKm = uiState.searchRadiusKm,
                            searchRadiiKm = uiState.searchRadiiKm,
                            lastUpdatedAt = uiState.lastUpdatedAt,
                            isRefreshing = uiState.isRefreshing,
                        )
                    }
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Column {
                                Text("Penawaran terdekat", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                                Text("Pilih petugas yang paling sesuai untukmu", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Surface(color = Color.White, shape = RoundedCornerShape(12.dp)) {
                                Text("${uiState.couriers.size} opsi", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = BrandHeader, modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp))
                            }
                        }
                    }
                    item {
                        Row(
                            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            NearbySortOption.entries.forEach { option ->
                                FilterChip(
                                    selected = sortOption == option,
                                    onClick = { sortOption = option },
                                    label = { Text(option.label, fontSize = 12.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = BrandHeader,
                                        selectedLabelColor = Color.White,
                                    ),
                                )
                            }
                        }
                    }
                    uiState.priceRange?.takeIf { it.min > 0 || it.max > 0 }?.let { range ->
                        item {
                            Surface(color = PrimarySoft, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                                Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = BrandHeader, modifier = Modifier.size(18.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text("Rentang harga dari server: Rp ${formatRupiah(range.min)} – Rp ${formatRupiah(range.max)}", fontSize = 12.sp, color = BrandHeader)
                                }
                            }
                        }
                    }
                    when {
                        uiState.isLoading -> item {
                            Box(modifier = Modifier.fillMaxWidth().height(240.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = BrandHeader) }
                        }
                        uiState.error != null -> item {
                            StateCard(message = uiState.error ?: "Terjadi kesalahan saat memuat penawaran", isError = true)
                        }
                        uiState.couriers.isEmpty() -> item {
                            StateCard(message = "Belum ada petugas tersedia di sekitar lokasi layanan ini. Coba tarik untuk memuat ulang.")
                        }
                        else -> items(visibleCouriers, key = { it.courierId }) { courier ->
                            CourierPriceCard(
                                courier = courier,
                                isSelected = courier.courierId == selectedCourierId,
                                onSelect = {
                                    selectedCourierId = courier.courierId
                                    onCourierSelected(courier.courierId, courier.courierServicePrice, courier.courierName, courier.rating)
                                },
                            )
                        }
                    }
                    item {
                        Surface(color = Color.White, shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                                Text("Harga tetap transparan", fontWeight = FontWeight.Bold, color = BrandHeader)
                                Text("Harga jasa berasal dari petugas yang tersedia. Biaya perjalanan dan tol mengikuti perhitungan server pada saat pemesanan.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun OfferHero(
    isTowing: Boolean,
    serviceSubType: String,
    optionCount: Int,
    customerLat: Double,
    customerLng: Double,
    searchRadiusKm: Double?,
    searchRadiiKm: List<Double>,
    lastUpdatedAt: String?,
    isRefreshing: Boolean,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = BrandHeader),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Surface(color = Color(0xFF1B6548), shape = RoundedCornerShape(20.dp)) {
                    Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        RadarPulseIndicator(active = true)
                        Spacer(Modifier.width(6.dp))
                        Text(if (isRefreshing) "Radar sedang memindai" else "Radar siaga aktif", color = Color(0xFFDBF6DF), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Text("${optionCount} petugas", color = OnBrandHeader.copy(alpha = .78f), fontSize = 11.sp)
            }
            Text(if (isTowing) "Pilih petugas derek" else "Pilih petugas montir", color = OnBrandHeader, fontSize = 23.sp, fontWeight = FontWeight.ExtraBold, lineHeight = 27.sp)
            Text("${formatServiceName(serviceSubType)} di sekitar titik layananmu", color = OnBrandHeader.copy(alpha = .78f), fontSize = 13.sp)
            Text(
                searchRadiusLabel(searchRadiusKm, searchRadiiKm),
                color = Color(0xFFBDE9C8),
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Diperbarui ${formatLastUpdated(lastUpdatedAt)} • otomatis setiap 10 detik",
                color = OnBrandHeader.copy(alpha = .68f),
                fontSize = 10.sp,
            )
            Surface(color = Color(0xFF0A4B31), shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFFFFC08A), modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Lokasi layanan", color = OnBrandHeader.copy(alpha = .68f), fontSize = 10.sp)
                        Text("Koordinat dari lokasi yang dipilih", color = OnBrandHeader, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Text("${formatCoordinate(customerLat)}, ${formatCoordinate(customerLng)}", color = Color(0xFFBDE9C8), fontSize = 10.sp)
                }
            }
        }
    }
}

@Composable
private fun StateCard(message: String, isError: Boolean = false) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color.White)) {
        Text(message, modifier = Modifier.padding(18.dp), color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
    }
}

private fun formatServiceName(serviceSubType: String): String {
    return when (serviceSubType) {
        "tambal_ban_motor" -> "Tambal Ban Motor"
        "tambal_ban_mobil" -> "Tambal Ban Mobil"
        "towing_motor" -> "Towing Motor"
        "towing_mobil" -> "Towing Mobil"
        else -> serviceSubType
    }
}

private fun formatRupiah(amount: Long): String {
    return amount.toString().reversed().chunked(3).joinToString(".").reversed()
}

private fun formatCoordinate(value: Double): String = "%.5f".format(java.util.Locale.US, value)

private enum class NearbySortOption(val label: String) {
    NEAREST("Terdekat"),
    CHEAPEST("Termurah"),
    FASTEST("Tercepat"),
    RATING("Rating"),
}

private fun searchRadiusLabel(current: Double?, stages: List<Double>): String {
    if (current == null) return "Menunggu radius pencarian dari server"
    val stageIndex = stages.indexOfFirst { kotlin.math.abs(it - current) < 0.001 }
    val stageText = if (stageIndex >= 0 && stages.isNotEmpty()) " • tahap ${stageIndex + 1}/${stages.size}" else ""
    return "Jangkauan aktif ${formatKm(current)} km$stageText"
}

private fun formatKm(value: Double): String = if (value % 1.0 == 0.0) value.toInt().toString() else "%.1f".format(Locale.US, value)

private fun formatLastUpdated(value: String?): String {
    if (value.isNullOrBlank()) return "menunggu data"
    return runCatching {
        DateTimeFormatter.ofPattern("HH:mm:ss", Locale("id", "ID"))
            .withZone(ZoneId.systemDefault())
            .format(Instant.parse(value))
    }.getOrDefault("baru saja")
}
