package com.tembus.customer.ui.experience.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import com.tembus.customer.ui.theme.RuntimeBadgePreset
import com.tembus.customer.ui.theme.LocalRuntimeDesignTokens

internal data class DynamicPromoCardModel(
    val id: String,
    val campaignId: String,
    val title: String,
    val body: String?,
    val badge: String?,
    val altLabel: String?,
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
    manifestId: String? = null,
    resolveAssetPath: suspend (String) -> String?,
    onAction: (RemoteDeepLinkTarget) -> Unit,
    onEvent: (ExperienceBannerEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val runtimeTokens = LocalRuntimeDesignTokens.current
    val darkTheme = isSystemInDarkTheme()
    val accentColor = runtimeTokens.accentColor(darkTheme)
    val accentContentColor = runtimeTokens.accentContentColor(darkTheme)
    val assetPath by produceState<String?>(initialValue = null, item.imageAssetId, manifestRevision) {
        value = item.imageAssetId?.let { resolveAssetPath(it) }
    }
    var imageFailed by remember(assetPath) { mutableStateOf(false) }
    var imageFailureReported by remember(assetPath) { mutableStateOf(false) }
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
                    manifestId = manifestId,
                ),
            )
        }
    }

    LaunchedEffect(target, item.campaignId, sectionId, manifestRevision) {
        if (target is RemoteDeepLinkTarget.Invalid && (!item.deepLink.isNullOrBlank() || !item.externalUrl.isNullOrBlank())) {
            onEvent(
                ExperienceBannerEvent(
                    type = ExperienceBannerEventType.DEEPLINK_FAILURE,
                    component = "deeplink",
                    campaignId = item.campaignId,
                    sectionId = sectionId,
                    manifestRevision = manifestRevision,
                    marketCode = marketCode,
                    manifestId = manifestId,
                    errorCode = "invalid_target",
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
                        manifestId = manifestId,
                    ),
                )
                onAction(target)
            },
        colors = CardDefaults.cardColors(containerColor = runtimeTokens.backgroundColor(darkTheme)),
        shape = RoundedCornerShape(runtimeTokens.cornerRadius),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(runtimeTokens.contentPadding),
            horizontalArrangement = Arrangement.spacedBy(runtimeTokens.itemSpacing),
        ) {
            if (!imageFailed && !assetPath.isNullOrBlank()) {
                AsyncImage(
                    model = assetPath,
                    contentDescription = item.altLabel ?: item.title,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(78.dp),
                    onError = {
                        imageFailed = true
                        if (!imageFailureReported) {
                            imageFailureReported = true
                            onEvent(
                                ExperienceBannerEvent(
                                    type = ExperienceBannerEventType.ASSET_BROKEN,
                                    component = "asset",
                                    campaignId = item.campaignId,
                                    sectionId = sectionId,
                                    manifestRevision = manifestRevision,
                                    marketCode = marketCode,
                                    manifestId = manifestId,
                                    errorCode = "image_load_failed",
                                ),
                            )
                        }
                    },
                )
            } else {
                Surface(
                    modifier = Modifier.size(78.dp),
                    shape = RoundedCornerShape(runtimeTokens.innerCornerRadius),
                    color = accentColor.copy(alpha = 0.14f),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.LocalOffer, contentDescription = "", modifier = Modifier.size(30.dp))
                    }
                }
            }
            Column(Modifier.weight(1f)) {
                if (runtimeTokens.badgePreset != RuntimeBadgePreset.HIDDEN) {
                    item.badge?.let {
                        if (runtimeTokens.badgePreset == RuntimeBadgePreset.PILL) {
                            Surface(
                                shape = RoundedCornerShape(50.dp),
                                color = accentColor,
                            ) {
                                Text(
                                    it,
                                    color = accentContentColor,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                )
                            }
                        } else {
                            Text(it, color = accentColor, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        Spacer(Modifier.height(4.dp))
                    }
                }
                Text(item.title, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                item.body?.let {
                    Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
                if (hasAction && !item.ctaLabel.isNullOrBlank()) {
                    Spacer(Modifier.height(runtimeTokens.itemSpacing))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(item.ctaLabel, color = accentColor, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Icon(Icons.Default.ArrowForward, contentDescription = "", modifier = Modifier.size(14.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun Modifier.clickableIf(enabled: Boolean, onClick: () -> Unit): Modifier =
    if (enabled) clickable(onClick = onClick) else this
