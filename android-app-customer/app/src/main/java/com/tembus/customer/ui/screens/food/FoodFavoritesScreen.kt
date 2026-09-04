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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.foundation.clickable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.data.model.FavoriteMerchant
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight
import com.tembus.customer.ui.theme.Success
import com.tembus.customer.ui.theme.TembusRadius
import com.tembus.customer.ui.theme.Warning

// FOOD-BIKE-070: Favorite merchants list
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FoodFavoritesScreen(
    onBack: () -> Unit,
    onMerchantClick: (String) -> Unit,
    viewModel: FoodViewModel = hiltViewModel()
) {
    val favorites by viewModel.favoriteMerchants.collectAsState()
    val loading by viewModel.favoritesLoading.collectAsState()
    val error by viewModel.favoritesError.collectAsState()

    // Load saat pertama masuk
    LaunchedEffect(Unit) {
        viewModel.loadFavoriteMerchants()
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
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"), tint = Primary)
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Favorit", fontSize = 20.sp, fontWeight = FontWeight.ExtraBold, color = Primary)
                    Text("${favorites.size} merchant", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = loading && favorites.isNotEmpty(),
            onRefresh = viewModel::loadFavoriteMerchants,
            modifier = Modifier.fillMaxSize()
        ) {
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            when {
                loading && favorites.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Primary)
                    }
                }
                error != null && favorites.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Gagal memuat favorit", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
                            Spacer(Modifier.height(8.dp))
                            androidx.compose.material3.TextButton(onClick = { viewModel.loadFavoriteMerchants() }) {
                                Text("Coba lagi", color = Primary)
                            }
                        }
                    }
                }
                favorites.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(Icons.Default.FavoriteBorder, contentDescription = "", tint = MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.size(48.dp))
                            Spacer(Modifier.height(12.dp))
                            Text("Belum ada merchant favorit", color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.SemiBold)
                            Spacer(Modifier.height(4.dp))
                            Text("Tekan ikon hati di merchant untuk menambahkannya", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        items(favorites, key = { it.merchantId }) { favorite ->
                            FavoriteMerchantCard(
                                favorite = favorite,
                                onClick = { onMerchantClick(favorite.merchantId) },
                                onRemove = { viewModel.removeFavoriteMerchant(favorite.merchantId) { _ -> } }
                            )
                        }
                    }
                }
            }
        }
        }
    }
}

@Composable
private fun FavoriteMerchantCard(
    favorite: FavoriteMerchant,
    onClick: () -> Unit,
    onRemove: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(TembusRadius.Card))
            .background(MaterialTheme.colorScheme.surface)
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
                Icon(Icons.Default.Store, contentDescription = "", tint = Primary, modifier = Modifier.size(26.dp))
            }
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        favorite.merchantName,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 16.sp,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    // ADR 003: badge halal / non-halal
                    when {
                        favorite.isHalalCertified -> HalalBadge(text = "Halal", container = Success)
                        favorite.isNonHalal -> HalalBadge(text = "Non-Halal", container = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Text(
                    favorite.address,
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (favorite.avgRating != null && favorite.avgRating > 0) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Star, contentDescription = "", tint = Warning, modifier = Modifier.size(14.dp))
                            Text(
                                String.format("%.1f", favorite.avgRating),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                    if (favorite.distanceKm != null) {
                        Text("•", color = MaterialTheme.colorScheme.outlineVariant)
                        Text(
                            "${String.format("%.1f", favorite.distanceKm)} km",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Text("•", color = MaterialTheme.colorScheme.outlineVariant)
                    Text(
                        if (favorite.isOpen) "Buka" else "Tutup",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (favorite.isOpen) Success else Error
                    )
                    // Remove from favorites
                    IconButton(onClick = onRemove) {
                        Icon(
                            imageVector = Icons.Filled.Favorite,
                            contentDescription = CustomerTextCatalog.translate("Hapus dari favorit"),
                            tint = Error
                        )
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
