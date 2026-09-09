package com.tembus.customer.ui.experience.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.data.config.ExperienceBannerEventType
import com.tembus.customer.ui.navigation.RemoteDeepLinkResolver
import com.tembus.customer.ui.navigation.RemoteDeepLinkTarget

internal data class DynamicPromoCardModel(
    val id: String,
    val campaignId: String,
    val title: String,
    val body: String?,
    val badge: String?,
    val imageAssetId: String?,
    val ctaLabel: String?,
    val deepLink: String?,
    val externalUrl: String?,
)

@Composable
internal fun DynamicPromoCard(
    item: DynamicPromoCardModel,
    sectionId: String,
    manifestRevision: Int,
    marketCode: String,
    resolveAssetPath: suspend (String) -> String?,
    onAction: (RemoteDeepLinkTarget) -> Unit,
    onEvent: (ExperienceBannerEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val assetPath by produceState<String?>(initialValue = null, item.imageAssetId, manifestRevision) {
        value = item.imageAssetId?.let { resolveAssetPath(it) }
    }
    var imageFailed by remember(assetPath) { mutableStateOf(false) }
    val target = remember(item.deepLink, item.externalUrl) {
        RemoteDeepLinkResolver.resolve(item.deepLink, item.externalUrl)
    }
    val hasAction = target !is RemoteDeepLinkTarget.Invalid

    LaunchedEffect(item.campaignId, sectionId, manifestRevision) {
        if (manifestRevision > 0) {
            onEvent(
                ExperienceBannerEvent(
                    type = ExperienceBannerEventType.IMPRESSION,
                    component = "promo_carousel",
                    campaignId = item.campaignId,
                    sectionId = sectionId,
                    manifestRevision = manifestRevision,
                    marketCode = marketCode,
                ),
            )
        }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickableIf(hasAction) {
                onEvent(
                    ExperienceBannerEvent(
                        type = ExperienceBannerEventType.CLICK,
                        component = "promo_carousel",
                        campaignId = item.campaignId,
                        sectionId = sectionId,
                        manifestRevision = manifestRevision,
                        marketCode = marketCode,
                    ),
                )
                onAction(target)
            },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(18.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (!imageFailed && !assetPath.isNullOrBlank()) {
                AsyncImage(
                    model = assetPath,
                    contentDescription = item.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(78.dp),
                    onError = { imageFailed = true },
                )
            } else {
                Surface(
                    modifier = Modifier.size(78.dp),
                    shape = RoundedCornerShape(14.dp),
                    color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.14f),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.LocalOffer, contentDescription = null, modifier = Modifier.size(30.dp))
                    }
                }
            }
            Column(Modifier.weight(1f)) {
                item.badge?.let {
                    Text(it, color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                }
                Text(item.title, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                item.body?.let {
                    Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
                if (hasAction && !item.ctaLabel.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(item.ctaLabel, color = MaterialTheme.colorScheme.primary, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(14.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun Modifier.clickableIf(enabled: Boolean, onClick: () -> Unit): Modifier =
    if (enabled) clickable(onClick = onClick) else this
