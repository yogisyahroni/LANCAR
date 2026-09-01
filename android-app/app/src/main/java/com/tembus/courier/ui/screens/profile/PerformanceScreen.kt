package com.tembus.courier.ui.screens.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.data.model.CourierPerformanceStats
import com.tembus.courier.data.model.CourierRatingComment
import com.tembus.courier.data.model.CourierTipsSummary
import androidx.compose.material.icons.filled.VolunteerActivism

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PerformanceScreen(
    viewModel: PerformanceViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Performa Saya", fontWeight = FontWeight.SemiBold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(MaterialTheme.colorScheme.background)
        ) {
            when (val state = uiState) {
                is PerformanceUiState.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
                }
                is PerformanceUiState.Error -> {
                    Column(
                        modifier = Modifier.align(Alignment.Center),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(text = state.message, color = MaterialTheme.colorScheme.error)
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(onClick = { viewModel.fetchPerformanceStats() }) {
                            Text("Coba Lagi")
                        }
                    }
                }
                is PerformanceUiState.Success -> {
                    PerformanceContent(stats = state.stats, tipSummary = state.tipSummary)
                }
            }
        }
    }
}

@Composable
fun PerformanceContent(stats: CourierPerformanceStats, tipSummary: CourierTipsSummary? = null) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // FB-077: card rekap tip dari customer (kalau ada data)
        if (tipSummary != null && tipSummary.totalAmountIdr > 0) {
            TipSummaryCard(tipSummary = tipSummary)
            Spacer(modifier = Modifier.height(24.dp))
        }
        // Tier Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Tier Anda Saat Ini",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                val tierColor = when(stats.tier.uppercase()) {
                    "GOD_MODE" -> Color(0xFFFFD700) // Gold
                    "GOLD" -> Color(0xFFFFC107) // Amber
                    "SILVER" -> Color(0xFFC0C0C0) // Silver
                    else -> MaterialTheme.colorScheme.primary
                }

                Text(
                    text = stats.tier.uppercase(),
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    color = tierColor
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Metrics Grid
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            MetricCard(
                modifier = Modifier.weight(1f),
                title = "Rating Rata-rata",
                value = String.format("%.1f", stats.avgPartnerRating),
                icon = {
                    Icon(
                        imageVector = Icons.Default.Star,
                        contentDescription = CourierTextCatalog.translate("Rating"),
                        tint = Color(0xFFFFC107)
                    )
                }
            )
            MetricCard(
                modifier = Modifier.weight(1f),
                title = "Total Pengiriman",
                value = stats.totalDeliveries.toString()
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            MetricCard(
                modifier = Modifier.weight(1f),
                title = "Dokumen Lengkap",
                value = String.format("%.0f%%", stats.docsCompletePct)
            )
            MetricCard(
                modifier = Modifier.weight(1f),
                title = "Skor Relay",
                value = String.format("%.1f", stats.relayScore)
            )
        }

        // FB-116: feedback rating terbaru dari customer (dengan komentar)
        if (stats.recentRatings.isNotEmpty()) {
            Spacer(modifier = Modifier.height(24.dp))
            RecentRatingsSection(ratings = stats.recentRatings)
        }
    }
}

@Composable
private fun RecentRatingsSection(ratings: List<CourierRatingComment>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Feedback Rating Terbaru",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Komentar dari customer yang sudah kamu antar",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(12.dp))
            ratings.forEach { rating ->
                Row(verticalAlignment = Alignment.Top) {
                    // Bintang rating (dipakai full star per rating)
                    Text(
                        text = "★".repeat(rating.stars.coerceIn(1, 5)),
                        style = MaterialTheme.typography.titleSmall,
                        color = Color(0xFFFFC107)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = rating.comment,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        rating.createdAt.takeIf { it.isNotBlank() }?.let { date ->
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = date.take(10),
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(10.dp))
            }
        }
    }
}

@Composable
fun MetricCard(
    modifier: Modifier = Modifier,
    title: String,
    value: String,
    icon: @Composable (() -> Unit)? = null
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.Start
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                icon?.invoke()
                if (icon != null) {
                    Spacer(modifier = Modifier.width(4.dp))
                }
                Text(
                    text = value,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

/** FB-077: card rekap tip dari customer — total + hari ini. */
@Composable
fun TipSummaryCard(tipSummary: CourierTipsSummary) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFEAF7EC))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.VolunteerActivism,
                    contentDescription = null,
                    tint = Color(0xFF7BC043),
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Tip dari Customer",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF1A1A1A)
                )
            }
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Column {
                    Text(
                        text = "Total",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                    Text(
                        text = formatTipRupiah(tipSummary.totalAmountIdr),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF1A1A1A)
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "Hari Ini",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
                    )
                    Text(
                        text = formatTipRupiah(tipSummary.todayAmountIdr),
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFF7BC043)
                    )
                }
            }
        }
    }
}

/** Format angka ke rupiah: 15000 → "Rp15.000". */
private fun formatTipRupiah(value: Long): String {
    val s = value.toString()
    val formatted = s.reversed().chunked(3).joinToString(".").reversed()
    return "Rp$formatted"
}
