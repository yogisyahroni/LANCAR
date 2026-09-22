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
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DirectionsBike
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.model.CourierDetail
import com.tembus.customer.ui.localization.CustomerTextCatalog
import com.tembus.customer.ui.theme.OnOrangeCta
import com.tembus.customer.ui.theme.OrangeCta

private val ProfileCanvas = Color(0xFFF7F8F6)
private val ProfileGreen = Color(0xFF003A20)
private val ProfileGreenText = Color(0xFF07522F)
private val ProfileSoft = Color(0xFFECF6ED)
private val ProfileMuted = Color(0xFF69736C)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CourierDetailScreen(
    courierId: String,
    serviceSubType: String,
    lat: Double,
    lng: Double,
    onBackClick: () -> Unit,
    onBookClick: (String, Long, String, Double) -> Unit,
    viewModel: CourierDetailViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(courierId, serviceSubType) {
        viewModel.loadDetail(courierId, serviceSubType)
    }

    Scaffold(
        containerColor = ProfileCanvas,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Profil ${if (serviceSubType.startsWith("towing")) "Petugas Derek" else "Montir Siaga"}", fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                        if (uiState.detail?.isVerified == true) {
                            Icon(Icons.Default.CheckCircle, contentDescription = "Profil terverifikasi", tint = ProfileGreenText, modifier = Modifier.size(16.dp))
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ProfileCanvas),
            )
        },
    ) { padding ->
        when {
            uiState.isLoading -> Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = ProfileGreenText)
            }
            uiState.error != null -> Box(Modifier.fillMaxSize().padding(padding).padding(24.dp), contentAlignment = Alignment.Center) {
                Text(uiState.error ?: "Profil petugas belum tersedia", color = MaterialTheme.colorScheme.error)
            }
            uiState.detail != null -> CourierProfileContent(
                detail = uiState.detail!!,
                serviceSubType = serviceSubType,
                modifier = Modifier.fillMaxSize().padding(padding),
                onBookClick = onBookClick,
            )
        }
    }
}

@Composable
private fun CourierProfileContent(
    detail: CourierDetail,
    serviceSubType: String,
    modifier: Modifier = Modifier,
    onBookClick: (String, Long, String, Double) -> Unit,
) {
    val vehicleLabel = listOfNotNull(
        detail.vehicleBrand?.takeIf { it.isNotBlank() },
        detail.vehicleModel?.takeIf { it.isNotBlank() },
        detail.vehicleTypeCar?.takeIf { it.isNotBlank() } ?: detail.vehicleType.takeIf { it.isNotBlank() },
    ).joinToString(" ").ifBlank { "Kendaraan belum diisi" }
    val plateLabel = detail.vehiclePlate?.takeIf { it.isNotBlank() }
    val ratingLabel = if (detail.ratingCount > 0 && detail.rating > 0) "${formatOneDecimal(detail.rating)} (${detail.ratingCount}+ ulasan)" else "Belum ada ulasan"

    Column(
        modifier = modifier.verticalScroll(rememberScrollState()).padding(bottom = 112.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(Modifier.fillMaxWidth().padding(horizontal = 16.dp), color = ProfileSoft, shape = RoundedCornerShape(32.dp), shadowElevation = 1.dp) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).clip(CircleShape).background(ProfileGreenText))
                Spacer(Modifier.width(6.dp))
                Text(if (detail.isOnline) "Tersedia seketika • Radius ${detail.radiusMaxKm.coerceAtLeast(0)} km" else "Status petugas sedang offline", color = ProfileGreenText, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                if (detail.tier.isNotBlank()) {
                    Surface(color = Color(0xFFD6F2DD), shape = CircleShape) {
                        Text(detail.tier.replaceFirstChar { it.uppercase() }, color = ProfileGreenText, fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                }
            }
        }

        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(32.dp), elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.Top) {
                    CourierAvatar(detail.courierName, detail.photoUrl)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(detail.courierName.ifBlank { "Petugas TEMBUS" }, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Surface(color = Color(0xFFB8EFC9), shape = CircleShape) {
                            Text(if (detail.isVerified) "MITRA TERVERIFIKASI" else "MITRA TEMBUS", color = Color(0xFF002110), fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
                        }
                        Text(serviceLabel(serviceSubType), fontSize = 12.sp, color = ProfileMuted, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Surface(color = Color(0xFFE6F0E8), shape = CircleShape) {
                            Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                Icon(Icons.Default.Star, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(13.dp))
                                Text(ratingLabel, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }

                if (detail.trainingCount > 0 || detail.verifiedDocumentCount > 0) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (detail.trainingCount > 0) VerifiedPill("Pelatihan operasional terverifikasi", dark = true)
                        if (detail.verifiedDocumentCount > 0) VerifiedPill("Dokumen mitra terverifikasi", dark = false)
                    }
                } else {
                    Surface(color = ProfileSoft, shape = RoundedCornerShape(16.dp)) {
                        Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Security, contentDescription = null, tint = ProfileGreenText, modifier = Modifier.size(18.dp))
                            Text("Sertifikasi tambahan belum tersedia dari server.", fontSize = 12.sp, color = ProfileMuted)
                        }
                    }
                }

                Surface(color = ProfileCanvas, shape = RoundedCornerShape(48.dp)) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(if (serviceSubType.startsWith("towing")) Icons.Default.LocalShipping else Icons.Default.DirectionsBike, contentDescription = null, tint = ProfileGreenText, modifier = Modifier.size(18.dp))
                        Text(vehicleLabel, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        plateLabel?.let { Text("• $it", fontSize = 12.sp, color = ProfileMuted, maxLines = 1) }
                    }
                }

                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                    MetricCard("${detail.etaMinutes.coerceAtLeast(0)} mnt", "Estimasi tiba", OrangeCta, Modifier.weight(1f))
                    MetricCard(if (detail.ontimeRatePct > 0) "${detail.ontimeRatePct}%" else "—", "Tepat waktu", ProfileGreenText, Modifier.weight(1f))
                    MetricCard("${detail.totalDeliveries}", "Order selesai", ProfileGreenText, Modifier.weight(1f))
                }
            }
        }

        Text("Peralatan & kapabilitas layanan", fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp))
        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(24.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                CapabilityRow(Icons.Default.Bolt, serviceLabel(serviceSubType), "Harga dan ketersediaan berasal dari server")
                CapabilityRow(Icons.Default.LocationOn, "Radius layanan ${detail.radiusMaxKm.coerceAtLeast(0)} km", if (detail.distanceKm > 0) "${formatOneDecimal(detail.distanceKm)} km dari lokasi Anda" else "Jarak belum tersedia")
                CapabilityRow(Icons.Default.CheckCircle, "Status operasional", if (detail.isOnline) "Siap menerima permintaan" else "Tidak sedang menerima permintaan")
            }
        }

        Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = ProfileGreen), shape = RoundedCornerShape(24.dp)) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Tarif dari server", color = Color.White, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
                Text(if (detail.courierServicePrice > 0) "Rp ${formatRupiah(detail.courierServicePrice)}" else "Menunggu quote server", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                Text("Biaya perjalanan, tol, dan perubahan kondisi dihitung di quote resmi sebelum pembayaran.", color = Color(0xFFD7E8DB), fontSize = 11.sp)
            }
        }

        if (detail.ratingCount == 0) {
            Surface(Modifier.fillMaxWidth().padding(horizontal = 16.dp), color = Color.White, shape = RoundedCornerShape(24.dp), shadowElevation = 1.dp) {
                Row(Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Star, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(22.dp))
                    Column(Modifier.weight(1f)) {
                        Text("Belum ada ulasan pelanggan", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Text("Ulasan hanya tampil setelah layanan selesai dan tersimpan di server.", fontSize = 11.sp, color = ProfileMuted)
                    }
                }
            }
        }
    }

    Surface(color = Color.White.copy(alpha = 0.96f), shadowElevation = 10.dp, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.padding(vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                SmallAction(Icons.Default.ChatBubbleOutline, "Chat", Modifier.weight(1f))
                SmallAction(Icons.Default.Call, "Telepon", Modifier.weight(1f))
            }
            Button(
                onClick = { onBookClick(detail.courierId, detail.courierServicePrice, detail.courierName, detail.rating) },
                enabled = detail.isOnline && detail.courierServicePrice > 0,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = OrangeCta, contentColor = OnOrangeCta),
            ) {
                Text("Pilih ${detail.courierName.ifBlank { "petugas ini" }} • ${if (detail.courierServicePrice > 0) "Rp ${formatRupiah(detail.courierServicePrice)}" else "Quote server"}", fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun CourierAvatar(name: String, url: String?, modifier: Modifier = Modifier) {
    Box(modifier.size(80.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xFFE0EBE2)), contentAlignment = Alignment.Center) {
        if (!url.isNullOrBlank()) {
            AsyncImage(model = absoluteMediaUrl(url), contentDescription = "Foto $name", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Text(initials(name), color = ProfileGreenText, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun VerifiedPill(label: String, dark: Boolean) {
    Surface(color = if (dark) ProfileGreen else Color(0xFFE0EBE2), shape = CircleShape) {
        Row(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = if (dark) Color.White else ProfileGreenText, modifier = Modifier.size(14.dp))
            Text(label, color = if (dark) Color.White else ProfileGreenText, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun MetricCard(value: String, label: String, valueColor: Color, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, color = ProfileSoft, shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.padding(vertical = 10.dp, horizontal = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, color = valueColor, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(label, color = ProfileMuted, fontSize = 9.sp, maxLines = 2)
        }
    }
}

@Composable
private fun CapabilityRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, detail: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
        Surface(color = ProfileSoft, shape = CircleShape, modifier = Modifier.size(34.dp)) {
            Box(contentAlignment = Alignment.Center) { Icon(icon, contentDescription = null, tint = ProfileGreenText, modifier = Modifier.size(18.dp)) }
        }
        Column(Modifier.weight(1f)) {
            Text(title, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
            Text(detail, fontSize = 11.sp, color = ProfileMuted)
        }
    }
}

@Composable
private fun SmallAction(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, modifier: Modifier = Modifier) {
    Surface(modifier = modifier.height(36.dp), color = Color(0xFFE6F0E8), shape = CircleShape) {
        Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = ProfileGreenText, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(5.dp))
            Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

private fun initials(name: String): String = name.trim().split(Regex("\\s+")).filter { it.isNotBlank() }.take(2).joinToString("") { it.first().uppercase() }.ifBlank { "TM" }

private fun serviceLabel(serviceSubType: String): String = when (serviceSubType) {
    "tambal_ban_motor" -> "Tambal Ban Motor • On-site"
    "tambal_ban_mobil" -> "Tambal Ban Mobil • On-site"
    "towing_motor" -> "Towing Motor • Evakuasi"
    "towing_mobil" -> "Towing Mobil • Evakuasi"
    else -> serviceSubType.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

private fun absoluteMediaUrl(path: String): String {
    if (path.startsWith("http://") || path.startsWith("https://")) return path
    return BuildConfig.BASE_URL.substringBefore("/api/v1").trimEnd('/') + "/" + path.trimStart('/')
}

private fun formatRupiah(amount: Long): String = amount.toString().reversed().chunked(3).joinToString(".").reversed()
private fun formatOneDecimal(value: Double): String = "%.1f".format(java.util.Locale.US, value)
