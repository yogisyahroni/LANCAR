package com.tembus.customer.ui.screens.onboarding

import androidx.annotation.DrawableRes
import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.R
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.OnAccent
import com.tembus.customer.ui.theme.OnBackground
import com.tembus.customer.ui.theme.OnSurfaceVariant
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimarySoft
import com.tembus.customer.ui.theme.Surface
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.TembusSpacing
import kotlinx.coroutines.launch

private data class CustomerOnboardingPage(
    @DrawableRes val illustrationRes: Int,
    val title: String,
    val description: String,
    val imageDescription: String
)

private val customerOnboardingPages = listOf(
    CustomerOnboardingPage(
        illustrationRes = R.drawable.img_customer_onboarding_1,
        title = "Selamat Datang\ndi Tembus.",
        description = "Kirim paket dengan aman dan terpercaya sejak pickup sampai tujuan.",
        imageDescription = "Ilustrasi paket aman dengan tanda verifikasi TEMBUS"
    ),
    CustomerOnboardingPage(
        illustrationRes = R.drawable.img_customer_onboarding_2,
        title = "Atur Pickup\nDengan Mudah.",
        description = "Tentukan lokasi penjemputan, tujuan, dan layanan yang paling sesuai untuk paket Anda.",
        imageDescription = "Ilustrasi pengguna memilih lokasi penjemputan, tujuan, dan layanan pengiriman"
    ),
    CustomerOnboardingPage(
        illustrationRes = R.drawable.img_customer_onboarding_3,
        title = "Pantau Sampai\nPaket Diterima.",
        description = "Ikuti perjalanan kurir secara realtime hingga paket tiba dengan aman.",
        imageDescription = "Ilustrasi rute pengiriman paket sampai tujuan"
    )
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun OnboardingScreen(
    onComplete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val pages = remember { customerOnboardingPages }
    val pagerState = rememberPagerState(pageCount = { pages.size })
    val scope = rememberCoroutineScope()
    val isLastPage = pagerState.currentPage == pages.lastIndex

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Surface)
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = TembusSpacing.Screen),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(TembusSpacing.Screen))
        val isDark = androidx.compose.foundation.isSystemInDarkTheme()
        val logoRes = if (isDark) R.drawable.tembus_home_logo else R.drawable.tembus_login_logo
        Image(
            painter = painterResource(id = logoRes),
            contentDescription = "Logo TEMBUS",
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxWidth(0.46f)
                .heightIn(max = 56.dp)
        )
        Spacer(modifier = Modifier.height(TembusSpacing.Large))
        OnboardingIndicator(
            pageCount = pages.size,
            selectedPage = pagerState.currentPage
        )
        Spacer(modifier = Modifier.height(TembusSpacing.Medium))

        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
        ) { pageIndex ->
            OnboardingPageContent(
                page = pages[pageIndex],
                modifier = Modifier.fillMaxSize()
            )
        }

        OnboardingActions(
            isLastPage = isLastPage,
            onSkip = onComplete,
            onNext = {
                if (isLastPage) {
                    onComplete()
                } else {
                    scope.launch {
                        pagerState.animateScrollToPage(pagerState.currentPage + 1)
                    }
                }
            }
        )
    }
}

@Composable
private fun OnboardingPageContent(
    page: CustomerOnboardingPage,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.padding(top = TembusSpacing.Medium),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = page.illustrationRes),
                contentDescription = page.imageDescription,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 262.dp)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = TembusSpacing.Medium),
            verticalArrangement = Arrangement.spacedBy(TembusSpacing.Small)
        ) {
            Text(
                text = page.title,
                color = OnBackground,
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontSize = 30.sp,
                    lineHeight = 34.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.sp
                )
            )
            Text(
                text = page.description,
                color = OnSurfaceVariant,
                style = MaterialTheme.typography.bodyLarge.copy(
                    fontSize = 16.sp,
                    lineHeight = 22.sp,
                    letterSpacing = 0.sp
                )
            )
        }
    }
}

@Composable
private fun OnboardingIndicator(
    pageCount: Int,
    selectedPage: Int,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(TembusSpacing.Small),
        verticalAlignment = Alignment.CenterVertically
    ) {
        repeat(pageCount) { index ->
            val isSelected = index == selectedPage
            Box(
                modifier = Modifier
                    .width(if (isSelected) 24.dp else 8.dp)
                    .height(8.dp)
                    .clip(RoundedCornerShape(50.dp))
                    .background(if (isSelected) Primary else OnSurfaceVariant)
            )
        }
    }
}

@Composable
private fun OnboardingActions(
    isLastPage: Boolean,
    onSkip: () -> Unit,
    onNext: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(bottom = TembusSpacing.Screen),
        verticalArrangement = Arrangement.spacedBy(TembusSpacing.Small)
    ) {
        if (isLastPage) {
            Button(
                onClick = onNext,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(TembusRadius.Button),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Accent,
                    contentColor = OnAccent
                )
            ) {
                Text(
                    text = "Kirim Sekarang",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
                Spacer(modifier = Modifier.width(TembusSpacing.Small))
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = "",
                    modifier = Modifier.size(18.dp)
                )
            }
            TextButton(
                onClick = onSkip,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
            ) {
                Text(
                    text = "Daftar / Masuk",
                    color = Primary,
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(
                    onClick = onSkip,
                    modifier = Modifier
                        .height(48.dp)
                        .clip(RoundedCornerShape(TembusRadius.Button))
                        .background(PrimarySoft)
                        .border(1.dp, Primary.copy(alpha = 0.18f), RoundedCornerShape(TembusRadius.Button)),
                    colors = ButtonDefaults.textButtonColors(contentColor = Primary)
                ) {
                    Text(
                        text = "Lewati",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                }
                Button(
                    onClick = onNext,
                    modifier = Modifier
                        .width(152.dp)
                        .height(56.dp),
                    shape = RoundedCornerShape(TembusRadius.Button),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = Accent,
                        contentColor = OnAccent
                    )
                ) {
                    Text(
                        text = "Berikutnya",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                }
            }
        }
    }
}
