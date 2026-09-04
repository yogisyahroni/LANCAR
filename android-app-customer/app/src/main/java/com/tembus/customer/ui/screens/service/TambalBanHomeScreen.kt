package com.tembus.customer.ui.screens.service

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.tembus.customer.data.model.NearbyCourier
import com.tembus.customer.data.model.TambalBanServiceProduct
import com.tembus.customer.ui.components.CourierPriceCard
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.Warning

// Brand color tambal ban (design Stitch): cyan #00AED6 → #008EB0
private val CyanGradient = Brush.linearGradient(
    listOf(Color(0xFF00AED6), Color(0xFF008EB0))
)

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

    fun loadFromCurrentLocation() {
        val hasFineLocation = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val hasCoarseLocation = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
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
            .addOnFailureListener {
                locationError = "Lokasi tidak dapat dibaca. Aktifkan GPS lalu coba lagi."
            }
    }
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        ) {
            loadFromCurrentLocation()
        } else {
            locationError = "Izin lokasi diperlukan untuk menemukan teknisi di sekitar Anda."
        }
    }

    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            locationPermissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            )
            return@LaunchedEffect
        }
        loadFromCurrentLocation()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Tambal Ban", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ===== HERO (design Stitch: gradasi cyan) =====
            item {
                Card(
                    shape = RoundedCornerShape(TembusRadius.Card),
                    colors = CardDefaults.cardColors(containerColor = Color.Transparent),
                    elevation = CardDefaults.cardElevation(0.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(CyanGradient, RoundedCornerShape(TembusRadius.Card))
                            .padding(20.dp)
                    ) {
                        Column {
                            Text(
                                "Tambal Ban di Lokasimu",
                                fontSize = 22.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "Teknisi datang ±15-30 menit • Buka 24 jam",
                                fontSize = 13.sp,
                                color = Color.White.copy(alpha = 0.9f)
                            )
                            Spacer(Modifier.height(12.dp))
                            // Search bar
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color.White, RoundedCornerShape(TembusRadius.Input))
                                    .clickable(enabled = currentLat != 0.0 && currentLng != 0.0) {
                                        onSearchClick(currentLat, currentLng)
                                    }
                                    .padding(horizontal = 12.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    Icons.Default.Search,
                                    contentDescription = CustomerTextCatalog.translate("Cari"),
                                    tint = Color(0xFF008EB0),
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    "Cari teknisi atau layanan...",
                                    fontSize = 14.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }

            // ===== LAYANAN (dari DB: tambal_ban_motor/mobil) =====
            item {
                Text("Layanan Populer", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
            locationError?.let { message ->
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(message, color = MaterialTheme.colorScheme.error)
                        androidx.compose.material3.OutlinedButton(
                            onClick = {
                                if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                                    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
                                ) {
                                    locationPermissionLauncher.launch(
                                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                                    )
                                } else {
                                    loadFromCurrentLocation()
                                }
                            }
                        ) { Text("Coba lagi") }
                    }
                }
            }
            if (uiState.isLoading) {
                item {
                    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
            } else {
                items(uiState.services) { service ->
                    ServiceCard(service = service, onClick = { onServiceSelected(service.code) })
                }
            }

            // ===== ESTIMASI HARGA =====
            uiState.priceRange?.let { range ->
                if (range.max > 0) {
                    item {
                        Card(
                            shape = RoundedCornerShape(TembusRadius.Card),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFE0F7FA))
                        ) {
                            Text(
                                "💡 Harga jasa petugas: Rp ${formatRupiahIdr(range.min)} - Rp ${formatRupiahIdr(range.max)}",
                                fontSize = 13.sp,
                                modifier = Modifier.padding(16.dp),
                                color = Color(0xFF00697A)
                            )
                        }
                    }
                }
            }

            // ===== TEKNISI TERDEKAT (data real) =====
            item {
                Text("Teknisi Terdekat", fontSize = 18.sp, fontWeight = FontWeight.Bold)
            }
            if (uiState.couriers.isEmpty() && !uiState.isLoading) {
                item {
                    Text(
                        "Tidak ada teknisi tersedia di sekitar Anda",
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                }
            } else {
                items(uiState.couriers) { courier ->
                    CourierPriceCard(
                        courier = courier,
                        isSelected = false,
                        onSelect = { onCourierSelected(courier) }
                    )
                }
            }

            if (uiState.towingAlternatives.isNotEmpty()) {
                item {
                    Text("Alternatif towing terdekat", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text(
                        "Petugas towing live dari lokasi GPS Anda jika layanan tambal ban tidak sesuai.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                items(uiState.towingAlternatives) { courier ->
                    CourierPriceCard(
                        courier = courier,
                        isSelected = false,
                        onSelect = { onCourierSelected(courier) }
                    )
                }
            }

            item { Spacer(Modifier.height(8.dp)) }
        }
    }
}

@Composable
private fun ServiceCard(
    service: TambalBanServiceProduct,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .background(Color(0xFFE0F7FA), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    if (service.code.contains("mobil")) Icons.Default.DirectionsCar else Icons.Default.TwoWheeler,
                    contentDescription = "",
                    tint = Color(0xFF008EB0),
                    modifier = Modifier.size(26.dp)
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    if (service.code.contains("mobil")) "Tambal Ban Mobil" else "Tambal Ban Motor",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    "Mulai Rp ${formatRupiahIdr(service.baseFareIdr)} + Rp ${formatRupiahIdr(service.perKmIdr)}/km",
                    fontSize = 13.sp,
                    color = Color(0xFF008EB0),
                    fontWeight = FontWeight.Medium
                )
            }
            Text("Pesan ›", fontSize = 14.sp, color = Color(0xFF008EB0), fontWeight = FontWeight.Bold)
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

// Helper rating display (reuse di detail teknisi)
@Composable
fun RatingBadge(rating: Double, modifier: Modifier = Modifier) {
    Row(modifier = modifier, verticalAlignment = Alignment.CenterVertically) {
        Icon(
            Icons.Default.Star,
            contentDescription = "",
            tint = Warning,
            modifier = Modifier.size(14.dp)
        )
        Spacer(Modifier.width(2.dp))
        Text(
            String.format("%.1f", rating),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}
