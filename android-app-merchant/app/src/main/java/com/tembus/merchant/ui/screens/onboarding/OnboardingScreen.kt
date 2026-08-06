package com.tembus.merchant.ui.screens.onboarding

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.RestaurantMenu
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.merchant.R
import com.tembus.merchant.ui.theme.Accent
import com.tembus.merchant.ui.theme.Primary
import com.tembus.merchant.ui.theme.PrimaryLight
import kotlinx.coroutines.launch

/**
 * OnboardingScreen — muncul SETELAH login pertama (FOOD-BIKE-028).
 * Memberitahu merchant cara pakai aplikasi: terima order, kelola menu,
 * print struk, buka/tutup toko. Selesai → flag DataStore di-set (tidak muncul lagi).
 */
private data class OnboardingItem(
    val icon: ImageVector,
    val title: String,
    val description: String
)

private val items = listOf(
    OnboardingItem(
        icon = Icons.Filled.Storefront,
        title = "Terima & Tolak Pesanan",
        description = "Order masuk muncul di tab Pesanan. Kamu punya waktu untuk menerima atau menolak. Jika menerima, status otomatis jadi \"Menyiapkan\"."
    ),
    OnboardingItem(
        icon = Icons.Filled.RestaurantMenu,
        title = "Kelola Menu",
        description = "Tambah, ubah, atau nonaktifkan menu di tab Menu. Aktifkan \"Tersedia\" hanya untuk makanan yang sedang bisa dipesan."
    ),
    OnboardingItem(
        icon = Icons.Filled.Print,
        title = "Cetak Struk & QR",
        description = "Setiap pesanan punya struk dengan QR handover token. QR ini di-scan kurir saat pickup — wajib dicocokkan."
    ),
    OnboardingItem(
        icon = Icons.Filled.Store,
        title = "Buka / Tutup Toko",
        description = "Geser toggle Buka/Tutup di halaman utama. Saat tutup, customer tidak bisa memesan dari tokomu."
    )
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
    val pagerState = rememberPagerState(pageCount = { items.size })
    val scope = rememberCoroutineScope()

    Scaffold(
        bottomBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Page indicator dots
                Row(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    repeat(items.size) { index ->
                        Box(
                            modifier = Modifier
                                .size(if (pagerState.currentPage == index) 10.dp else 8.dp)
                                .background(
                                    color = if (pagerState.currentPage == index) Accent else PrimaryLight,
                                    shape = CircleShape
                                )
                        )
                    }
                }

                Button(
                    onClick = {
                        if (pagerState.currentPage < items.size - 1) {
                            scope.launch { pagerState.animateScrollToPage(pagerState.currentPage + 1) }
                        } else {
                            onFinish()
                        }
                    }
                ) {
                    if (pagerState.currentPage < items.size - 1) {
                        Text("Lanjut")
                    } else {
                        Icon(Icons.Filled.Check, contentDescription = null)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Selesai")
                    }
                }
            }
        }
    ) { padding ->
        HorizontalPager(
            state = pagerState,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) { page ->
            val item = items[page]
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Logo kecil di atas
                Image(
                    painter = painterResource(id = R.drawable.tembus_login_logo),
                    contentDescription = "TEMBUS Logo",
                    modifier = Modifier
                        .width(72.dp)
                        .height(72.dp),
                    contentScale = ContentScale.Fit
                )

                Spacer(modifier = Modifier.height(40.dp))

                Surface(
                    color = PrimaryLight,
                    shape = CircleShape,
                    modifier = Modifier.size(120.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = item.icon,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.size(56.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                Text(
                    text = item.title,
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = Primary,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = item.description,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}
