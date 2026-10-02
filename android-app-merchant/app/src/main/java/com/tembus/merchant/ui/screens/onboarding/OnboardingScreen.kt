package com.tembus.merchant.ui.screens.onboarding

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.ShowChart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text as MaterialText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.merchant.R
import com.tembus.merchant.ui.localization.MerchantText as Text
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.AccentSoft
import com.tembus.merchant.ui.theme.Background
import com.tembus.merchant.ui.theme.OnBackground
import com.tembus.merchant.ui.theme.OnSurfaceSecondary
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryPale
import com.tembus.merchant.ui.theme.PrimarySoft
import kotlinx.coroutines.launch

/**
 * Post-login merchant onboarding. The copy is educational static content;
 * business/order data is intentionally not fabricated here. The completion
 * flag remains persisted by OnboardingPreferences in AppNavHost.
 */
private enum class OnboardingVisual {
    ORDERS,
    MENU,
    INSIGHTS,
}

private data class OnboardingItem(
    val title: String,
    val highlightedTitle: String,
    val description: String,
    val visual: OnboardingVisual,
)

private val items = listOf(
    OnboardingItem(
        title = "Terima dan proses pesanan ",
        highlightedTitle = "lebih cepat",
        description = "Pantau order masuk, atur waktu persiapan, dan respons pelanggan dari satu tempat.",
        visual = OnboardingVisual.ORDERS,
    ),
    OnboardingItem(
        title = "Menu lebih rapi, ",
        highlightedTitle = "bisnis makin maju",
        description = "Ubah harga, atur ketersediaan, dan update varian kapan saja, langsung dari aplikasi.",
        visual = OnboardingVisual.MENU,
    ),
    OnboardingItem(
        title = "Insight lengkap untuk ",
        highlightedTitle = "keputusan lebih baik",
        description = "Semua data penjualan, produk, dan pelanggan dalam satu tempat.",
        visual = OnboardingVisual.INSIGHTS,
    ),
)

@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
    val pagerState = rememberPagerState(pageCount = { items.size })
    val scope = rememberCoroutineScope()
    val isLastPage = pagerState.currentPage == items.lastIndex

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = Background,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 18.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Image(
                    painter = painterResource(id = R.drawable.tembus_login_logo),
                    contentDescription = "Logo TEMBUS Merchant",
                    modifier = Modifier.width(104.dp),
                    contentScale = ContentScale.Fit,
                )
                TextButton(onClick = onFinish) {
                    Text(
                        text = "Lewati",
                        color = OnSurfaceSecondary,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            HorizontalPager(
                state = pagerState,
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
            ) { page ->
                OnboardingPage(item = items[page])
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp, bottom = 14.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                repeat(items.size) { index ->
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 4.dp)
                            .size(if (pagerState.currentPage == index) 9.dp else 7.dp)
                            .background(
                                color = if (pagerState.currentPage == index) Accent else PrimarySoft,
                                shape = CircleShape,
                            ),
                    )
                }
            }

            Button(
                onClick = {
                    if (isLastPage) {
                        onFinish()
                    } else {
                        scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
                    }
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Accent,
                    contentColor = Color.White,
                ),
            ) {
                if (isLastPage) {
                    Icon(Icons.Filled.Check, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Mulai kelola toko")
                } else {
                    Text("Lanjut")
                }
            }
        }
    }
}

@Composable
private fun OnboardingPage(item: OnboardingItem) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(top = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        MaterialText(
            text = buildTitle(item),
            modifier = Modifier.fillMaxWidth(),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
            color = OnBackground,
            textAlign = TextAlign.Center,
            lineHeight = 34.sp,
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = item.description,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            color = OnSurfaceSecondary,
            fontSize = 15.sp,
            lineHeight = 22.sp,
            textAlign = TextAlign.Center,
        )

        Spacer(modifier = Modifier.height(18.dp))

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
            contentAlignment = Alignment.Center,
        ) {
            OnboardingIllustration(item.visual)
        }
    }
}

private fun buildTitle(item: OnboardingItem): AnnotatedString = buildAnnotatedString {
    append(item.title)
    pushStyle(SpanStyle(color = Accent))
    append(item.highlightedTitle)
    pop()
}

@Composable
private fun OnboardingIllustration(visual: OnboardingVisual) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(300.dp),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val width = size.width
            val height = size.height

            drawCircle(
                color = Color(0xFFE8F4C6),
                radius = width * 0.45f,
                center = Offset(width * 0.12f, height * 1.20f),
            )
            drawCircle(
                color = Color(0xFFF1F7D9),
                radius = width * 0.40f,
                center = Offset(width * 0.95f, height * 0.98f),
            )

            val hill = Path().apply {
                moveTo(0f, height * 0.86f)
                cubicTo(width * 0.24f, height * 0.70f, width * 0.38f, height * 0.96f, width * 0.60f, height * 0.78f)
                cubicTo(width * 0.78f, height * 0.64f, width * 0.92f, height * 0.84f, width, height * 0.70f)
                lineTo(width, height)
                lineTo(0f, height)
                close()
            }
            drawPath(path = hill, color = Color(0xFFDDEDBA))

            drawCircle(
                color = Accent,
                radius = 5.dp.toPx(),
                center = Offset(width * 0.12f, height * 0.30f),
            )
            drawLine(
                color = Primary,
                start = Offset(width * 0.80f, height * 0.24f),
                end = Offset(width * 0.88f, height * 0.19f),
                strokeWidth = 3.dp.toPx(),
                cap = StrokeCap.Round,
            )
            drawLine(
                color = Accent,
                start = Offset(width * 0.86f, height * 0.19f),
                end = Offset(width * 0.91f, height * 0.24f),
                strokeWidth = 3.dp.toPx(),
                cap = StrokeCap.Round,
            )
        }

        MerchantPhonePreview(visual = visual)
    }
}

@Composable
private fun MerchantPhonePreview(visual: OnboardingVisual) {
    Surface(
        modifier = Modifier
            .width(206.dp)
            .height(268.dp),
        shape = RoundedCornerShape(28.dp),
        color = Color.White,
        shadowElevation = 10.dp,
        tonalElevation = 2.dp,
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .border(3.dp, Color(0xFF16221B), RoundedCornerShape(28.dp))
                .padding(horizontal = 13.dp, vertical = 11.dp),
        ) {
            Box(
                modifier = Modifier
                    .align(Alignment.CenterHorizontally)
                    .width(58.dp)
                    .height(7.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF16221B)),
            )
            Spacer(modifier = Modifier.height(13.dp))
            when (visual) {
                OnboardingVisual.ORDERS -> OrdersPreview()
                OnboardingVisual.MENU -> MenuPreview()
                OnboardingVisual.INSIGHTS -> InsightsPreview()
            }
        }
    }
}

@Composable
private fun OrdersPreview() {
    PreviewHeader(icon = Icons.Filled.Inventory2, title = "Pesanan", action = "Baru")
    Spacer(modifier = Modifier.height(10.dp))
    PreviewOrderRow(label = "Pesanan masuk", status = "Perlu diproses", color = AccentSoft)
    Spacer(modifier = Modifier.height(7.dp))
    PreviewOrderRow(label = "Sedang disiapkan", status = "Siap diantar", color = PrimarySoft)
    Spacer(modifier = Modifier.height(12.dp))
    Text("Atur waktu persiapan", fontSize = 10.sp, color = OnSurfaceSecondary)
    Spacer(modifier = Modifier.height(6.dp))
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(9.dp)
            .clip(RoundedCornerShape(8.dp))
            .background(PrimarySoft),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(0.68f)
                .fillMaxSize()
                .clip(RoundedCornerShape(8.dp))
                .background(Primary),
        )
    }
}

@Composable
private fun MenuPreview() {
    PreviewHeader(icon = Icons.Filled.MenuBook, title = "Menu", action = "+ Tambah")
    Spacer(modifier = Modifier.height(9.dp))
    PreviewSearch()
    Spacer(modifier = Modifier.height(9.dp))
    PreviewMenuRow("Menu utama", "Tersedia", PrimarySoft)
    PreviewMenuRow("Minuman", "Tersedia", PrimarySoft)
    PreviewMenuRow("Camilan", "Stok habis", AccentSoft)
}

@Composable
private fun InsightsPreview() {
    PreviewHeader(icon = Icons.Filled.ShowChart, title = "Insight", action = "7 hari")
    Spacer(modifier = Modifier.height(12.dp))
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = PrimaryPale,
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            Text("Pendapatan", fontSize = 10.sp, color = OnSurfaceSecondary)
            Text("Ringkasan performa", fontSize = 15.sp, fontWeight = FontWeight.Bold, color = OnBackground)
            Spacer(modifier = Modifier.height(12.dp))
            Canvas(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp),
            ) {
                val points = listOf(
                    Offset(0f, size.height * .72f),
                    Offset(size.width * .22f, size.height * .48f),
                    Offset(size.width * .44f, size.height * .60f),
                    Offset(size.width * .68f, size.height * .22f),
                    Offset(size.width, size.height * .38f),
                )
                for (index in 0 until points.lastIndex) {
                    drawLine(
                        color = Primary,
                        start = points[index],
                        end = points[index + 1],
                        strokeWidth = 4.dp.toPx(),
                        cap = StrokeCap.Round,
                    )
                }
                points.forEach { point -> drawCircle(Primary, 4.dp.toPx(), point) }
            }
        }
    }
    Spacer(modifier = Modifier.height(10.dp))
    PreviewMetricRow("Pesanan selesai", "Lihat detail")
    PreviewMetricRow("Pencairan dana", "Pantau status")
}

@Composable
private fun PreviewHeader(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    action: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(7.dp))
            Text(title, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = OnBackground)
        }
        Text(action, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = Accent)
    }
}

@Composable
private fun PreviewOrderRow(label: String, status: String, color: Color) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = color,
    ) {
        Column(modifier = Modifier.padding(9.dp)) {
            Text(label, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = OnBackground)
            Text(status, fontSize = 9.sp, color = OnSurfaceSecondary)
        }
    }
}

@Composable
private fun PreviewSearch() {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .height(28.dp),
        shape = RoundedCornerShape(8.dp),
        color = Color(0xFFF4F6F4),
    ) {
        Text("Cari menu atau kategori...", modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp), fontSize = 8.sp, color = OnSurfaceSecondary)
    }
}

@Composable
private fun PreviewMenuRow(label: String, status: String, color: Color) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFFE6ECE8)),
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(label, fontSize = 10.sp, fontWeight = FontWeight.SemiBold, color = OnBackground)
            Text("Atur ketersediaan", fontSize = 8.sp, color = OnSurfaceSecondary)
        }
        Surface(shape = RoundedCornerShape(10.dp), color = color) {
            Text(status, modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp), fontSize = 7.sp, color = if (color == AccentSoft) Accent else Primary)
        }
    }
}

@Composable
private fun PreviewMetricRow(label: String, action: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(modifier = Modifier.size(7.dp).background(Primary, CircleShape))
        Spacer(modifier = Modifier.width(7.dp))
        Text(label, modifier = Modifier.weight(1f), fontSize = 9.sp, color = OnBackground)
        Text(action, fontSize = 8.sp, fontWeight = FontWeight.SemiBold, color = Accent)
    }
}
