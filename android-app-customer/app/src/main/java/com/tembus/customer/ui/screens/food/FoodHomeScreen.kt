package com.tembus.customer.ui.screens.food

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Fastfood
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.R
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.TembusCopy
import com.tembus.customer.ui.designsystem.commerce.TembusMerchantCard
import com.tembus.customer.ui.designsystem.commerce.TembusSponsoredMerchantCard
import com.tembus.customer.ui.designsystem.commerce.toTembusMerchantCardModel
import com.tembus.customer.ui.designsystem.TembusButton
import com.tembus.customer.ui.designsystem.TembusButtonVariant
import com.tembus.customer.ui.designsystem.TembusChip
import com.tembus.customer.ui.designsystem.TembusIconButton
import com.tembus.customer.ui.designsystem.TembusSearchField
import com.tembus.customer.ui.components.MerchantListSkeleton
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.ui.designsystem.commerce.TembusCommerceImage
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.ui.navigation.RemoteDeepLinkResolver
import com.tembus.customer.ui.navigation.RemoteDeepLinkTarget
import com.tembus.customer.ui.navigation.RemoteInternalDestination
import com.tembus.customer.data.config.ExperienceBannerEventType
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodHomeScreen(
    initialLat: Double?,
    initialLng: Double?,
    onBack: () -> Unit,
    onMerchantClick: (String) -> Unit,
    onCartClick: () -> Unit,
    onAccountClick: () -> Unit = {},
    onPromoAction: (RemoteDeepLinkTarget) -> Unit = {},
    onRequestLocation: () -> Unit = {},
    locationMessage: String? = null,
    viewModel: FoodViewModel = hiltViewModel()
) {
    val merchants by viewModel.merchants.collectAsState()
    val loading by viewModel.loading.collectAsState()
    val error by viewModel.error.collectAsState()
    val cartSize by viewModel.cartSize.collectAsState()
    val locationLabel by viewModel.discoveryLocationLabel.collectAsState()
    val experienceSnapshot by viewModel.experienceSnapshot.collectAsState()

    var searchQuery by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    var debounceJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }

    // Load saat pertama masuk
    LaunchedEffect(initialLat, initialLng) {
        if (initialLat != null && initialLng != null) {
            viewModel.resolveDiscoveryLocation(initialLat, initialLng)
            viewModel.loadMerchants(initialLat, initialLng)
        }
    }

    // Debounce search 400ms
    fun onSearchChange(value: String) {
        searchQuery = value
        debounceJob?.cancel()
        debounceJob = scope.launch {
            delay(400)
            if (initialLat != null && initialLng != null) {
                viewModel.loadMerchants(initialLat, initialLng, value.trim())
            }
        }
    }

    Scaffold(containerColor = Color(0xFFF7F8F6)) { padding ->
        PullToRefreshBox(
            isRefreshing = loading && merchants.isNotEmpty(),
            onRefresh = {
                if (initialLat != null && initialLng != null) {
                    viewModel.loadMerchants(initialLat, initialLng, searchQuery.trim())
                } else {
                    onRequestLocation()
                }
            },
            modifier = Modifier.fillMaxSize()
        ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                FoodFigmaHeader(
                    onBack = onBack,
                    onCartClick = onCartClick,
                    onAccountClick = onAccountClick,
                    cartSize = cartSize,
                    locationLabel = locationLabel,
                    searchQuery = searchQuery,
                    onSearchChange = ::onSearchChange,
                )
            }
            item {
                FoodPromoSection(
                    snapshot = experienceSnapshot,
                    resolveAssetPath = { assetId -> viewModel.resolveExperienceAsset(experienceSnapshot, assetId) },
                    onPromoAction = onPromoAction,
                    onEvent = viewModel::recordExperienceBannerEvent,
                )
            }
            item {
                FoodCategoryRow(onCategoryClick = viewModel::setCuisineFilter)
            }
            item {
                val halalFilter by viewModel.halalFilter.collectAsState()
                val discoverySort by viewModel.discoverySort.collectAsState()
                FoodFilterRow(
                    halalFilter = halalFilter,
                    discoverySort = discoverySort,
                    onHalalChange = viewModel::setHalalFilter,
                    onSortChange = viewModel::setDiscoverySort,
                )
            }
            item {
                when {
                initialLat == null || initialLng == null -> {
                    FoodLocationGate(
                        message = locationMessage,
                        onRequestLocation = onRequestLocation,
                    )
                }
                loading && merchants.isEmpty() -> {
                    MerchantListSkeleton(itemCount = 4)
                }
                error != null && merchants.isEmpty() -> {
                    FoodErrorState(
                        message = error ?: "Merchant belum bisa dimuat.",
                        onRetry = {
                            if (initialLat != null && initialLng != null) {
                                viewModel.loadMerchants(initialLat, initialLng, searchQuery.trim())
                            }
                        },
                    )
                }
                merchants.isEmpty() -> {
                    FoodEmptyState()
                }
                else -> {
                    FoodDiscoverySections(
                        merchants = merchants,
                        onMerchantClick = onMerchantClick,
                        onSponsoredEvent = { merchant, event ->
                            if (merchant.isSponsored && (!merchant.adDeliveryToken.isNullOrBlank() || !merchant.sponsoredCampaignId.isNullOrBlank())) {
                                viewModel.recordSponsoredEvent(merchant.id, merchant.sponsoredCampaignId.orEmpty(), merchant.adDeliveryToken, event)
                            }
                        },
                    )
                }
            }
            }
        }
    }
}
}

@Composable
private fun FoodFigmaHeader(
    onBack: () -> Unit,
    onCartClick: () -> Unit,
    onAccountClick: () -> Unit,
    cartSize: Int,
    locationLabel: String?,
    searchQuery: String,
    onSearchChange: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.White)
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TembusIconButton(
                icon = Icons.AutoMirrored.Filled.ArrowBack,
                contentDescription = CustomerTextCatalog.translate("Kembali"),
                onClick = onBack,
                modifier = Modifier.size(32.dp),
            )
            Spacer(Modifier.width(4.dp))
            Text(TembusCopy.BrandName, color = Primary, fontSize = 16.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.width(3.dp))
            Text("Food", color = Accent, fontSize = 16.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.width(7.dp))
            Surface(
                color = Color(0xFFF2FCF3),
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(1.dp, Color(0xFFDCEBE0)),
            ) {
                Row(Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFFEF6C00), modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(3.dp))
                    Text(
                        if (locationLabel.isNullOrBlank()) "Pilih lokasi" else "Lokasi aktif",
                        fontSize = 10.sp,
                        color = Color(0xFF1E2B24),
                        maxLines = 1,
                    )
                }
            }
            Spacer(Modifier.weight(1f))
            Box {
                IconButton(onClick = onCartClick, modifier = Modifier.size(34.dp)) {
                    Icon(Icons.Default.ShoppingCart, contentDescription = CustomerTextCatalog.translate("Keranjang"), tint = Primary, modifier = Modifier.size(20.dp))
                }
                if (cartSize > 0) {
                    Box(
                        modifier = Modifier.align(Alignment.TopEnd).size(16.dp).clip(CircleShape).background(Accent),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(cartSize.toString(), fontSize = 9.sp, fontWeight = FontWeight.Bold, color = Color.White)
                    }
                }
            }
            Spacer(Modifier.width(2.dp))
            TembusIconButton(
                icon = Icons.Default.Person,
                contentDescription = CustomerTextCatalog.translate("Akun"),
                onClick = onAccountClick,
                modifier = Modifier.size(32.dp),
            )
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFFEF6C00), modifier = Modifier.size(13.dp))
            Spacer(Modifier.width(4.dp))
            Text("LOKASI ANTAR", fontSize = 9.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant, letterSpacing = 0.35.sp)
            Spacer(Modifier.width(6.dp))
            Text(
                locationLabel ?: "Titik lokasi dari perangkat",
                fontSize = 10.sp,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(20.dp)).background(Color(0xFFF7F8F6)).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFF60736B), modifier = Modifier.size(16.dp))
            Spacer(Modifier.width(8.dp))
            androidx.compose.foundation.text.BasicTextField(
                value = searchQuery,
                onValueChange = onSearchChange,
                modifier = Modifier.weight(1f),
                singleLine = true,
                textStyle = androidx.compose.ui.text.TextStyle(fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurface),
                decorationBox = { innerTextField ->
                    if (searchQuery.isBlank()) Text("Cari bakmi, martabak, kopi...", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    innerTextField()
                },
            )
            Icon(Icons.Default.Tune, contentDescription = "Filter food", tint = Primary, modifier = Modifier.size(15.dp))
        }
    }
}

@Composable
private fun FoodCategoryRow(onCategoryClick: (String) -> Unit) {
    data class FoodCategory(val label: String, val icon: ImageVector, val tint: Color)
    val categories = listOf(
        FoodCategory("Nasi & Soto", Icons.Default.Restaurant, Color(0xFF168458)),
        FoodCategory("Kopi Segar", Icons.Default.LocalOffer, Color(0xFF8A5B35)),
        FoodCategory("Ayam & Bebek", Icons.Default.Fastfood, Color(0xFFE86A1D)),
        FoodCategory("Martabak", Icons.Default.LocalOffer, Color(0xFFE86A1D)),
        FoodCategory("Menu Sehat", Icons.Default.Favorite, Color(0xFF168458)),
        FoodCategory("Bakso & Mie", Icons.Default.Fastfood, Color(0xFF8A5B35)),
    )
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Mau makan apa?", color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.weight(1f))
            Text("Lihat semua", color = Accent, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            categories.chunked(3).forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    row.forEach { category ->
                        Column(
                            modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(Color.White)
                                .clickable { onCategoryClick(category.label) }.padding(vertical = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Box(Modifier.size(38.dp).clip(CircleShape).background(Color(0xFFEAF5EE)), contentAlignment = Alignment.Center) {
                                Icon(category.icon, contentDescription = category.label, tint = category.tint, modifier = Modifier.size(19.dp))
                            }
                            Spacer(Modifier.height(4.dp))
                            Text(category.label, fontSize = 8.sp, color = MaterialTheme.colorScheme.onSurface, maxLines = 2, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FoodPromoSection(
    snapshot: ExperienceConfigSnapshot,
    resolveAssetPath: suspend (String) -> String?,
    onPromoAction: (RemoteDeepLinkTarget) -> Unit,
    onEvent: (ExperienceBannerEvent) -> Unit,
) {
    val section = snapshot.manifest.sections.firstOrNull { candidate ->
        candidate.enabled && candidate.component == "promo_carousel"
    }
    val item = section?.let { candidate -> (candidate.properties["items"] as? JsonArray)
        ?.firstOrNull()
        ?.let { it as? JsonObject } }
    val campaignId = item?.let { candidate ->
        candidate.stringValue("campaign_id") ?: candidate.stringValue("id")
    }
    val title = item?.stringValue("title")
    if (section == null || item == null || campaignId.isNullOrBlank() || title.isNullOrBlank()) {
        FoodPromoFallback(onClick = {
            onPromoAction(RemoteDeepLinkTarget.Internal(RemoteInternalDestination.PROMO))
        })
        return
    }
    val target = remember(item) {
        RemoteDeepLinkResolver.resolve(item.stringValue("deep_link"), item.stringValue("external_url"))
    }
    val assetPath by produceState<String?>(initialValue = null, item.stringValue("image_asset_id"), snapshot.manifest.revision) {
        value = item.stringValue("image_asset_id")?.let { assetId -> resolveAssetPath(assetId) }
    }
    val hasAction = target !is RemoteDeepLinkTarget.Invalid
    LaunchedEffect(campaignId, section.id, snapshot.manifest.revision) {
        if (snapshot.manifest.revision > 0) {
            onEvent(
                ExperienceBannerEvent(
                    type = ExperienceBannerEventType.IMPRESSION,
                    component = "promo_carousel",
                    campaignId = campaignId,
                    sectionId = section.id,
                    manifestRevision = snapshot.manifest.revision,
                    marketCode = snapshot.scope?.marketCode ?: snapshot.manifest.marketCode,
                    manifestId = snapshot.manifest.manifestId,
                ),
            )
        }
    }
    Card(
        modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth().heightIn(min = 176.dp)
            .clickable(enabled = hasAction) {
                onEvent(
                    ExperienceBannerEvent(
                        type = ExperienceBannerEventType.CLICK,
                        component = "promo_carousel",
                        campaignId = campaignId,
                        sectionId = section.id,
                        manifestRevision = snapshot.manifest.revision,
                        marketCode = snapshot.scope?.marketCode ?: snapshot.manifest.marketCode,
                        manifestId = snapshot.manifest.manifestId,
                    ),
                )
                onPromoAction(target)
            },
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF004D35)),
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                item.stringValue("badge")?.let {
                    Surface(color = Color(0xFFFF7A00), shape = RoundedCornerShape(999.dp)) {
                        Text(it, color = Color(0xFF162119), fontSize = 9.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp))
                    }
                }
                Text(title, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black, maxLines = 3)
                item.stringValue("body")?.let {
                    Text(it, color = Color(0xFFB9D6C7), fontSize = 10.sp, lineHeight = 14.sp, maxLines = 3)
                }
                item.stringValue("cta_label")?.takeIf { hasAction }?.let {
                    Surface(color = Color(0xFFFF7A00), shape = RoundedCornerShape(999.dp)) {
                        Row(Modifier.padding(horizontal = 11.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(it, color = Color(0xFF162119), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.width(4.dp))
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color(0xFF162119), modifier = Modifier.size(13.dp))
                        }
                    }
                }
            }
            Box(Modifier.width(106.dp).fillMaxSize(), contentAlignment = Alignment.Center) {
                if (!assetPath.isNullOrBlank()) {
                    coil.compose.AsyncImage(
                        model = assetPath,
                        contentDescription = item.stringValue("alt_label") ?: title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(100.dp).clip(CircleShape),
                    )
                } else {
                    repeat(3) { index ->
                        Box(Modifier.size((66 + index * 24).dp).clip(CircleShape).background(Color(0xFF267A5A).copy(alpha = 0.56f)))
                    }
                    Icon(Icons.Default.LocalOffer, contentDescription = null, tint = Color(0xFFB9D6C7), modifier = Modifier.size(30.dp))
                }
            }
        }
    }
}

@Composable
private fun FoodPromoFallback(onClick: () -> Unit) {
    Card(
        modifier = Modifier.padding(horizontal = 16.dp).fillMaxWidth().heightIn(min = 176.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF004D35)),
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Surface(color = Color(0xFFFF7A00), shape = RoundedCornerShape(999.dp)) {
                    Text("PENAWARAN FOOD", color = Color(0xFF162119), fontSize = 9.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp))
                }
                Text("Pesta Diskon Kuliner Hangat", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Black, maxLines = 2)
                Text("Promo dan merchant yang tersedia akan menyesuaikan akun dan area kamu.", color = Color(0xFFB9D6C7), fontSize = 10.sp, lineHeight = 14.sp, maxLines = 3)
                Surface(color = Color(0xFFFF7A00), shape = RoundedCornerShape(999.dp), modifier = Modifier.clickable(onClick = onClick)) {
                    Row(Modifier.padding(horizontal = 11.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Lihat promo", color = Color(0xFF162119), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.width(4.dp))
                        Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Color(0xFF162119), modifier = Modifier.size(13.dp))
                    }
                }
            }
            Box(Modifier.width(106.dp).fillMaxSize(), contentAlignment = Alignment.Center) {
                repeat(3) { index ->
                    Box(Modifier.size((66 + index * 24).dp).clip(CircleShape).background(Color(0xFF267A5A).copy(alpha = 0.56f)))
                }
                Icon(Icons.Default.LocalOffer, contentDescription = null, tint = Color(0xFFB9D6C7), modifier = Modifier.size(30.dp))
            }
        }
    }
}

/*
 * The card above is intentionally driven by the published experience
 * manifest. Keep this mapping presentation-only: voucher amount, eligibility,
 * price and order/payment truth remain owned by Promo/Pricing/Order APIs.
 */
private fun JsonObject.stringValue(key: String): String? =
    (this[key] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotBlank() }

@Composable
private fun FoodFilterRow(
    halalFilter: String,
    discoverySort: String,
    onHalalChange: (String) -> Unit,
    onSortChange: (String) -> Unit,
) {
    LazyRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        item { TembusChip(label = "Semua", onClick = { onHalalChange("all") }, selected = halalFilter == "all") }
        item { TembusChip(label = "Halal", onClick = { onHalalChange("halal_certified") }, selected = halalFilter == "halal_certified") }
        item { TembusChip(label = "Terdekat", onClick = { onSortChange("distance") }, selected = discoverySort == "distance") }
        item { TembusChip(label = "Rating", onClick = { onSortChange("rating") }, selected = discoverySort == "rating") }
        item { TembusChip(label = "Favorit", onClick = { onSortChange("favorites") }, selected = discoverySort == "favorites") }
    }
}

@Composable
private fun FoodDiscoverySections(
    merchants: List<FoodMerchant>,
    onMerchantClick: (String) -> Unit,
    onSponsoredEvent: (FoodMerchant, String) -> Unit,
) {
    val nearby = merchants.take(5)
    val popular = merchants.sortedWith(compareByDescending<FoodMerchant> { it.avgRating ?: 0.0 }.thenBy { it.distanceKm ?: Double.MAX_VALUE }).take(4)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        FoodMerchantRail(
            title = "Pilihan dekat lokasi",
            action = "Lihat semua",
            merchants = nearby,
            onMerchantClick = onMerchantClick,
            onSponsoredEvent = onSponsoredEvent,
        )
        FoodTrustCard()
        FoodMerchantList(
            title = "Restoran terlaris di sekitarmu",
            merchants = popular,
            onMerchantClick = onMerchantClick,
            onSponsoredEvent = onSponsoredEvent,
        )
    }
}

@Composable
private fun FoodMerchantRail(
    title: String,
    action: String,
    merchants: List<FoodMerchant>,
    onMerchantClick: (String) -> Unit,
    onSponsoredEvent: (FoodMerchant, String) -> Unit,
) {
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Black)
            Spacer(Modifier.weight(1f))
            Text(action, color = Accent, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(8.dp))
        LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(merchants, key = { it.id }) { merchant ->
                FoodMerchantMiniCard(merchant = merchant, onClick = {
                    onSponsoredEvent(merchant, "click")
                    onMerchantClick(merchant.id)
                }, onVisible = { onSponsoredEvent(merchant, "impression") })
            }
        }
    }
}

@Composable
private fun FoodMerchantMiniCard(merchant: FoodMerchant, onClick: () -> Unit, onVisible: () -> Unit) {
    LaunchedEffect(merchant.id, merchant.sponsoredCampaignId, merchant.adDeliveryToken) {
        if (merchant.isSponsored && (!merchant.adDeliveryToken.isNullOrBlank() || !merchant.sponsoredCampaignId.isNullOrBlank())) {
            delay(250)
            onVisible()
        }
    }
    Card(
        modifier = Modifier.width(216.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFE0E8E3)),
    ) {
        Column {
            Box(Modifier.fillMaxWidth().height(112.dp)) {
                TembusCommerceImage(
                    imageUrl = merchant.imageUrl ?: merchant.menuItems.firstOrNull { !it.foto.isNullOrBlank() }?.foto,
                    imageDescription = "Foto ${merchant.name}",
                    placeholderLabel = "Foto ${merchant.name} belum tersedia",
                    modifier = Modifier.fillMaxSize(),
                )
                if (merchant.isSponsored) {
                    Surface(Modifier.padding(8.dp), shape = RoundedCornerShape(5.dp), color = Color(0xFF005E3D)) {
                        Text("PILIHAN MITRA", color = Color.White, fontSize = 7.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp))
                    }
                }
            }
            Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(merchant.name, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
                Text(merchant.address.ifBlank { "Alamat merchant tersedia di detail" }, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFF7A00), modifier = Modifier.size(13.dp))
                    Text(merchant.avgRating?.let { String.format(java.util.Locale.US, "%.1f", it) } ?: "Belum ada rating", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    merchant.distanceKm?.let { Text("  •  ${String.format(java.util.Locale.US, "%.1f km", it)}", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
                Text(if (merchant.acceptsNewOrders) "Buka" else "Tidak menerima pesanan", fontSize = 9.sp, fontWeight = FontWeight.SemiBold, color = if (merchant.acceptsNewOrders) Primary else MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun FoodTrustCard() {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFE7F5EA)),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(Primary), contentAlignment = Alignment.Center) {
                Icon(Icons.Default.Fastfood, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text("Pesanan food lebih terarah", fontSize = 13.sp, fontWeight = FontWeight.Black, color = Primary)
                Text("Ketersediaan, jarak, dan status buka mengikuti data merchant.", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, lineHeight = 14.sp)
            }
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, tint = Primary, modifier = Modifier.size(17.dp))
        }
    }
}

@Composable
private fun FoodMerchantList(
    title: String,
    merchants: List<FoodMerchant>,
    onMerchantClick: (String) -> Unit,
    onSponsoredEvent: (FoodMerchant, String) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, color = MaterialTheme.colorScheme.onSurface, fontSize = 15.sp, fontWeight = FontWeight.Black)
        merchants.forEach { merchant ->
            Card(
                modifier = Modifier.fillMaxWidth().clickable {
                    onSponsoredEvent(merchant, "click")
                    onMerchantClick(merchant.id)
                },
                shape = RoundedCornerShape(13.dp),
                colors = CardDefaults.cardColors(containerColor = Color.White),
                border = BorderStroke(1.dp, Color(0xFFE0E8E3)),
            ) {
                Row(Modifier.padding(9.dp), verticalAlignment = Alignment.CenterVertically) {
                    TembusCommerceImage(
                        imageUrl = merchant.imageUrl ?: merchant.menuItems.firstOrNull { !it.foto.isNullOrBlank() }?.foto,
                        imageDescription = "Foto ${merchant.name}",
                        placeholderLabel = "Foto ${merchant.name} belum tersedia",
                        modifier = Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)),
                    )
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(merchant.name, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        Text(merchant.address.ifBlank { "Detail alamat di halaman merchant" }, fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFF7A00), modifier = Modifier.size(12.dp))
                            Text(merchant.avgRating?.let { String.format(java.util.Locale.US, "%.1f", it) } ?: "Belum ada rating", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            merchant.distanceKm?.let { Text("  •  ${String.format(java.util.Locale.US, "%.1f km", it)}", fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        }
                    }
                    Icon(Icons.Default.Favorite, contentDescription = null, tint = Color(0xFFB7C7BE), modifier = Modifier.size(17.dp))
                }
            }
        }
    }
}

@Composable
private fun FoodErrorState(message: String, onRetry: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, Color(0xFFF0C9BB))) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Food belum bisa dimuat", fontSize = 14.sp, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.error)
            Text(message, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            TextButton(onClick = onRetry) {
                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(15.dp))
                Spacer(Modifier.width(5.dp))
                Text("Coba lagi", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun FoodEmptyState() {
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, Color(0xFFE0E8E3))) {
        Column(Modifier.fillMaxWidth().padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.Store, contentDescription = null, tint = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(42.dp))
            Text("Belum ada merchant di sekitar lokasi ini", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text("Coba ubah kategori atau periksa kembali lokasi perangkat.", fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
    }
}

@Composable
private fun FoodLocationGate(
    message: String?,
    onRequestLocation: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                Icons.Default.Store,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(48.dp),
            )
            Text(
                "Lokasi diperlukan",
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
            )
            Text(
                message ?: "Izinkan lokasi agar merchant, jarak, dan estimasi yang tampil sesuai area kamu.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                fontSize = 14.sp,
            )
            TembusButton(
                text = "Gunakan lokasi saya",
                onClick = onRequestLocation,
                variant = TembusButtonVariant.Primary,
            )
        }
    }
}
