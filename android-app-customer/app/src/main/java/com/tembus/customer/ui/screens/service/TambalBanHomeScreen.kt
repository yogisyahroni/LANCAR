package com.tembus.customer.ui.screens.service

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.platform.LocalContext
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tembus.customer.data.model.NearbyCourier
import com.tembus.customer.data.model.TambalBanServiceProduct
import com.tembus.customer.ui.components.CourierPriceCard
import com.tembus.customer.ui.designsystem.TembusBadge
import com.tembus.customer.ui.designsystem.TembusBadgeTone
import com.tembus.customer.ui.designsystem.TembusCard
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.PrimaryPale
import com.tembus.customer.ui.theme.PrimarySoft
import com.tembus.customer.ui.theme.Warning

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TambalBanHomeScreen(
    onBackClick: () -> Unit,
    onServiceSelected: (String) -> Unit,
    onCourierSelected: (NearbyCourier) -> Unit,
    onSearchClick: (Double, Double) -> Unit,
    viewModel: TambalBanHomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }
    var currentLat by remember { mutableStateOf(0.0) }
    var currentLng by remember { mutableStateOf(0.0) }
    var locationError by remember { mutableStateOf<String?>(null) }
    var selectedVehicle by remember { mutableStateOf<String?>(null) }
    var selectedIssues by remember { mutableStateOf(setOf<String>()) }
    var consentChecked by remember { mutableStateOf(false) }

    fun loadFromCurrentLocation() {
        val hasFineLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasCoarseLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasFineLocation && !hasCoarseLocation) {
            locationError = "Izin lokasi diperlukan untuk menemukan teknisi di sekitar Anda."
            return
        }
        locationError = null
        fusedLocationClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, null)
            .addOnSuccessListener { location ->
                if (location != null) {
                    currentLat = location.latitude
                    currentLng = location.longitude
                    viewModel.loadHome(location.latitude, location.longitude)
                } else {
                    locationError = "Lokasi belum tersedia. Aktifkan GPS lalu coba lagi."
                }
            }
            .addOnFailureListener { locationError = "Lokasi tidak dapat dibaca. Aktifkan GPS lalu coba lagi." }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants[Manifest.permission.ACCESS_FINE_LOCATION] == true || grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true) {
            loadFromCurrentLocation()
        } else {
            locationError = "Izin lokasi diperlukan untuk menemukan teknisi di sekitar Anda."
        }
    }

    LaunchedEffect(Unit) {
        val hasLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (hasLocation) loadFromCurrentLocation() else locationPermissionLauncher.launch(
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        )
    }

    val motorService = uiState.services.firstOrNull { it.code.contains("motor", ignoreCase = true) }
    val mobilService = uiState.services.firstOrNull { it.code.contains("mobil", ignoreCase = true) }
    val selectedService = when (selectedVehicle) {
        "motor" -> motorService
        "mobil" -> mobilService
        else -> null
    }
    val etaLabel = uiState.couriers
        .filter { selectedService == null || it.serviceSubType == selectedService.code }
        .minByOrNull { it.etaMinutes }
        ?.takeIf { it.etaMinutes > 0 }
        ?.let { "Estimasi ${it.etaMinutes} menit" }

    Scaffold(
        containerColor = Color(0xFFF2FCF3),
        topBar = {
            TopAppBar(
                title = { Text("Layanan Darurat", fontWeight = FontWeight.Bold) },
                colors = androidx.compose.material3.TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFFF2FCF3),
                ),
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                }
            )
        },
        bottomBar = {
            Surface(
                color = Color.White,
                shadowElevation = 8.dp,
                modifier = Modifier.navigationBarsPadding(),
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Button(
                        onClick = { selectedService?.let { onServiceSelected(it.code) } },
                        enabled = selectedService != null && consentChecked && !uiState.isLoading,
                        modifier = Modifier.fillMaxWidth(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = OrangeCta,
                            contentColor = com.tembus.customer.ui.theme.OnOrangeCta,
                        ),
                    ) {
                        Text(
                            text = buildString {
                                append("Panggil Teknisi Sekarang")
                                etaLabel?.let { append(" • $it") }
                            },
                            fontWeight = FontWeight.Bold,
                        )
                    }
                    Text(
                        "Quote final dihitung dari lokasi, jenis kendaraan, dan petugas yang tersedia.",
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    )
                }
            }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item { RoadsideSafetyBanner() }

            item {
                LocationPanel(
                    latitude = currentLat,
                    longitude = currentLng,
                    error = locationError,
                    onRetry = {
                        val hasLocation = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
                        if (hasLocation) loadFromCurrentLocation() else locationPermissionLauncher.launch(
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                        )
                    }
                )
            }

            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ServiceModeChip("Tambal Ban", selected = true, onClick = {}, modifier = Modifier.weight(1f))
                    ServiceModeChip("Derek Towing", selected = false, onClick = { onServiceSelected("towing_motor") }, modifier = Modifier.weight(1f))
                }
            }

            item {
                SectionTitle("Pilih Jenis Kendaraan", "WAJIB SESUAI DIMENSI")
                Spacer(Modifier.height(8.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    VehicleOptionCard("Sepeda Motor", "Matic, Bebek, Sport", Icons.Default.TwoWheeler, selectedVehicle == "motor", motorService != null, { selectedVehicle = "motor" }, Modifier.weight(1f))
                    VehicleOptionCard("Mobil Pribadi", "Sedan, SUV, MPV", Icons.Default.DirectionsCar, selectedVehicle == "mobil", mobilService != null, { selectedVehicle = "mobil" }, Modifier.weight(1f))
                }
                if (!uiState.isLoading && motorService == null && mobilService == null) {
                    Spacer(Modifier.height(8.dp))
                    Text("Jenis layanan belum tersedia dari server untuk lokasi ini.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
            }

            item {
                SectionTitle("Detail Masalah", "PILIH YANG SESUAI")
                Text("Bantu teknisi menyiapkan perlengkapan yang tepat.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 3.dp, bottom = 7.dp))
                listOf("Ban bocor / kempes", "Ban sobek", "Ban terkunci", "Kendaraan tidak bisa bergerak").chunked(2).forEach { rowIssues ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        rowIssues.forEach { issue ->
                            FilterChip(
                                selected = issue in selectedIssues,
                                onClick = { selectedIssues = if (issue in selectedIssues) selectedIssues - issue else selectedIssues + issue },
                                label = { Text(issue, maxLines = 2, overflow = TextOverflow.Ellipsis) },
                                leadingIcon = if (issue in selectedIssues) ({ Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }) else null,
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = PrimarySoft, selectedLabelColor = MaterialTheme.colorScheme.primary),
                                modifier = Modifier.weight(1f)
                            )
                        }
                        if (rowIssues.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }

            item {
                TembusCard {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Foto Kondisi & Patokan", fontWeight = FontWeight.Bold)
                                Text("Foto membantu teknisi menemukan kendaraan lebih cepat.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Icon(Icons.Default.PhotoCamera, contentDescription = null, tint = OrangeCta)
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            PhotoPlaceholder("Tambah Foto", Modifier.weight(1f))
                            PhotoPlaceholder("Lokasi Kendaraan", Modifier.weight(1f))
                        }
                        Text("Foto bersifat opsional dan bisa dilengkapi pada detail pesanan.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            if (uiState.isLoading) {
                item { Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            }

            uiState.priceRange?.takeIf { it.max > 0 }?.let { range ->
                item {
                    TembusCard {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("Tarif transparan", fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                                TembusBadge("Dari server", tone = TembusBadgeTone.Success)
                            }
                            Text("Rp ${formatRupiahIdr(range.min)} – Rp ${formatRupiahIdr(range.max)}", fontSize = 21.sp, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.primary)
                            Text("Quote final dihitung ulang berdasarkan layanan, lokasi, jarak, dan petugas yang dipilih.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            if (uiState.couriers.isNotEmpty()) {
                item { SectionTitle("Teknisi Terdekat", "DATA LIVE") }
                items(uiState.couriers.filter { selectedService == null || it.serviceSubType == selectedService.code }.take(3), key = { it.courierId }) { courier ->
                    CourierPriceCard(courier = courier, isSelected = false, onSelect = { onCourierSelected(courier) })
                }
            }

            item {
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(checked = consentChecked, onCheckedChange = { consentChecked = it })
                    Text("Saya memastikan informasi kendaraan dan lokasi sudah sesuai.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
                }
            }

            if (uiState.couriers.isEmpty() && !uiState.isLoading) {
                item {
                    Text("Belum ada teknisi yang tersedia di sekitar lokasi ini. Coba perbarui lokasi atau gunakan pencarian.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { onSearchClick(currentLat, currentLng) }, enabled = currentLat != 0.0 && currentLng != 0.0, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.Build, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Cari teknisi lain")
                    }
                }
            }
        }
    }
}

@Composable
private fun RoadsideSafetyBanner() {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF2E8)), border = BorderStroke(1.dp, OrangeCta.copy(alpha = 0.22f))) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(22.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("BANTUAN CEPAT SIAGA 24 JAM", fontSize = 11.sp, fontWeight = FontWeight.Black, color = OrangeCta)
                Text("Utamakan keselamatan. Menjauh ke area aman dan nyalakan lampu hazard jika kendaraan berhenti di bahu jalan.", fontSize = 12.sp, lineHeight = 17.sp)
            }
        }
    }
}

@Composable
private fun LocationPanel(latitude: Double, longitude: Double, error: String?, onRetry: () -> Unit) {
    TembusCard {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Lokasi Penjemputan", fontWeight = FontWeight.Bold)
                    Text("Lokasi kendaraan saat ini", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Icon(Icons.Default.MyLocation, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(112.dp)
                    .background(Color(0xFFE7F1EA), RoundedCornerShape(14.dp))
                    .border(1.dp, Color(0xFFD2E4D8), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(26.dp))
                    Text(
                        if (latitude != 0.0 && longitude != 0.0) "GPS akurat siap digunakan" else "Peta menunggu lokasi yang valid",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp,
                    )
                    Text(
                        if (latitude != 0.0 && longitude != 0.0) "Lokasi akan dikirim ke server saat order dibuat" else "Aktifkan GPS untuk menemukan teknisi terdekat",
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Row(modifier = Modifier.fillMaxWidth().background(PrimarySoft, RoundedCornerShape(12.dp)).padding(11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (latitude != 0.0 && longitude != 0.0) "GPS aktif" else "Menunggu lokasi GPS", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    if (latitude != 0.0 && longitude != 0.0) Text("${"%.6f".format(latitude)}, ${"%.6f".format(longitude)}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (latitude != 0.0 && longitude != 0.0) TembusBadge("Akurat", tone = TembusBadgeTone.Success)
            }
            error?.let {
                Text(it, fontSize = 12.sp, color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = onRetry, modifier = Modifier.fillMaxWidth()) { Text("Perbarui lokasi") }
            }
        }
    }
}

@Composable
private fun ServiceModeChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(modifier = modifier.clickable(onClick = onClick), shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.primary else Color.White), border = BorderStroke(1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
        Text(label, color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(vertical = 13.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

@Composable
private fun SectionTitle(title: String, action: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = 17.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
        Text(action, fontSize = 9.sp, color = OrangeCta, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun VehicleOptionCard(title: String, subtitle: String, icon: androidx.compose.ui.graphics.vector.ImageVector, selected: Boolean, available: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val borderColor = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
    Card(modifier = modifier.clickable(enabled = available, onClick = onClick), shape = RoundedCornerShape(15.dp), colors = CardDefaults.cardColors(containerColor = if (selected) PrimarySoft else Color.White), border = BorderStroke(if (selected) 2.dp else 1.dp, borderColor)) {
        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Box(modifier = Modifier.size(42.dp).background(if (selected) MaterialTheme.colorScheme.primary else PrimarySoft, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = title, tint = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary)
            }
            Text(title, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(subtitle, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(if (available) "Tersedia" else "Belum tersedia", fontSize = 10.sp, color = if (available) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
        }
    }
}

@Composable
private fun PhotoPlaceholder(label: String, modifier: Modifier = Modifier) {
    Box(modifier = modifier.height(72.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Default.PhotoCamera, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(21.dp))
            Text(label, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ServiceCard(service: TambalBanServiceProduct, onClick: () -> Unit) {
    TembusCard(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Row(modifier = Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(if (service.code.contains("mobil")) Icons.Default.DirectionsCar else Icons.Default.TwoWheeler, contentDescription = service.vehicleLabel, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(service.name.ifBlank { service.vehicleLabel.ifBlank { "Tambal Ban" } }, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("Cek harga sesuai lokasi", fontSize = 13.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Medium)
            }
            Text("Pilih", fontSize = 14.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
        }
    }
}

fun formatRupiahIdr(value: Long): String {
    val s = value.toString()
    val sb = StringBuilder()
    var count = 0
    for (i in s.length - 1 downTo 0) {
        sb.append(s[i])
        count++
        if (count % 3 == 0 && i > 0) sb.append('.')
    }
    return sb.reverse().toString()
}

@Composable
fun RatingBadge(rating: Double, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(Icons.Default.Star, contentDescription = "", tint = Warning, modifier = Modifier.size(14.dp))
        Spacer(Modifier.width(2.dp))
        Text(String.format("%.1f", rating), fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
    }
}
