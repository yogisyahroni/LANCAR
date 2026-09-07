package com.tembus.customer.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.LoyaltyInfo
import com.tembus.customer.ui.theme.Primary

// C9: Loyalty / membership tier screen
@Composable
fun LoyaltyScreen(
    onBack: () -> Unit,
    viewModel: LoyaltyViewModel = hiltViewModel()
) {
    val info by viewModel.loyaltyInfo.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val membership by viewModel.membership.collectAsState()
    val membershipPlans by viewModel.membershipPlans.collectAsState()

    LaunchedEffect(Unit) { viewModel.loadLoyaltyInfo(); viewModel.loadFoodMembership() }

    Scaffold(
        containerColor = Color(0xFFF7F8FA),
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .background(Color.White)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"), tint = Primary)
                }
                Text("Keanggotaan & Loyalty", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                loading && info == null -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Primary)
                    }
                }
                error != null && info == null -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Gagal memuat loyalty", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            TextButton(onClick = { viewModel.loadLoyaltyInfo() }) { Text("Coba lagi", color = Primary) }
                        }
                    }
                }
                else -> {
                    info?.let { LoyaltyContent(it, membership, membershipPlans, viewModel::subscribeFoodMembership) }
                }
            }
        }
    }
}

@Composable
private fun LoyaltyContent(
    info: LoyaltyInfo,
    membership: com.tembus.customer.data.model.FoodMembershipEntitlement?,
    membershipPlans: List<com.tembus.customer.data.model.FoodMembershipPlan>,
    onSubscribe: (String) -> Unit
) {
    val tierColor = when (info.tier) {
        "Gold" -> Color(0xFFD4AF37)
        "Silver" -> Color(0xFF9CA3AF)
        else -> Color(0xFFB45309)
    }
    val gradient = Brush.verticalGradient(
        colors = listOf(tierColor, tierColor.copy(alpha = 0.7f))
    )

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Tier Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.Transparent)
        ) {
            Box(
                modifier = Modifier.fillMaxWidth().background(gradient).padding(24.dp)
            ) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Star, contentDescription = "", tint = Color.White, modifier = Modifier.size(28.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(
                            "Member ${info.tier}",
                            fontSize = 24.sp, fontWeight = FontWeight.Black, color = Color.White
                        )
                    }
                    Spacer(Modifier.height(6.dp))
                    Text(
                        if (info.discountPct > 0) "Diskon ${info.discountPct}% untuk semua layanan" else "Selesaikan lebih banyak order untuk naik tier",
                        fontSize = 14.sp, color = Color.White.copy(alpha = 0.9f)
                    )
                    Spacer(Modifier.height(16.dp))
                    Row {
                        TierStat(label = "Order/bulan", value = info.monthlyOrders.toString())
                        Spacer(Modifier.width(16.dp))
                        TierStat(label = "Benefit", value = if (info.discountPct > 0) "-${info.discountPct}%" else "Dasar")
                    }
                }
            }
        }

        // Progress to next tier
        if (info.nextTier != null) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                elevation = CardDefaults.cardElevation(1.dp)
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(
                        "Progress ke ${info.nextTier}",
                        fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Tinggal ${info.ordersToNextTier} order lagi untuk mencapai ${info.nextTier} (diskon ${info.nextTierDiscountPct}%)",
                        fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(10.dp))
                    LinearProgressIndicator(
                        progress = info.progressPct / 100f,
                        modifier = Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)),
                        color = tierColor,
                        trackColor = Color(0xFFE5E7EB)
                    )
                    Spacer(Modifier.height(6.dp))
                    Text("${info.progressPct}%", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.End, modifier = Modifier.fillMaxWidth())
                }
            }
        } else {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFECFDF5)),
                elevation = CardDefaults.cardElevation(0.dp)
            ) {
                Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, contentDescription = "", tint = Color(0xFF16A34A), modifier = Modifier.size(22.dp))
                    Spacer(Modifier.width(10.dp))
                    Text("Kamu sudah di tier tertinggi! Nikmati semua benefit.", fontSize = 14.sp, color = Color(0xFF166534), fontWeight = FontWeight.SemiBold)
                }
            }
        }

        // Benefits
        Text("Benefit Keanggotaan", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
        info.benefits.forEach { benefit ->
            Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.CheckCircle, contentDescription = "", tint = Primary, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(10.dp))
                Text(benefit, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface)
            }
        }

        Spacer(Modifier.height(8.dp))
        Text(
            "Tier dihitung dari jumlah order selesai dalam 30 hari terakhir.",
            fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Food Member", fontSize = 17.sp, fontWeight = FontWeight.Bold, color = Primary)
                when {
                    membership?.status == "active" -> Text("Aktif • sisa subsidi ongkir Rp ${membership.freeDeliveryRemainingIdr}", color = Color(0xFF166534))
                    membership?.status == "pending_payment" -> Text("Menunggu konfirmasi pembayaran membership", color = Color(0xFF92400E))
                    membershipPlans.isEmpty() -> Text("Paket membership belum tersedia", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    else -> {
                        val plan = membershipPlans.first()
                        Text("${plan.name} • Rp ${plan.monthlyFeeIdr}/bulan", fontWeight = FontWeight.SemiBold)
                        Text("Gratis ongkir sampai Rp ${plan.freeDeliveryCapIdr} per periode, minimum order Rp ${plan.minimumSubtotalIdr}.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Button(onClick = { onSubscribe(plan.id) }, modifier = Modifier.fillMaxWidth()) { Text("Daftar Food Member") }
                    }
                }
            }
        }
    }
}

@Composable
private fun TierStat(label: String, value: String) {
    Column {
        Text(value, fontSize = 22.sp, fontWeight = FontWeight.Black, color = Color.White)
        Text(label, fontSize = 12.sp, color = Color.White.copy(alpha = 0.85f))
    }
}
