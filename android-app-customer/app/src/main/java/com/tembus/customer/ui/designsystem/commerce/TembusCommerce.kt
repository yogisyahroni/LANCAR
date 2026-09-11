package com.tembus.customer.ui.designsystem.commerce

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Store
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.ui.designsystem.TembusBadge
import com.tembus.customer.ui.designsystem.TembusBadgeTone
import com.tembus.customer.ui.designsystem.TembusButton
import com.tembus.customer.ui.designsystem.TembusButtonVariant
import com.tembus.customer.ui.designsystem.TembusCard
import com.tembus.customer.ui.designsystem.TembusIconButton
import java.util.Locale

/**
 * Canonical source of truth for commerce card facts. Advertising metadata is
 * deliberately not part of this model; the sponsored wrapper owns disclosure.
 */
data class TembusMerchantCardModel(
    val id: String,
    val name: String,
    val imageUrl: String? = null,
    val imageDescription: String? = null,
    val address: String? = null,
    val rating: Double? = null,
    val ratingCount: Int = 0,
    val distanceLabel: String? = null,
    val etaLabel: String? = null,
    val isOpen: Boolean? = null,
    val halalStatus: TembusHalalStatus = TembusHalalStatus.Unknown,
    val deliveryFeeLabel: String? = null,
    val promoLabel: String? = null,
    val isFavorite: Boolean = false,
)

enum class TembusHalalStatus {
    Certified,
    NonHalal,
    Unknown,
}

fun FoodMerchant.toTembusMerchantCardModel(isFavorite: Boolean = false): TembusMerchantCardModel =
    TembusMerchantCardModel(
        id = id,
        name = name,
        imageUrl = imageUrl ?: menuItems.firstOrNull()?.foto,
        imageDescription = "Foto $name",
        address = address.takeIf { it.isNotBlank() },
        rating = avgRating,
        ratingCount = ratingCount,
        distanceLabel = distanceKm?.let { "${it.formatOneDecimal()} km" },
        isOpen = isOpen,
        halalStatus = when {
            isHalalCertified -> TembusHalalStatus.Certified
            isNonHalal -> TembusHalalStatus.NonHalal
            else -> TembusHalalStatus.Unknown
        },
        isFavorite = isFavorite,
    )

private fun Double.formatOneDecimal(): String = String.format(Locale.US, "%.1f", this)

/** Organic anatomy. Use [TembusSponsoredMerchantCard] for paid inventory. */
@Composable
fun TembusMerchantCard(
    model: TembusMerchantCardModel,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onFavoriteClick: (() -> Unit)? = null,
) {
    TembusMerchantCardFrame(
        model = model,
        onClick = onClick,
        modifier = modifier,
        onFavoriteClick = onFavoriteClick,
        sponsored = false,
    )
}

/**
 * Paid inventory with the exact same content anatomy as organic inventory.
 * The disclosure is mandatory and cannot be disabled by merchant creative.
 */
@Composable
fun TembusSponsoredMerchantCard(
    model: TembusMerchantCardModel,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    onFavoriteClick: (() -> Unit)? = null,
) {
    TembusMerchantCardFrame(
        model = model,
        onClick = onClick,
        modifier = modifier,
        onFavoriteClick = onFavoriteClick,
        sponsored = true,
    )
}

@Composable
private fun TembusMerchantCardFrame(
    model: TembusMerchantCardModel,
    onClick: () -> Unit,
    modifier: Modifier,
    onFavoriteClick: (() -> Unit)?,
    sponsored: Boolean,
) {
    TembusCard(modifier = modifier.fillMaxWidth(), onClick = onClick) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(4f / 3f)
                .clip(RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        ) {
            MerchantImage(model)
            if (sponsored) {
                TembusSponsoredLabel(modifier = Modifier.align(Alignment.TopStart).padding(12.dp))
            }
            if (onFavoriteClick != null) {
                TembusIconButton(
                    icon = if (model.isFavorite) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    contentDescription = if (model.isFavorite) "Hapus ${model.name} dari favorit" else "Tambah ${model.name} ke favorit",
                    onClick = onFavoriteClick,
                    selected = model.isFavorite,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f), RoundedCornerShape(12.dp)),
                )
            }
        }
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = model.name,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                when (model.halalStatus) {
                    TembusHalalStatus.Certified -> TembusBadge("Halal", tone = TembusBadgeTone.Success)
                    TembusHalalStatus.NonHalal -> TembusBadge("Non-Halal", tone = TembusBadgeTone.Neutral)
                    TembusHalalStatus.Unknown -> Unit
                }
            }
            model.address?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            TembusRatingSummary(model.rating, model.ratingCount)
            TembusEtaDistanceRow(model.distanceLabel, model.etaLabel)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                model.isOpen?.let {
                    TembusBadge(if (it) "Buka" else "Tutup", tone = if (it) TembusBadgeTone.Success else TembusBadgeTone.Error)
                }
                model.deliveryFeeLabel?.let { TembusPriceSummary(label = "Ongkir", value = it) }
            }
            // Promo is an independent merchant offer; it is intentionally not
            // derived from sponsored/disclosure state.
            model.promoLabel?.let { TembusBadge(it, tone = TembusBadgeTone.Warning) }
        }
    }
}

@Composable
private fun MerchantImage(model: TembusMerchantCardModel) {
    var imageFailed by remember(model.imageUrl) { mutableStateOf(false) }
    if (model.imageUrl.isNullOrBlank() || imageFailed) {
        TembusImagePlaceholder(label = "Foto ${model.name} belum tersedia")
    } else {
        AsyncImage(
            model = model.imageUrl,
            contentDescription = model.imageDescription ?: "Foto ${model.name}",
            modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
            contentScale = ContentScale.Crop,
            onError = { imageFailed = true },
        )
    }
}

@Composable
private fun TembusImagePlaceholder(label: String, modifier: Modifier = Modifier, fillWidth: Boolean = true) {
    Box(
        modifier = if (fillWidth) {
            modifier.fillMaxWidth().aspectRatio(4f / 3f)
        } else {
            modifier
        }.background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(Icons.Default.Store, contentDescription = "", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(32.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun TembusSponsoredLabel(modifier: Modifier = Modifier) {
    TembusBadge(label = "Sponsored", modifier = modifier, tone = TembusBadgeTone.Info)
}

@Composable
fun TembusRatingSummary(rating: Double?, ratingCount: Int = 0, modifier: Modifier = Modifier) {
    if (rating == null || rating <= 0) return
    val count = if (ratingCount > 0) " ($ratingCount)" else ""
    Row(
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = "Rating ${rating.formatOneDecimal()} dari 5$count" },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(Icons.Default.Star, contentDescription = "", tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(16.dp))
        Text(rating.formatOneDecimal() + count, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
    }
}

@Composable
fun TembusEtaDistanceRow(distanceLabel: String?, etaLabel: String?, modifier: Modifier = Modifier) {
    val labels = listOfNotNull(distanceLabel, etaLabel)
    if (labels.isEmpty()) return
    Row(
        modifier = modifier.semantics(mergeDescendants = true) { contentDescription = labels.joinToString(", ") },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        labels.forEachIndexed { index, label ->
            if (index > 0) Text("•", color = MaterialTheme.colorScheme.outline)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun TembusPriceSummary(label: String, value: String, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("$label:", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun TembusMenuItemCard(
    name: String,
    priceLabel: String,
    modifier: Modifier = Modifier,
    description: String? = null,
    imageUrl: String? = null,
    imageDescription: String? = null,
    available: Boolean = true,
    onAdd: (() -> Unit)? = null,
) {
    TembusCard(modifier = modifier.fillMaxWidth()) {
        Row(modifier = Modifier.padding(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (!imageUrl.isNullOrBlank()) {
                AsyncImage(model = imageUrl, contentDescription = imageDescription ?: "Foto $name", contentScale = ContentScale.Crop, modifier = Modifier.size(88.dp).clip(RoundedCornerShape(12.dp)))
            } else {
                TembusImagePlaceholder(label = "Foto $name belum tersedia", modifier = Modifier.size(88.dp).clip(RoundedCornerShape(12.dp)), fillWidth = false)
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                description?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                Text(priceLabel, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            }
            if (onAdd != null) {
                TembusIconButton(icon = Icons.Default.Add, contentDescription = if (available) "Tambah $name" else "$name tidak tersedia", onClick = onAdd, enabled = available)
            }
        }
    }
}

@Composable
fun TembusPromoCard(title: String, message: String, modifier: Modifier = Modifier, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    TembusCard(modifier = modifier.fillMaxWidth(), elevated = true) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
            if (actionLabel != null && onAction != null) TembusButton(text = actionLabel, onClick = onAction, variant = TembusButtonVariant.Outline, modifier = Modifier.heightIn(min = 48.dp))
        }
    }
}

@Composable
fun TembusVoucherChip(label: String, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null) {
    if (onClick == null) {
        TembusBadge(label = label, modifier = modifier, tone = TembusBadgeTone.Info)
    } else {
        TembusButton(text = label, onClick = onClick, modifier = modifier.heightIn(min = 48.dp), variant = TembusButtonVariant.Tonal)
    }
}

@Composable
fun TembusCartBar(itemCount: Int, totalLabel: String, onCheckout: () -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier = modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shadowElevation = 4.dp) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.Default.ShoppingCart, contentDescription = "", tint = MaterialTheme.colorScheme.primary)
            Column(modifier = Modifier.weight(1f)) {
                Text("$itemCount item", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(totalLabel, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            }
            TembusButton(text = "Lanjut", onClick = onCheckout, modifier = Modifier.heightIn(min = 48.dp))
        }
    }
}
