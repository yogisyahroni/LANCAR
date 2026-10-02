package com.tembus.customer.ui.screens.onboarding

import androidx.annotation.DrawableRes
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import com.tembus.customer.R
import kotlinx.coroutines.launch

/**
 * The onboarding artwork is exported directly from Canva.
 *
 * The light assets live in drawable-nodpi and the dark assets use the same
 * resource names in drawable-night-nodpi. Android therefore selects the
 * correct Canva page from the device's system theme without duplicating the
 * design in Compose or applying a lossy colour inversion.
 */
private data class CustomerOnboardingPage(
    @DrawableRes val artworkRes: Int,
    val artworkDescription: String
)

private val customerOnboardingPages = listOf(
    CustomerOnboardingPage(
        artworkRes = R.drawable.img_customer_onboarding_canva_1,
        artworkDescription = "TEMBUS membantu mengirim paket, memesan makanan, dan mendapat bantuan di jalan."
    ),
    CustomerOnboardingPage(
        artworkRes = R.drawable.img_customer_onboarding_canva_2,
        artworkDescription = "TEMBUS menyediakan makanan, kirim paket, tambal ban, dan towing dalam satu aplikasi."
    ),
    CustomerOnboardingPage(
        artworkRes = R.drawable.img_customer_onboarding_canva_3,
        artworkDescription = "TEMBUS membantu memantau pesanan dari diterima, diproses, dalam perjalanan, hingga sampai tujuan."
    ),
    CustomerOnboardingPage(
        artworkRes = R.drawable.img_customer_onboarding_canva_4,
        artworkDescription = "TEMBUS memberi lebih banyak waktu untuk hal penting dalam perjalanan sehari-hari."
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

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxSize()
        ) { pageIndex ->
            CanvaOnboardingPage(
                page = pages[pageIndex],
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
}

@Composable
private fun CanvaOnboardingPage(
    page: CustomerOnboardingPage,
    onSkip: () -> Unit,
    onNext: () -> Unit
) {
    Box(modifier = Modifier.fillMaxSize()) {
        Image(
            painter = painterResource(id = page.artworkRes),
            contentDescription = page.artworkDescription,
            contentScale = ContentScale.FillBounds,
            modifier = Modifier.fillMaxSize()
        )

        // The labels and button artwork remain exactly as exported by Canva.
        // Transparent semantic hit targets keep Skip and Continue functional
        // without painting a second, visually divergent set of controls.
        Box(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .fillMaxWidth(0.30f)
                .fillMaxHeight(0.15f)
                .semantics {
                    contentDescription = "Lewati onboarding"
                    role = Role.Button
                }
                .clickable(onClick = onSkip)
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(0.94f)
                .fillMaxHeight(0.16f)
                .semantics {
                    contentDescription = if (page.artworkRes == R.drawable.img_customer_onboarding_canva_4) {
                        "Mulai sekarang"
                    } else {
                        "Lanjut"
                    }
                    role = Role.Button
                }
                .clickable(onClick = onNext)
        )
    }
}
