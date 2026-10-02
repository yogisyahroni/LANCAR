package com.tembus.merchant.ui.screens.onboarding

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tembus.merchant.R
import kotlinx.coroutines.launch

/**
 * Canva is the visual source of truth for merchant onboarding.
 *
 * The three page exports are rendered as-is so typography, illustrations,
 * spacing, and artwork cannot drift from the approved design. Only transparent
 * interaction targets are layered on top; completion still uses the existing
 * persisted onboarding preference in AppNavHost.
 */
private val onboardingPages = intArrayOf(
    R.drawable.merchant_onboarding_1,
    R.drawable.merchant_onboarding_2,
    R.drawable.merchant_onboarding_3,
)

private val pageDescriptions = arrayOf(
    "Terima dan proses pesanan lebih cepat",
    "Kelola menu dan stok dengan mudah",
    "Pantau pendapatan dan performa toko",
)

@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
    val pagerState = rememberPagerState(pageCount = { onboardingPages.size })
    val scope = rememberCoroutineScope()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .statusBarsPadding()
            .navigationBarsPadding(),
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize(),
            beyondViewportPageCount = 1,
        ) { page ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .semantics { contentDescription = pageDescriptions[page] },
            ) {
                Image(
                    painter = painterResource(onboardingPages[page]),
                    contentDescription = pageDescriptions[page],
                    modifier = Modifier.fillMaxSize(),
                    // The export is the complete 864x1536 Canva artboard. Fill
                    // the app content area so the approved composition reaches
                    // the same edges on different Android aspect ratios.
                    contentScale = ContentScale.FillBounds,
                )

                // The labels and buttons are part of the Canva artwork. These
                // invisible targets preserve the real onboarding interactions.
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .fillMaxWidth(0.28f)
                        .height(92.dp)
                        .clickable(onClick = onFinish),
                )
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp)
                        .height(92.dp)
                        .clickable {
                            if (pagerState.currentPage == onboardingPages.lastIndex) {
                                onFinish()
                            } else {
                                scope.launch {
                                    pagerState.animateScrollToPage(pagerState.currentPage + 1)
                                }
                            }
                        },
                )
            }
        }
    }
}
