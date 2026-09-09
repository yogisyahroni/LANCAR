package com.tembus.customer.ui.experience.components

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
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
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
import com.tembus.customer.ui.theme.LocalRuntimeDesignTokens
import com.tembus.customer.ui.theme.RuntimeBadgePreset
import com.tembus.customer.ui.theme.TembusRadius

@Composable
internal fun DynamicHeaderBanner(
    component: String,
    campaignId: String,
    sectionId: String,
    manifestRevision: Int,
    marketCode: String,
    title: String,
    body: String?,
    badge: String?,
    ctaLabel: String?,
    deepLink: String?,
    externalUrl: String?,
    imageAssetId: String?,
    resolveAssetPath: suspend (String) -> String?,
    onAction: (RemoteDeepLinkTarget) -> Unit,
    onEvent: (ExperienceBannerEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val runtimeTokens = LocalRuntimeDesignTokens.current
    val darkTheme = isSystemInDarkTheme()
    val accentColor = runtimeTokens.accentColor(darkTheme)
    val accentContentColor = runtimeTokens.accentContentColor(darkTheme)
    val assetPath by produceState<String?>(initialValue = null, imageAssetId, manifestRevision) {
        value = imageAssetId?.let { resolveAssetPath(it) }
    }
    var imageFailed by remember(assetPath) { mutableStateOf(false) }
    val target = remember(deepLink, externalUrl) {
        RemoteDeepLinkResolver.resolve(deepLink, externalUrl)
    }
    val hasAction = target !is RemoteDeepLinkTarget.Invalid && !ctaLabel.isNullOrBlank()

    LaunchedEffect(component, campaignId, sectionId, manifestRevision) {
        if (manifestRevision > 0 && campaignId.isNotBlank()) {
            onEvent(
                ExperienceBannerEvent(
                    type = ExperienceBannerEventType.IMPRESSION,
                    component = component,
                    campaignId = campaignId,
                    sectionId = sectionId,
                    manifestRevision = manifestRevision,
                    marketCode = marketCode,
                ),
            )
        }
    }

    Card(
        modifier = modifier.fillMaxWidth().padding(horizontal = 18.dp),
        shape = RoundedCornerShape(runtimeTokens.cornerRadius),
        colors = CardDefaults.cardColors(containerColor = runtimeTokens.backgroundColor(darkTheme)),
    ) {
        Column(Modifier.fillMaxWidth().padding(runtimeTokens.contentPadding)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (!imageFailed && !assetPath.isNullOrBlank()) {
                    AsyncImage(
                        model = assetPath,
                        contentDescription = title,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(76.dp),
                        onError = { imageFailed = true },
                    )
                } else {
                    Surface(
                        modifier = Modifier.size(76.dp),
                        shape = RoundedCornerShape(runtimeTokens.innerCornerRadius),
                        color = accentColor.copy(alpha = 0.12f),
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Campaign, contentDescription = null, modifier = Modifier.size(32.dp))
                        }
                    }
                }
                Column(Modifier.weight(1f)) {
                    if (runtimeTokens.badgePreset != RuntimeBadgePreset.HIDDEN) {
                        badge?.let {
                            if (runtimeTokens.badgePreset == RuntimeBadgePreset.LABEL) {
                                Text(it, color = accentColor, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            } else {
                                Surface(
                                    shape = RoundedCornerShape(TembusRadius.Chip),
                                    color = accentColor,
                                ) {
                                    Text(
                                        text = it,
                                        color = accentContentColor,
                                        fontSize = 10.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            }
                            Spacer(Modifier.height(6.dp))
                        }
                    }
                    Text(title, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    body?.let {
                        Text(
                            it,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp,
                            maxLines = 3,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
            if (hasAction) {
                Spacer(Modifier.height(runtimeTokens.itemSpacing))
                AssistChip(
                    onClick = {
                        onEvent(
                            ExperienceBannerEvent(
                                type = ExperienceBannerEventType.CLICK,
                                component = component,
                                campaignId = campaignId,
                                sectionId = sectionId,
                                manifestRevision = manifestRevision,
                                marketCode = marketCode,
                            ),
                        )
                        onAction(target)
                    },
                    label = { Text(ctaLabel.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    trailingIcon = { Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp)) },
                    colors = AssistChipDefaults.assistChipColors(
                        containerColor = accentColor,
                        labelColor = accentContentColor,
                        trailingIconContentColor = accentContentColor,
                    ),
                )
            }
        }
    }
}
