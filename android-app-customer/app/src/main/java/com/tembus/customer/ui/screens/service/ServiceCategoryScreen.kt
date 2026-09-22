package com.tembus.customer.ui.screens.service

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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.TwoWheeler
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.ui.designsystem.TembusBadge
import com.tembus.customer.ui.designsystem.TembusBadgeTone
import com.tembus.customer.ui.designsystem.TembusButton
import com.tembus.customer.ui.designsystem.TembusButtonVariant
import com.tembus.customer.ui.designsystem.TembusCard
import com.tembus.customer.ui.designsystem.TembusControlState
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.PrimarySoft

/**
 * Towing landing follows the Figma emergency flow. It is deliberately a
 * preparation screen: location, vehicle and final quote remain authoritative
 * in ServiceBookingScreen and are not fabricated here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceCategoryScreen(
    onBackClick: () -> Unit,
    initialPhotos: List<LocalServicePhoto> = emptyList(),
    onCategorySelected: (String, List<LocalServicePhoto>) -> Unit
) {
    var selectedVehicle by remember { mutableStateOf<String?>(null) }
    var selectedConditions by remember { mutableStateOf(setOf<String>()) }
    var servicePhotos by remember { mutableStateOf(initialPhotos) }
    var consentChecked by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = Color(0xFFF2FCF3),
        topBar = {
            TopAppBar(
                title = { Text("Tembus Derek Towing Darurat", fontWeight = FontWeight.Bold, fontSize = 16.sp) },
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
                modifier = Modifier.navigationBarsPadding()
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    TembusButton(
                        text = "Panggil Derek Towing Sekarang",
                        onClick = {
                            // Carry the selected vehicle into the authoritative booking flow.
                            // The next screen owns location, quote and payment state.
                            onCategorySelected(
                                if (selectedVehicle == "motor") "towing_motor" else "towing_mobil",
                                servicePhotos,
                            )
                        },
                        variant = TembusButtonVariant.Primary,
                        state = if (selectedVehicle != null && consentChecked) {
                            TembusControlState.Default
                        } else {
                            TembusControlState.Disabled
                        },
                        modifier = Modifier.fillMaxWidth(),
                        trailingIcon = Icons.AutoMirrored.Filled.ArrowForward
                    )
                    Text(
                        "Terhubung langsung ke Petugas Derek Siaga terdekat",
                        fontSize = 10.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth()
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
            item { TowingSafetyBanner() }
            item { TowingRouteCard() }

            item {
                TowingSectionTitle("Jenis Kendaraan", "WAJIB SESUAI DIMENSI")
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    TowingVehicleCard(
                        title = "Mobil Penumpang",
                        subtitle = "Sedan / SUV / MPV / Van",
                        icon = Icons.Default.DirectionsCar,
                        selected = selectedVehicle == "mobil",
                        onClick = { selectedVehicle = "mobil" },
                        modifier = Modifier.weight(1f)
                    )
                    TowingVehicleCard(
                        title = "Sepeda Motor / Moge",
                        subtitle = "Bebek / Sport / >250cc",
                        icon = Icons.Default.TwoWheeler,
                        selected = selectedVehicle == "motor",
                        onClick = { selectedVehicle = "motor" },
                        modifier = Modifier.weight(1f)
                    )
                }
            }

            item {
                TowingSectionTitle("Kondisi Kendaraan Saat Ini", "UNTUK DRIVER")
                Text(
                    "Bantu tim patrol menyiapkan alat penarik kawat sling / roller tambahan jika roda terkunci.",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp, bottom = 6.dp)
                )
                val conditions = listOf("Roda bisa berputar", "Gigi bisa netral (N)", "Setir kemudi terkunci", "Terjebak parit / salju")
                conditions.chunked(2).forEach { rowConditions ->
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        rowConditions.forEach { condition ->
                            FilterChip(
                                selected = condition in selectedConditions,
                                onClick = { selectedConditions = if (condition in selectedConditions) selectedConditions - condition else selectedConditions + condition },
                                label = { Text(condition, maxLines = 2) },
                                leadingIcon = if (condition in selectedConditions) ({ Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }) else null,
                                colors = FilterChipDefaults.filterChipColors(selectedContainerColor = PrimarySoft, selectedLabelColor = MaterialTheme.colorScheme.primary),
                                modifier = Modifier.weight(1f)
                            )
                        }
                        if (rowConditions.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }

            item {
                ServicePhotoEvidencePicker(
                    isTowing = true,
                    photos = servicePhotos,
                    onPhotosChanged = { servicePhotos = it },
                )
            }

            item {
                TembusCard {
                    Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icons.Default.Security, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("Rute dan quote final", fontWeight = FontWeight.Bold)
                            Text(
                                "Lokasi pickup, tujuan drop-off, petugas, jarak, tol, dan biaya final akan dimuat serta dihitung ulang oleh server pada langkah berikutnya.",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            item {
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(checked = consentChecked, onCheckedChange = { consentChecked = it })
                    Text(
                        "Saya memastikan kondisi kendaraan dan lokasi akan saya konfirmasi kembali sebelum pesanan dibuat.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp)
                    )
                }
            }

            item { Spacer(Modifier.height(110.dp)) }

        }
    }
}

@Composable
private fun TowingSafetyBanner() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF2E8)),
        border = BorderStroke(1.dp, OrangeCta.copy(alpha = 0.22f))
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Icon(Icons.Default.Warning, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(22.dp))
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("PROTOKOL KESELAMATAN TOWING", fontSize = 11.sp, fontWeight = FontWeight.Black, color = OrangeCta)
                Text("Nyalakan hazard dan pasang segitiga pengaman minimal 30 meter dari kendaraan. Jangan berdiri di jalur lalu lintas.", fontSize = 12.sp, lineHeight = 17.sp)
            }
        }
    }
}

@Composable
private fun TowingRouteCard() {
    TembusCard {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Rute evakuasi", fontSize = 17.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
                TembusBadge("Belum dipilih", tone = TembusBadgeTone.Warning)
            }
            RoutePlaceholderRow("Titik penjemputan darurat", "Pilih lokasi kendaraan", Icons.Default.MyLocation)
            RoutePlaceholderRow("Tujuan pengantaran / bengkel", "Pilih tujuan drop-off", Icons.Default.LocationOn)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(118.dp)
                    .background(Color(0xFFE7F1EA), RoundedCornerShape(14.dp))
                    .border(1.dp, Color(0xFFD2E4D8), RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
                    Text("Peta menunggu lokasi yang valid", fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                    Text("Rute akan dihitung ulang oleh server", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text("Alamat dan jarak final akan berasal dari peta serta quote server.", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun RoutePlaceholderRow(label: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Row(modifier = Modifier.fillMaxWidth().background(PrimarySoft, RoundedCornerShape(12.dp)).padding(11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
        Column(Modifier.weight(1f)) {
            Text(label.uppercase(), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Text(value, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
        }
        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
    }
}

@Composable
private fun TowingVehicleCard(title: String, subtitle: String, icon: androidx.compose.ui.graphics.vector.ImageVector, selected: Boolean, onClick: () -> Unit, modifier: Modifier) {
    Card(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(15.dp),
        colors = CardDefaults.cardColors(containerColor = if (selected) MaterialTheme.colorScheme.primary else Color.White),
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(modifier = Modifier.size(42.dp).background(if (selected) MaterialTheme.colorScheme.primary else PrimarySoft, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = title, tint = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.primary)
            }
            Text(title, fontWeight = FontWeight.Bold, fontSize = 13.sp, textAlign = TextAlign.Center, color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
            Text(subtitle, fontSize = 10.sp, color = if (selected) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.78f) else MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            if (selected) TembusBadge("Dipilih", tone = TembusBadgeTone.Success)
        }
    }
}

@Composable
private fun TowingSectionTitle(title: String, action: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(title, fontSize = 17.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
        Text(action, fontSize = 9.sp, color = OrangeCta, fontWeight = FontWeight.Bold)
    }
}
