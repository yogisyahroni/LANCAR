package com.tembus.customer.ui.experience

import android.util.Log
import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.config.model.ExperienceSection
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.data.config.ExperienceBannerEventType
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.ui.components.getServiceIcon
import com.tembus.customer.ui.experience.components.DynamicHeaderBanner
import com.tembus.customer.ui.experience.components.DynamicPromoCard
import com.tembus.customer.ui.experience.components.DynamicPromoCardModel
import com.tembus.customer.ui.navigation.RemoteDeepLinkResolver
import com.tembus.customer.ui.navigation.RemoteDeepLinkTarget
import com.tembus.customer.ui.navigation.RemoteInternalDestination
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

private val RENDERABLE_COMPONENTS = setOf(
    "hero_banner",
    "campaign_strip",
    "promo_carousel",
    "service_grid",
    "quick_actions",
    "info_card",
    "notice",
    "spacer",
)
private val NON_HOME_COMPONENTS = setOf("campaign_intro")

internal fun isDynamicComponentSupported(component: String): Boolean = component in RENDERABLE_COMPONENTS

internal fun collectRenderableSections(
    sections: List<ExperienceSection>,
    onUnknownComponent: (String) -> Unit,
): List<ExperienceSection> = sections.mapNotNull { section ->
    if (isDynamicComponentSupported(section.component)) section
    else if (section.component in NON_HOME_COMPONENTS) null
    else {
        onUnknownComponent(section.component)
        null
    }
}

internal data class DynamicServicePresentation(
    val service: DeliveryServiceProduct,
    val subtitle: String?,
    val badge: String?,
)

/**
 * Native-only renderer for the presentation manifest. It deliberately has no
 * WebView/eval/reflection path. Every remote section is mapped to a compiled
 * composable, and service cards are intersected with the authoritative API
 * response before they become clickable.
 */
@Composable
fun DynamicHomeRenderer(
    snapshot: ExperienceConfigSnapshot,
    services: List<DeliveryServiceProduct>,
    onServiceClick: (String) -> Unit,
    onRemoteAction: (RemoteDeepLinkTarget) -> Unit,
    onBannerEvent: (ExperienceBannerEvent) -> Unit,
    resolveAssetPath: suspend (String) -> String? = { null },
    onHistoryClick: () -> Unit,
    onFavoritesClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val renderableSections = collectRenderableSections(snapshot.manifest.sections) { component ->
        ExperienceRenderTelemetry.unknownComponent(component, snapshot.manifest.revision)
    }
    val reportedImpressions = remember(snapshot.manifest.manifestId, snapshot.manifest.revision) { mutableSetOf<String>() }
    val reportEvent: (ExperienceBannerEvent) -> Unit = { event ->
        if (event.type == ExperienceBannerEventType.IMPRESSION) {
            val key = "${event.component}|${event.sectionId}|${event.campaignId}"
            if (reportedImpressions.add(key)) onBannerEvent(event)
        } else {
            onBannerEvent(event)
        }
    }
    val marketCode = snapshot.scope?.marketCode ?: snapshot.manifest.marketCode
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        renderableSections.forEach { section ->
            when (section.component) {
                "hero_banner" -> DynamicHeaderBanner(
                    component = section.component,
                    campaignId = section.properties.string("campaign_id") ?: section.id,
                    sectionId = section.id,
                    manifestRevision = snapshot.manifest.revision,
                    marketCode = marketCode,
                    title = section.properties.string("title") ?: return@forEach,
                    body = section.properties.string("body"),
                    badge = section.properties.string("badge"),
                    ctaLabel = section.properties.string("cta_label"),
                    deepLink = section.properties.string("deep_link"),
                    externalUrl = section.properties.string("external_url"),
                    imageAssetId = section.properties.string("image_asset_id"),
                    resolveAssetPath = resolveAssetPath,
                    onAction = onRemoteAction,
                    onEvent = reportEvent,
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                )
                "campaign_strip" -> DynamicHeaderBanner(
                    component = section.component,
                    campaignId = section.properties.string("campaign_id") ?: section.id,
                    sectionId = section.id,
                    manifestRevision = snapshot.manifest.revision,
                    marketCode = marketCode,
                    title = section.properties.string("title") ?: return@forEach,
                    body = section.properties.string("body"),
                    badge = section.properties.string("badge"),
                    ctaLabel = section.properties.string("cta_label"),
                    deepLink = section.properties.string("deep_link"),
                    externalUrl = section.properties.string("external_url"),
                    imageAssetId = section.properties.string("image_asset_id"),
                    resolveAssetPath = resolveAssetPath,
                    onAction = onRemoteAction,
                    onEvent = reportEvent,
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                )
                "promo_carousel" -> DynamicPromoCarousel(
                    section = section,
                    snapshot = snapshot,
                    marketCode = marketCode,
                    resolveAssetPath = resolveAssetPath,
                    onAction = onRemoteAction,
                    onEvent = reportEvent,
                )
                "service_grid" -> DynamicServiceGrid(
                    section = section,
                    services = services,
                    onServiceClick = onServiceClick,
                )
                "quick_actions" -> DynamicQuickActions(section, onRemoteAction, onHistoryClick, onFavoritesClick)
                "info_card" -> DynamicInfoCard(section, onRemoteAction)
                "notice" -> DynamicNotice(section, onRemoteAction)
                "spacer" -> DynamicSpacer(section)
            }
        }
    }
}

internal fun resolveDynamicServices(
    properties: JsonObject,
    services: List<DeliveryServiceProduct>,
): List<DynamicServicePresentation> {
    val available = services
        .filter { it.isEnabled }
        .associateBy { it.code.trim().lowercase() }
    val cards = properties["cards"] as? JsonArray
    val cardByCode = cards.orEmpty().mapNotNull { value ->
        val card = value as? JsonObject ?: return@mapNotNull null
        val code = card.string("code")?.lowercase() ?: return@mapNotNull null
        code to (card.string("subtitle") to card.string("badge"))
    }.toMap()
    val configuredCodes = if (cards != null) {
        cardByCode.keys.toList()
    } else {
        properties.stringArray("service_codes")
    }
    return configuredCodes.distinct().mapNotNull { code ->
        val service = available[code] ?: return@mapNotNull null
        val presentation = cardByCode[code]
        DynamicServicePresentation(
            service = service,
            subtitle = presentation?.first ?: service.description.takeIf { it.isNotBlank() },
            badge = presentation?.second,
        )
    }
}

@Composable
private fun DynamicPromoCarousel(
    section: ExperienceSection,
    snapshot: ExperienceConfigSnapshot,
    marketCode: String,
    resolveAssetPath: suspend (String) -> String?,
    onAction: (RemoteDeepLinkTarget) -> Unit,
    onEvent: (ExperienceBannerEvent) -> Unit,
) {
    val promoItems = (section.properties["items"] as? JsonArray).orEmpty().mapNotNull { value ->
        val item = value as? JsonObject ?: return@mapNotNull null
        DynamicPromoCardModel(
            id = item.string("id") ?: return@mapNotNull null,
            campaignId = item.string("campaign_id") ?: item.string("id") ?: return@mapNotNull null,
            title = item.string("title") ?: return@mapNotNull null,
            body = item.string("body"),
            badge = item.string("badge"),
            imageAssetId = item.string("image_asset_id"),
            ctaLabel = item.string("cta_label"),
            deepLink = item.string("deep_link"),
            externalUrl = item.string("external_url"),
        )
    }
    if (promoItems.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp)) {
        Text("Untuk kamu", fontSize = 18.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(promoItems, key = { it.id }) { item ->
                DynamicPromoCard(
                    item = item,
                    sectionId = section.id,
                    manifestRevision = snapshot.manifest.revision,
                    marketCode = marketCode,
                    resolveAssetPath = resolveAssetPath,
                    onAction = onAction,
                    onEvent = onEvent,
                    modifier = Modifier.fillParentMaxWidth(0.78f),
                )
            }
        }
    }
}

@Composable
private fun DynamicServiceGrid(
    section: ExperienceSection,
    services: List<DeliveryServiceProduct>,
    onServiceClick: (String) -> Unit,
) {
    val properties = section.properties
    val presentations = resolveDynamicServices(properties, services)
    if (presentations.isEmpty()) return
    val compact = properties.string("display_mode") == "compact"
    Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp)) {
        Text(
            properties.string("title") ?: "Layanan TEMBUS",
            fontSize = 20.sp,
            fontWeight = FontWeight.Black,
        )
        Spacer(Modifier.height(8.dp))
        presentations.chunked(3).forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                row.forEach { presentation ->
                    DynamicServiceCard(
                        presentation = presentation,
                        compact = compact,
                        onClick = { onServiceClick(presentation.service.code) },
                        modifier = Modifier.weight(1f),
                    )
                }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
            Spacer(Modifier.height(10.dp))
        }
    }
}

@Composable
private fun DynamicServiceCard(
    presentation: DynamicServicePresentation,
    compact: Boolean,
    onClick: () -> Unit,
    modifier: Modifier,
) {
    val service = presentation.service
    Card(
        modifier = modifier
            .height(if (compact) 96.dp else 132.dp)
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Box(Modifier.fillMaxWidth()) {
            Column(
                Modifier.fillMaxWidth().padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(getServiceIcon(service.code), contentDescription = service.name, modifier = Modifier.size(28.dp))
                Spacer(Modifier.height(6.dp))
                Text(service.name, fontWeight = FontWeight.Bold, fontSize = 12.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (!compact) {
                    presentation.subtitle?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
                }
            }
            presentation.badge?.let {
                AssistChip(
                    onClick = onClick,
                    label = { Text(it, fontSize = 9.sp) },
                    modifier = Modifier.align(Alignment.TopEnd).padding(4.dp),
                )
            }
        }
    }
}

@Composable
private fun DynamicInfoCard(section: ExperienceSection, onAction: (RemoteDeepLinkTarget) -> Unit) {
    DynamicTextCard(
        title = section.properties.string("title") ?: return,
        body = section.properties.string("body"),
        icon = Icons.Default.Info,
        deepLink = section.properties.string("deep_link"),
        ctaLabel = null,
        externalUrl = null,
        onAction = onAction,
        containerColor = MaterialTheme.colorScheme.surface,
    )
}

@Composable
private fun DynamicNotice(section: ExperienceSection, onAction: (RemoteDeepLinkTarget) -> Unit) {
    DynamicTextCard(
        title = section.properties.string("title") ?: return,
        body = section.properties.string("body"),
        icon = Icons.Default.Info,
        deepLink = section.properties.string("deep_link"),
        ctaLabel = section.properties.string("cta_label"),
        externalUrl = section.properties.string("external_url"),
        onAction = onAction,
        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
    )
}

@Composable
private fun DynamicQuickActions(
    section: ExperienceSection,
    onAction: (RemoteDeepLinkTarget) -> Unit,
    onHistoryClick: () -> Unit,
    onFavoritesClick: () -> Unit,
) {
    val actions = (section.properties["actions"] as? JsonArray).orEmpty().mapNotNull { value ->
        val action = value as? JsonObject ?: return@mapNotNull null
        action.string("label") to action.string("deep_link")
    }
    if (actions.isEmpty()) return
    Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        actions.take(4).forEach { action ->
            AssistChip(
                onClick = {
                    val target = action.second?.let { RemoteDeepLinkResolver.resolve(it, null) }
                        ?: RemoteDeepLinkTarget.Invalid
                    when (target) {
                        RemoteDeepLinkTarget.Internal(RemoteInternalDestination.ORDERS) -> onHistoryClick()
                        RemoteDeepLinkTarget.Internal(RemoteInternalDestination.FOOD_FAVORITES) -> onFavoritesClick()
                        else -> onAction(target)
                    }
                },
                label = { Text(action.first.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                leadingIcon = { Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp)) },
            )
        }
    }
}

@Composable
private fun DynamicTextCard(
    title: String,
    body: String?,
    icon: ImageVector,
    deepLink: String?,
    externalUrl: String?,
    ctaLabel: String?,
    onAction: (RemoteDeepLinkTarget) -> Unit,
    containerColor: Color,
) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor),
    ) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(28.dp))
            Spacer(Modifier.size(12.dp))
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                body?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, maxLines = 4, overflow = TextOverflow.Ellipsis) }
            }
            if ((!deepLink.isNullOrBlank() || !externalUrl.isNullOrBlank()) && ctaLabel != null) {
                AssistChip(
                    onClick = { onAction(RemoteDeepLinkResolver.resolve(deepLink, externalUrl)) },
                    label = { Text(ctaLabel, maxLines = 1) },
                )
            }
        }
    }
}

@Composable
private fun DynamicSpacer(section: ExperienceSection) {
    val height = when (section.properties.string("size")) {
        "small" -> 6.dp
        "large" -> 28.dp
        else -> 14.dp
    }
    Spacer(Modifier.height(height))
}

private fun JsonObject.string(key: String): String? =
    (this[key] as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

private fun JsonObject.stringArray(key: String): List<String> =
    (this[key] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf(String::isNotEmpty) }

private object ExperienceRenderTelemetry {
    fun unknownComponent(component: String, revision: Int) {
        Log.w("ExperienceRenderer", "event=unknown_component component=$component revision=$revision")
    }
}
