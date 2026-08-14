package com.tembus.customer.ui.screens.food

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// FOOD-BIKE-055: browse merchant terdekat (list + search + filter)
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
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = Primary)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Food Delivery", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
                    Text("Merchant terdekat", fontSize = 12.sp, color = Color(0xFF64748B))
                }
                // Cart badge
                Box {
                    IconButton(onClick = onCartClick) {
                        Icon(Icons.Default.ShoppingCart, contentDescription = "Keranjang", tint = Primary)
                    }
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
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Search bar
            OutlinedTextField(
                value = searchQuery,
                onValueChange = ::onSearchChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Cari makanan atau merchant...", fontSize = 14.sp) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFF94A3B8)) },
                singleLine = true,
                shape = RoundedCornerShape(16.dp)
            )

            // ── ADR 003: filter halal ──
            val halalFilter by viewModel.halalFilter.collectAsState()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                FilterChip(
                    selected = halalFilter == "all",
                    onClick = { viewModel.setHalalFilter("all") },
                    label = { Text("Semua", fontSize = 12.sp) }
                )
                FilterChip(
                    selected = halalFilter == "halal_certified",
                    onClick = { viewModel.setHalalFilter("halal_certified") },
                    label = { Text("Halal", fontSize = 12.sp) }
                )
                FilterChip(
                    selected = halalFilter == "non_halal",
                    onClick = { viewModel.setHalalFilter("non_halal") },
                    label = { Text("Non-Halal", fontSize = 12.sp) }
                )
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
                            Text("Gagal memuat merchant", color = Color(0xFFEF4444), fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            TextButton(onClick = { viewModel.loadMerchants(initialLat, initialLng, searchQuery.trim()) }) {
                                Text("Coba lagi", color = Primary)
                            }
                        }
                    }
                }
                merchants.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.Store, contentDescription = null, tint = Color(0xFFCBD5E1), modifier = Modifier.size(48.dp))
                            Spacer(Modifier.height(12.dp))
                            Text("Belum ada merchant di sekitarmu", color = Color(0xFF64748B), fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(merchants, key = { it.id }) { merchant ->
                            // Check if this merchant is in favorites
                            val favorites = viewModel.favoriteMerchants.collectAsState().value
                            val isFav = favorites.any { it.merchantId == merchant.id }
                            FoodMerchantCard(
                                merchant = merchant,
                                onClick = { onMerchantClick(merchant.id) },
                                isFavorite = isFav,
                                onFavoriteClick = {
                                    if (isFav) {
                                        viewModel.removeFavoriteMerchant(merchant.id) { _ -> }
                                    } else {
                                        viewModel.addFavoriteMerchant(merchant.id) { _ -> }
                                    }
                                }
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FoodMerchantCard(
    merchant: FoodMerchant,
    onClick: () -> Unit,
    isFavorite: Boolean = false,
    onFavoriteClick: (() -> Unit)? = null
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(Color.White)
            .clickable(onClick = onClick)
            .padding(16.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(PrimaryLight),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Store, contentDescription = null, tint = Primary, modifier = Modifier.size(26.dp))
            }
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        merchant.name,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 16.sp,
                        color = Color(0xFF0F172A),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    // ADR 003: badge halal / non-halal
                    when {
                        merchant.isHalalCertified -> HalalBadge(text = "Halal", container = Color(0xFF16A34A))
                        merchant.isNonHalal -> HalalBadge(text = "Non-Halal", container = Color(0xFF64748B))
                    }
                }
                Text(
                    merchant.address,
                    fontSize = 12.sp,
                    color = Color(0xFF64748B),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (merchant.avgRating != null && merchant.avgRating > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFF59E0B), modifier = Modifier.size(14.dp))
                            Text(
                                String.format("%.1f", merchant.avgRating),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color(0xFF0F172A)
                            )
                        }
                    }
                    if (merchant.distanceKm != null) {
                        Text("•", color = Color(0xFFCBD5E1))
                        Text(
                            "${String.format("%.1f", merchant.distanceKm)} km",
                            fontSize = 12.sp,
                            color = Color(0xFF64748B)
                        )
                    }
                    Text("•", color = Color(0xFFCBD5E1))
                    Text(
                        if (merchant.isOpen) "Buka" else "Tutup",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (merchant.isOpen) Color(0xFF16A34A) else Color(0xFFEF4444)
                    )
                    // Favorite toggle
                    if (onFavoriteClick != null) {
                        IconButton(
                            onClick = onFavoriteClick,
                            modifier = Modifier.padding(start = 8.dp)
                        ) {
                            Icon(
                                imageVector = if (isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = if (isFavorite) "Hapus dari favorit" else "Tambah ke favorit",
                                tint = if (isFavorite) Color(0xFFEF4444) else Color(0xFF64748B)
                            )
                        }
                    }
                }
            }
        }
    }
}

// ── ADR 003: badge status halal di kartu/detail toko ──
@Composable
private fun HalalBadge(text: String, container: Color) {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(container.copy(alpha = 0.12f))
            .padding(horizontal = 6.dp, vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(3.dp)
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(container)
        )
        Text(
            text,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            color = container
        )
    }
}
