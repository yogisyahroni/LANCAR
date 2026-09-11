package com.tembus.customer.ui.screens.food

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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Scaffold
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.R
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.designsystem.commerce.TembusMerchantCard
import com.tembus.customer.ui.designsystem.commerce.TembusSponsoredMerchantCard
import com.tembus.customer.ui.designsystem.commerce.toTembusMerchantCardModel
import com.tembus.customer.ui.designsystem.TembusButton
import com.tembus.customer.ui.designsystem.TembusButtonVariant
import com.tembus.customer.ui.designsystem.TembusChip
import com.tembus.customer.ui.designsystem.TembusIconButton
import com.tembus.customer.ui.designsystem.TembusSearchField
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodHomeScreen(
    initialLat: Double,
    initialLng: Double,
    onBack: () -> Unit,
    onMerchantClick: (String) -> Unit,
    onCartClick: () -> Unit,
    viewModel: FoodViewModel = hiltViewModel()
) {
    val merchants by viewModel.merchants.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val cartSize by viewModel.cartSize.collectAsState()

    var searchQuery by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    var debounceJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }

    // Load saat pertama masuk
    LaunchedEffect(Unit) {
        viewModel.loadMerchants(initialLat, initialLng)
    }

    // Debounce search 400ms
    fun onSearchChange(value: String) {
        searchQuery = value
        debounceJob?.cancel()
        debounceJob = scope.launch {
            delay(400)
            viewModel.loadMerchants(initialLat, initialLng, value.trim())
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .background(MaterialTheme.colorScheme.surface)
                    .padding(horizontal = 4.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TembusIconButton(
                    icon = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = CustomerTextCatalog.translate("Kembali"),
                    onClick = onBack,
                    modifier = Modifier.padding(horizontal = 4.dp),
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text("Food Delivery", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
                    Text("Merchant terdekat", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                // Cart badge
                Box {
                    TembusIconButton(
                        icon = Icons.Default.ShoppingCart,
                        contentDescription = CustomerTextCatalog.translate("Keranjang"),
                        onClick = onCartClick,
                        modifier = Modifier.padding(horizontal = 4.dp),
                    )
                    if (cartSize > 0) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(top = 6.dp, end = 6.dp)
                                .size(18.dp)
                                .clip(CircleShape)
                                .background(Accent),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(cartSize.toString(), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color.White)
                        }
                    }
                }
            }
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = loading && merchants.isNotEmpty(),
            onRefresh = { viewModel.loadMerchants(initialLat, initialLng, searchQuery.trim()) },
            modifier = Modifier.fillMaxSize()
        ) {
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Search bar
            TembusSearchField(
                value = searchQuery,
                onValueChange = ::onSearchChange,
                label = "Cari makanan",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = "Cari makanan atau merchant...",
            )

            // ── ADR 003: filter halal ──
            val halalFilter by viewModel.halalFilter.collectAsState()
            val discoverySort by viewModel.discoverySort.collectAsState()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TembusChip(
                    label = "Semua",
                    selected = halalFilter == "all",
                    onClick = { viewModel.setHalalFilter("all") },
                )
                TembusChip(
                    label = "Halal",
                    selected = halalFilter == "halal_certified",
                    onClick = { viewModel.setHalalFilter("halal_certified") },
                )
                TembusChip(
                    label = "Non-Halal",
                    selected = halalFilter == "non_halal",
                    onClick = { viewModel.setHalalFilter("non_halal") },
                )
            }

            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(
                    listOf(
                    "distance" to "Terdekat",
                    "rating" to "Rating",
                    "popular" to "Populer",
                    "recent" to "Pesanan terakhir",
                    "favorites" to "Favorit",
                    ),
                    key = { it.first },
                ) { (sort, label) ->
                    TembusChip(
                        label = label,
                        selected = discoverySort == sort,
                        onClick = { viewModel.setDiscoverySort(sort) },
                    )
                }
            }

            when {
                loading && merchants.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Primary)
                    }
                }
                error != null && merchants.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Gagal memuat merchant", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            TembusButton(
                                text = "Coba lagi",
                                onClick = { viewModel.loadMerchants(initialLat, initialLng, searchQuery.trim()) },
                                variant = TembusButtonVariant.Text,
                            )
                        }
                    }
                }
                merchants.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.Store, contentDescription = "", tint = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(48.dp))
                            Spacer(Modifier.height(12.dp))
                            Text("Belum ada merchant di sekitarmu", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                else -> {
                    val listState = rememberLazyListState()
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        itemsIndexed(merchants, key = { _, merchant -> merchant.id }) { index, merchant ->
                            val isViewable = listState.layoutInfo.visibleItemsInfo.any { it.index == index }
                            if (merchant.isSponsored && (!merchant.adDeliveryToken.isNullOrBlank() || !merchant.sponsoredCampaignId.isNullOrBlank())) {
                                // A billable impression requires the LazyColumn item to
                                // be in the viewport for the minimum viewability dwell.
                                // Rendering/composition alone is intentionally insufficient.
                                LaunchedEffect(merchant.id, merchant.sponsoredCampaignId, merchant.adDeliveryToken, isViewable) {
                                    if (isViewable) {
                                        delay(250)
                                        viewModel.recordSponsoredEvent(merchant.id, merchant.sponsoredCampaignId.orEmpty(), merchant.adDeliveryToken, "impression")
                                    }
                                }
                            }
                            // Check if this merchant is in favorites
                            val favorites = viewModel.favoriteMerchants.collectAsState().value
                            val isFav = favorites.any { it.merchantId == merchant.id }
                            val cardModel = merchant.toTembusMerchantCardModel(isFavorite = isFav)
                            val cardClick = {
                                if (merchant.isSponsored && (!merchant.adDeliveryToken.isNullOrBlank() || !merchant.sponsoredCampaignId.isNullOrBlank())) {
                                    viewModel.recordSponsoredEvent(merchant.id, merchant.sponsoredCampaignId.orEmpty(), merchant.adDeliveryToken, "click")
                                }
                                onMerchantClick(merchant.id)
                            }
                            val favoriteClick = {
                                if (isFav) {
                                    viewModel.removeFavoriteMerchant(merchant.id) { _ -> }
                                } else {
                                    viewModel.addFavoriteMerchant(merchant.id) { _ -> }
                                }
                            }
                            if (merchant.isSponsored) {
                                TembusSponsoredMerchantCard(
                                    model = cardModel,
                                    onClick = cardClick,
                                    onFavoriteClick = favoriteClick,
                                )
                            } else {
                                TembusMerchantCard(
                                    model = cardModel,
                                    onClick = cardClick,
                                    onFavoriteClick = favoriteClick,
                                )
                            }
                        }
                    }
                }
            }
        }
        }
    }
}
