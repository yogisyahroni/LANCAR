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
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.ui.components.getServiceIcon
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
    onDeepLink: (String) -> Unit,
    onHistoryClick: () -> Unit,
    onFavoritesClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val renderableSections = collectRenderableSections(snapshot.manifest.sections) { component ->
        ExperienceRenderTelemetry.unknownComponent(component, snapshot.manifest.revision)
    }
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        renderableSections.forEach { section ->
            when (section.component) {
                "hero_banner" -> DynamicHeroBanner(section, onDeepLink)
                "campaign_strip" -> DynamicCampaignStrip(section, onDeepLink)
                "promo_carousel" -> DynamicPromoCarousel(section, onDeepLink)
                "service_grid" -> DynamicServiceGrid(
                    section = section,
                    services = services,
                    onServiceClick = onServiceClick,
                )
                "quick_actions" -> DynamicQuickActions(section, onDeepLink, onHistoryClick, onFavoritesClick)
                "info_card" -> DynamicInfoCard(section, onDeepLink)
                "notice" -> DynamicNotice(section, onDeepLink)
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
private fun DynamicHeroBanner(section: ExperienceSection, onDeepLink: (String) -> Unit) {
    val properties = section.properties
    DynamicTextCard(
        title = properties.string("title") ?: return,
        body = properties.string("body"),
        icon = Icons.Default.Campaign,
        deepLink = properties.string("deep_link"),
        ctaLabel = properties.string("cta_label"),
        onDeepLink = onDeepLink,
        containerColor = MaterialTheme.colorScheme.primaryContainer,
    )
}

@Composable
private fun DynamicCampaignStrip(section: ExperienceSection, onDeepLink: (String) -> Unit) {
    val properties = section.properties
    DynamicTextCard(
        title = properties.string("title") ?: return,
        body = properties.string("body"),
        icon = Icons.Default.Star,
        deepLink = properties.string("deep_link"),
        ctaLabel = properties.string("cta_label"),
        onDeepLink = onDeepLink,
        containerColor = MaterialTheme.colorScheme.secondaryContainer,
    )
}

@Composable
private fun DynamicPromoCarousel(section: ExperienceSection, onDeepLink: (String) -> Unit) {
    val items = (section.properties["items"] as? JsonArray).orEmpty().mapNotNull { value ->
        val item = value as? JsonObject ?: return@mapNotNull null
        Triple(item.string("title"), item.string("body"), item.string("deep_link"))
    }
    if (items.isEmpty()) return
    Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp)) {
        Text("Untuk kamu", fontSize = 18.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.height(8.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            items(items) { item ->
                Card(
                    modifier = Modifier
                        .fillParentMaxWidth(0.78f)
                        .clickable(enabled = item.third != null) { item.third?.let(onDeepLink) },
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                    shape = RoundedCornerShape(18.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(item.first.orEmpty(), fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        item.second?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, maxLines = 3, overflow = TextOverflow.Ellipsis) }
                    }
                }
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
private fun DynamicInfoCard(section: ExperienceSection, onDeepLink: (String) -> Unit) {
    DynamicTextCard(
        title = section.properties.string("title") ?: return,
        body = section.properties.string("body"),
        icon = Icons.Default.Info,
        deepLink = section.properties.string("deep_link"),
        ctaLabel = null,
        onDeepLink = onDeepLink,
        containerColor = MaterialTheme.colorScheme.surface,
    )
}

@Composable
private fun DynamicNotice(section: ExperienceSection, onDeepLink: (String) -> Unit) {
    DynamicTextCard(
        title = section.properties.string("title") ?: return,
        body = section.properties.string("body"),
        icon = Icons.Default.Info,
        deepLink = section.properties.string("deep_link"),
        ctaLabel = section.properties.string("cta_label"),
        onDeepLink = onDeepLink,
        containerColor = MaterialTheme.colorScheme.tertiaryContainer,
    )
}

@Composable
private fun DynamicQuickActions(
    section: ExperienceSection,
    onDeepLink: (String) -> Unit,
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
                    when (action.second) {
                        "/orders", "lancar://orders" -> onHistoryClick()
                        "/food/favorites", "lancar://food/favorites" -> onFavoritesClick()
                        else -> action.second?.let(onDeepLink)
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
    ctaLabel: String?,
    onDeepLink: (String) -> Unit,
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
            if (deepLink != null && ctaLabel != null) {
                AssistChip(onClick = { onDeepLink(deepLink) }, label = { Text(ctaLabel, maxLines = 1) })
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
