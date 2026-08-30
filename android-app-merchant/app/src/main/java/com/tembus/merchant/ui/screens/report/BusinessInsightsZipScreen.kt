package com.tembus.merchant.ui.screens.report

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.tembus.merchant.data.model.Merchant
import com.tembus.merchant.data.model.SalesReportSummary
import com.tembus.merchant.ui.Format
import com.tembus.merchant.ui.appViewModel
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale

/** Native, data-backed port of the ZIP BusinessInsights screen. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BusinessInsightsZipScreen(
    onOpenNotifications: () -> Unit,
    onOpenCreatePromo: () -> Unit,
    onOpenCustomerReviews: () -> Unit,
    viewModel: ReportViewModel = appViewModel { ReportViewModel(it.merchantRepository) },
    profileViewModel: com.tembus.merchant.ui.screens.profile.ProfileViewModel = appViewModel {
        com.tembus.merchant.ui.screens.profile.ProfileViewModel(it.merchantRepository, it.authRepository, it.sessionManager)
    }
) {
    val reportState by viewModel.uiState.collectAsState()
    val profileState by profileViewModel.uiState.collectAsState()

    Scaffold(
        containerColor = PrimaryPale,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(32.dp)) {
                            Icon(Icons.Filled.Assessment, contentDescription = null, tint = Primary, modifier = Modifier.padding(7.dp))
                        }
                        Spacer(Modifier.size(8.dp))
                        Text("Tembus Merchant", fontWeight = FontWeight.Bold)
                    }
                },
                actions = {
                    IconButton(onClick = onOpenNotifications) {
                        Icon(Icons.Filled.Notifications, contentDescription = "Notifications")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = PrimaryPale)
            )
        }
    ) { padding ->
        if (reportState.isLoading && reportState.report == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Primary)
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Column {
                        Text("Business Insights", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                        Text("Track your performance and growth.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                item { InsightPeriodSelector(reportState.period, viewModel::selectPeriod) }
                reportState.errorMessage?.let { error ->
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(error, color = MaterialTheme.colorScheme.error)
                            OutlinedButton(onClick = viewModel::load) { Text("Coba Lagi") }
                        }
                    }
                }
                item { RevenueInsightCard(reportState.report) }
                item { OrderCountCard(reportState.report) }
                item { RatingCard(profileState.merchant, onOpenCustomerReviews) }
                item { BoostSalesCard(onOpenCreatePromo) }
                item { Text("Best Selling Items", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
                if (reportState.report?.topItems.isNullOrEmpty()) {
                    item { NoInsightData("Belum ada penjualan pada periode ini.") }
                } else {
                    itemsIndexed(reportState.report!!.topItems.take(5)) { index, item ->
                        BestSellerInsightRow(index + 1, item.itemName, item.quantity, item.revenueIdr)
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
private fun InsightPeriodSelector(period: ReportPeriod, onSelect: (ReportPeriod) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        ReportPeriod.entries.forEach { option ->
            val selected = option == period
            Surface(
                onClick = { onSelect(option) },
                shape = RoundedCornerShape(8.dp),
                color = if (selected) Primary else MaterialTheme.colorScheme.surface,
                contentColor = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                border = if (selected) null else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.weight(1f)
            ) {
                Text(option.label, Modifier.padding(vertical = 10.dp), textAlign = TextAlign.Center)
            }
        }
    }
}

@Composable
private fun RevenueInsightCard(report: SalesReportSummary?) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("TOTAL PENDAPATAN", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(report?.period?.replaceFirstChar { it.uppercase() } ?: "-", style = MaterialTheme.typography.labelMedium)
            }
            Text(Format.rupiah(report?.gmvIdr ?: 0L), style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.TrendingUp, contentDescription = null, tint = Primary, modifier = Modifier.size(16.dp))
                Spacer(Modifier.size(4.dp))
                Text("Dihitung dari pesanan delivered", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            RevenueTrendChart(report?.dailyBreakdown.orEmpty())
        }
    }
}

@Composable
private fun RevenueTrendChart(points: List<com.tembus.merchant.data.model.SalesReportPoint>) {
    if (points.isEmpty()) {
        NoInsightData("Belum ada data tren pendapatan pada periode ini.")
        return
    }
    val lineColor = Primary
    val gridColor = MaterialTheme.colorScheme.outlineVariant
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(modifier = Modifier.fillMaxWidth().height(112.dp)) {
            val maxRevenue = points.maxOf { it.revenueIdr }.coerceAtLeast(1L).toFloat()
            val horizontalPadding = 6.dp.toPx()
            val verticalPadding = 8.dp.toPx()
            val chartWidth = (size.width - horizontalPadding * 2).coerceAtLeast(1f)
            val chartHeight = (size.height - verticalPadding * 2).coerceAtLeast(1f)
            fun point(index: Int): androidx.compose.ui.geometry.Offset {
                val x = if (points.size == 1) size.width / 2f else horizontalPadding + chartWidth * index / (points.lastIndex.toFloat())
                val y = verticalPadding + chartHeight * (1f - points[index].revenueIdr / maxRevenue)
                return androidx.compose.ui.geometry.Offset(x, y)
            }
            drawLine(gridColor, androidx.compose.ui.geometry.Offset(horizontalPadding, size.height - verticalPadding), androidx.compose.ui.geometry.Offset(size.width - horizontalPadding, size.height - verticalPadding), 1.dp.toPx())
            drawLine(gridColor.copy(alpha = 0.45f), androidx.compose.ui.geometry.Offset(horizontalPadding, size.height / 2f), androidx.compose.ui.geometry.Offset(size.width - horizontalPadding, size.height / 2f), 1.dp.toPx())
            val path = Path().apply {
                points.indices.forEach { index ->
                    val p = point(index)
                    if (index == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                }
            }
            drawPath(path, lineColor, style = Stroke(width = 3.dp.toPx()))
            points.indices.forEach { index ->
                val p = point(index)
                drawCircle(lineColor, radius = 4.dp.toPx(), center = p)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            points.map { it.day.takeLast(2) }.forEach { day ->
                Text(day, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun OrderCountCard(report: SalesReportSummary?) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Total Pesanan", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${report?.totalOrders ?: 0}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            }
            Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.size(48.dp)) {
                Icon(Icons.Filled.ShoppingBag, contentDescription = null, tint = Primary, modifier = Modifier.padding(12.dp))
            }
        }
    }
}

@Composable
private fun RatingCard(merchant: Merchant?, onOpen: () -> Unit) {
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(16.dp)
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("Rating Toko", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(if (merchant?.ratingCount ?: 0 > 0) "%.1f".format(java.util.Locale.US, merchant?.avgRating ?: 0.0) else "-", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.size(8.dp))
                    Icon(Icons.Filled.Star, contentDescription = null, tint = Color(0xFFF59E0B), modifier = Modifier.size(20.dp))
                }
            }
            Text("(${merchant?.ratingCount ?: 0} ulasan)", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun BoostSalesCard(onOpenCreatePromo: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Boost Your Sales", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
            Text("Run a promotion this weekend to increase orders.", color = MaterialTheme.colorScheme.onPrimaryContainer)
            Button(onClick = onOpenCreatePromo) { Text("Create Promo") }
        }
    }
}

@Composable
private fun BestSellerInsightRow(rank: Int, name: String, quantity: Int, revenue: Long) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(shape = CircleShape, color = if (rank == 1) MaterialTheme.colorScheme.tertiaryContainer else MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.size(32.dp)) {
                Text("$rank", Modifier.padding(vertical = 7.dp), textAlign = TextAlign.Center, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.size(12.dp))
            Column(Modifier.weight(1f)) {
                Text(name.ifBlank { "Item tidak tersedia" }, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(Format.rupiah(revenue), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("$quantity sold", style = MaterialTheme.typography.labelSmall, color = Primary)
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp).size(16.dp))
        }
    }
}

@Composable
private fun NoInsightData(message: String) {
    Text(message, modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
