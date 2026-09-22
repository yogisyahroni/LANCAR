package com.tembus.customer.ui.screens.main

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import androidx.compose.material3.Text as MaterialText
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import coil.compose.AsyncImage
import com.tembus.customer.data.config.model.ExperienceSection
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.data.config.ExperienceBannerEventType
import com.tembus.customer.ui.navigation.RemoteDeepLinkResolver
import com.tembus.customer.ui.navigation.RemoteDeepLinkTarget
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.R
import com.tembus.customer.data.model.GlobalBanner
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.data.model.CustomerEligiblePromo
import com.tembus.customer.ui.localization.CustomerTextCatalog
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.BrandHeader
import com.tembus.customer.ui.theme.CustomerHomeCanvas
import com.tembus.customer.ui.theme.OnOrangeCta
import com.tembus.customer.ui.theme.OrangeCta
import com.tembus.customer.ui.theme.Error
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.TembusCopy
import com.tembus.customer.ui.theme.PrimaryDark
import com.tembus.customer.ui.components.TembusServiceIcons
import com.tembus.customer.ui.theme.TembusRadius

internal fun compactUnreadCount(count: Int): String = if (count > 9) "9+" else count.toString()

@Composable
internal fun TembusBrandHeaderRow(
    customerName: String,
    locationLabel: String?,
    modifier: Modifier = Modifier,
) {
    // DESIGN.md §12: dark green brand header — wordmark + sapaan + lokasi.
    // Alasan: Home menjawab "saya di mana & bisa apa" sebelum konten lain.
    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    val greetingId = when (hour) {
        in 4..10 -> "Selamat pagi"
        in 11..14 -> "Selamat siang"
        in 15..18 -> "Selamat sore"
        else -> "Selamat malam"
    }
    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 20.dp)) {
        Text(
            text = TembusCopy.BrandName,
            color = Color.White,
            fontSize = 20.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.5.sp,
        )
        Spacer(Modifier.height(2.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = greetingId,
                color = Color.White.copy(alpha = 0.85f),
                fontSize = 13.sp,
            )
            Text(
                text = ", $customerName",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
        }
        if (!locationLabel.isNullOrBlank()) {
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    Icons.Default.LocationOn,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.85f),
                    modifier = Modifier.size(14.dp)
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = locationLabel,
                    color = Color.White.copy(alpha = 0.85f),
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.height(8.dp))
    }
}

@Composable
internal fun TembusBrandMark(modifier: Modifier = Modifier) {    Image(
        painter = painterResource(id = R.drawable.tembus_home_logo),
        contentDescription = "TEMBUS",
        contentScale = ContentScale.Fit,
        modifier = modifier,
    )
}

@Composable
internal fun DashboardSectionHeader(title: String, subtitle: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Ink, fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(subtitle, color = Muted, fontSize = 12.sp)
        }
    }
}

@Composable
internal fun TembusHomeTopBar(
    customerName: String,
    notificationUnreadCount: Int,
    onNotificationsClick: () -> Unit,
    onProfileClick: () -> Unit,
    onSearchClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Surface(
            modifier = Modifier
                .weight(1f)
                .height(44.dp)
                .clickable(role = Role.Button, onClick = onSearchClick)
                .semantics {
                    contentDescription = "$customerName. Cari layanan atau pesanan"
                    role = Role.Button
                },
            shape = RoundedCornerShape(22.dp),
            color = MaterialTheme.colorScheme.surface,
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            shadowElevation = 2.dp
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(horizontal = 16.dp)
            ) {
                Icon(Icons.Default.Search, contentDescription = CustomerTextCatalog.translate("Search"), tint = Primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text("Cari layanan, makanan...", color = Muted, fontSize = 14.sp)
            }
        }
        Spacer(Modifier.width(10.dp))
        Box(contentAlignment = Alignment.TopEnd) {
            IconButton(
                onClick = onNotificationsClick,
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.22f))
                    .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.35f)), CircleShape)
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = CustomerTextCatalog.translate("Notifikasi"), tint = Color.White, modifier = Modifier.size(22.dp))
            }
            if (notificationUnreadCount > 0) {
                Box(
                    modifier = Modifier.size(18.dp).clip(CircleShape).background(Accent),
                    contentAlignment = Alignment.Center
                ) {
                    Text(compactUnreadCount(notificationUnreadCount), color = MaterialTheme.colorScheme.onTertiary, fontSize = 10.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Spacer(Modifier.width(8.dp))
        IconButton(
            onClick = onProfileClick,
            modifier = Modifier
                .sizeIn(minWidth = 44.dp, minHeight = 44.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.22f))
                .border(BorderStroke(1.dp, Color.White.copy(alpha = 0.35f)), CircleShape)
        ) {
            Icon(Icons.Default.Person, contentDescription = CustomerTextCatalog.translate("Profil"), tint = Color.White)
        }
    }
}

@Composable
internal fun HomeHeroPromoBanner(
    heroSection: ExperienceSection?,
    hasBannerImage: Boolean,
    manifestRevision: Int,
    marketCode: String,
    manifestId: String?,
    resolveAssetPath: suspend (String) -> String?,
    onRemoteAction: (RemoteDeepLinkTarget) -> Unit,
    onBannerEvent: (ExperienceBannerEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val section = heroSection ?: return
    val isCms = true
    val properties = section.properties
    val title = (properties["title"] as? JsonPrimitive)?.contentOrNull
        ?.takeIf { it.isNotBlank() }
        ?: return
    val body = (properties["body"] as? JsonPrimitive)?.contentOrNull
        ?.takeIf { it.isNotBlank() }
    val badge = (properties["badge"] as? JsonPrimitive)?.contentOrNull
        ?.takeIf { it.isNotBlank() }
        ?: return
    val ctaLabel = (properties["cta_label"] as? JsonPrimitive)?.contentOrNull
        ?.takeIf { it.isNotBlank() }
        ?: return
    val deepLink = (properties["deep_link"] as? JsonPrimitive)?.contentOrNull
    val externalUrl = (properties["external_url"] as? JsonPrimitive)?.contentOrNull
    val imageAssetId = (properties["image_asset_id"] as? JsonPrimitive)?.contentOrNull
    val campaignId = (properties["campaign_id"] as? JsonPrimitive)?.contentOrNull
        ?.takeIf { it.isNotBlank() }
        ?: section.id

    val assetPath by produceState<String?>(initialValue = null, imageAssetId, manifestRevision) {
        value = imageAssetId?.let { resolveAssetPath(it) }
    }
    var imageFailed by remember(assetPath) { mutableStateOf(false) }

    val target = remember(deepLink, externalUrl) {
        if (!deepLink.isNullOrBlank() || !externalUrl.isNullOrBlank()) {
            RemoteDeepLinkResolver.resolve(deepLink, externalUrl)
        } else {
            null
        }
    }

    LaunchedEffect(campaignId, manifestRevision) {
        if (isCms && manifestRevision > 0) {
            onBannerEvent(
                ExperienceBannerEvent(
                    type = ExperienceBannerEventType.IMPRESSION,
                    component = "hero_banner",
                    campaignId = campaignId,
                    sectionId = section.id,
                    manifestRevision = manifestRevision,
                    marketCode = marketCode,
                    manifestId = manifestId,
                )
            )
        }
    }

    if (hasBannerImage) {
        // When marketing uploads a designed banner graphic,
        // the banner image itself already contains the artwork, marketing typography, and badges.
        // We provide a dedicated interactive banner area linking directly to the promo target.
        Box(
            modifier = modifier
                .fillMaxWidth()
                .height(130.dp)
                .padding(horizontal = 16.dp, vertical = 4.dp)
                .clip(RoundedCornerShape(16.dp))
                .clickable(role = Role.Button) {
                    if (isCms && manifestRevision > 0) {
                        onBannerEvent(
                            ExperienceBannerEvent(
                                type = ExperienceBannerEventType.CLICK,
                                component = "hero_banner",
                                campaignId = campaignId,
                                sectionId = section.id,
                                manifestRevision = manifestRevision,
                                marketCode = marketCode,
                                manifestId = manifestId,
                            )
                        )
                    }
                    if (target != null && target !is RemoteDeepLinkTarget.Invalid) {
                        onRemoteAction(target)
                    }
                }
        )
    } else {
        // Fallback when NO banner image is uploaded: Show composed text + CTA button
        Row(
            modifier = modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
        Column(
            modifier = Modifier
                .weight(1.3f)
                .padding(end = 12.dp)
        ) {
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = Color.White.copy(alpha = 0.22f),
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.38f)),
            ) {
                Text(
                    text = badge,
                    color = Color.White,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.ExtraBold,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 3.dp)
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                lineHeight = 22.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            if (!body.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = body,
                    color = Color.White.copy(alpha = 0.88f),
                    fontSize = 12.sp,
                    lineHeight = 15.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Spacer(Modifier.height(10.dp))
            Button(
                onClick = {
                    if (isCms && manifestRevision > 0) {
                        onBannerEvent(
                            ExperienceBannerEvent(
                                type = ExperienceBannerEventType.CLICK,
                                component = "hero_banner",
                                campaignId = campaignId,
                                sectionId = section.id,
                                manifestRevision = manifestRevision,
                                marketCode = marketCode,
                                manifestId = manifestId,
                            )
                        )
                    }
                    if (target != null && target !is RemoteDeepLinkTarget.Invalid) {
                        onRemoteAction(target)
                    }
                },
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color(0xFFD4F73C),
                    contentColor = Color(0xFF003822)
                ),
                shape = RoundedCornerShape(999.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 6.dp),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp),
                modifier = Modifier.height(34.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        ctaLabel,
                        color = Color(0xFF003822),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Black
                    )
                    Spacer(Modifier.width(4.dp))
                    Icon(
                        Icons.Default.ArrowForward,
                        contentDescription = "",
                        tint = Color(0xFF003822),
                        modifier = Modifier.size(13.dp)
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = "*S&K Berlaku",
                color = Color.White.copy(alpha = 0.65f),
                fontSize = 9.sp
            )
        }

        if (!imageFailed && !assetPath.isNullOrBlank()) {
            AsyncImage(
                model = assetPath,
                contentDescription = title,
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .size(96.dp)
                    .clip(RoundedCornerShape(16.dp)),
                onError = { imageFailed = true }
            )
        } else {
            Surface(
                modifier = Modifier.size(86.dp),
                shape = RoundedCornerShape(20.dp),
                color = Color.White.copy(alpha = 0.15f),
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.28f))
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = Icons.Default.LocalShipping,
                        contentDescription = "",
                        tint = Color.White,
                        modifier = Modifier.size(46.dp)
                    )
                }
            }
        }
    }
    }
}

@Composable
internal fun UnifiedHeroHeader(
    customerName: String,
    notificationUnreadCount: Int,
    heroSection: ExperienceSection?,
    manifestRevision: Int,
    marketCode: String,
    manifestId: String?,
    resolveAssetPath: suspend (String) -> String?,
    onNotificationsClick: () -> Unit,
    onProfileClick: () -> Unit,
    onSearchClick: () -> Unit,
    onRemoteAction: (RemoteDeepLinkTarget) -> Unit,
    onBannerEvent: (ExperienceBannerEvent) -> Unit,
    modifier: Modifier = Modifier,
    networkBanner: @Composable () -> Unit = {},
    // DESIGN.md §12: label lokasi terbalik-geocode (null = sembunyikan baris).
    locationLabel: String? = null,
    walletBalance: Long? = null,
) {
    val properties = heroSection?.properties
    val customBgColorHex = (properties?.get("background_color") as? JsonPrimitive)?.contentOrNull
    val bgImageAssetId = (properties?.get("background_image_asset_id") as? JsonPrimitive)?.contentOrNull
    val rawBgImageUrl = (properties?.get("background_image_url") as? JsonPrimitive)?.contentOrNull
        ?: (properties?.get("image_url") as? JsonPrimitive)?.contentOrNull
        ?: (properties?.get("banner_image_url") as? JsonPrimitive)?.contentOrNull

    val bgImageUrl = remember(rawBgImageUrl) {
        if (rawBgImageUrl != null && rawBgImageUrl.startsWith("/")) {
            "http://10.0.2.2:8080$rawBgImageUrl"
        } else {
            rawBgImageUrl
        }
    }

    val bgAssetPath by produceState<String?>(initialValue = null, bgImageAssetId, bgImageUrl, manifestRevision) {
        value = bgImageAssetId?.let { resolveAssetPath(it) } ?: bgImageUrl
    }
    var bgImageFailed by remember(bgAssetPath) { mutableStateOf(false) }
    val hasBannerImage = !bgImageFailed && !bgAssetPath.isNullOrBlank()

    val fallbackColor = if (hasBannerImage) Color(0xFF141715) else BrandHeader
    val baseThemeColor = remember(customBgColorHex, hasBannerImage) {
        if (!customBgColorHex.isNullOrBlank()) {
            try {
                Color(android.graphics.Color.parseColor(customBgColorHex))
            } catch (_: Exception) {
                fallbackColor
            }
        } else {
            fallbackColor
        }
    }

    val darkThemeColor = remember(baseThemeColor) {
        Color(
            red = (baseThemeColor.red * 0.65f).coerceIn(0f, 1f),
            green = (baseThemeColor.green * 0.65f).coerceIn(0f, 1f),
            blue = (baseThemeColor.blue * 0.65f).coerceIn(0f, 1f),
            alpha = 1f
        )
    }

    Box(modifier = modifier.fillMaxWidth()) {
        Box(
            modifier = Modifier
                .matchParentSize()
                .padding(bottom = 44.dp)
                .background(
                    brush = Brush.verticalGradient(
                        colors = listOf(
                            baseThemeColor,
                            darkThemeColor,
                        )
                    )
                )
        ) {
            if (hasBannerImage) {
                AsyncImage(
                    model = bgAssetPath,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    alignment = Alignment.TopCenter,
                    modifier = Modifier.matchParentSize(),
                    onError = { bgImageFailed = true }
                )
                Box(
                    modifier = Modifier
                        .matchParentSize()
                        .background(
                            brush = Brush.verticalGradient(
                                colors = listOf(
                                    Color.Black.copy(alpha = 0.25f),
                                    Color.Transparent,
                                    Color.Black.copy(alpha = 0.15f),
                                )
                            )
                        )
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(top = 8.dp)
        ) {
            // DESIGN.md §12: brand header — wordmark + sapaan + lokasi.
            TembusBrandHeaderRow(
                customerName = customerName,
                locationLabel = locationLabel,
            )
            TembusHomeTopBar(
                customerName = customerName,
                notificationUnreadCount = notificationUnreadCount,
                onNotificationsClick = onNotificationsClick,
                onProfileClick = onProfileClick,
                onSearchClick = onSearchClick,
            )
            networkBanner()
            Spacer(Modifier.height(10.dp))
            HomeHeroPromoBanner(
                heroSection = heroSection,
                hasBannerImage = hasBannerImage,
                manifestRevision = manifestRevision,
                marketCode = marketCode,
                manifestId = manifestId,
                resolveAssetPath = resolveAssetPath,
                onRemoteAction = onRemoteAction,
                onBannerEvent = onBannerEvent,
            )
            Spacer(Modifier.height(14.dp))
            WalletCard(balance = walletBalance)
        }
    }
}

/** Compact campaign card matching the customer-home Figma frame. */
@Composable
internal fun FigmaPromoBanner(
    heroSection: ExperienceSection?,
    eligiblePromo: CustomerEligiblePromo?,
    manifestRevision: Int,
    marketCode: String,
    manifestId: String?,
    onRemoteAction: (RemoteDeepLinkTarget) -> Unit,
    onPromoClick: () -> Unit,
    onBannerEvent: (ExperienceBannerEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    // CMS controls presentation copy when a hero manifest is available. The
    // eligible promo remains the authoritative source for campaign data, so
    // this card still renders in a fresh environment where CMS has no hero
    // section yet, without falling back to a Figma sample in the client.
    val properties = heroSection?.properties.orEmpty()
    fun propertyText(key: String): String? = (properties[key] as? JsonPrimitive)?.contentOrNull
        ?.takeIf { it.isNotBlank() }
    val copy = eligiblePromo?.notificationCopy.orEmpty()
    val title = propertyText("title") ?: eligiblePromo?.name?.takeIf { it.isNotBlank() }
        ?: eligiblePromo?.code?.takeIf { it.isNotBlank() }
        ?: return
    val body = propertyText("body")
        ?: copy["body"]?.takeIf { it.isNotBlank() }
        ?: eligiblePromo?.description?.takeIf { it.isNotBlank() }
    // Monetary value is deliberately read only from the eligible campaign.
    // Experience config cannot override transaction economics.
    val price = eligiblePromo?.let(::promoDiscountLabel)
    val badge = propertyText("badge")
        ?: copy["badge"]?.takeIf { it.isNotBlank() }
        ?: eligiblePromo?.code?.takeIf { it.isNotBlank() }
    val ctaLabel = propertyText("cta_label")
        ?: copy["cta_label"]?.takeIf { it.isNotBlank() }
    val deepLink = propertyText("deep_link")
    val externalUrl = propertyText("external_url")
    val campaignId = propertyText("campaign_id")
        ?: eligiblePromo?.id?.takeIf { it.isNotBlank() }
        ?: heroSection?.id
        ?: eligiblePromo?.code
        ?: return
    val sectionId = heroSection?.id ?: "promo_campaign"
    val target = remember(deepLink, externalUrl) {
        if (!deepLink.isNullOrBlank() || !externalUrl.isNullOrBlank()) {
            RemoteDeepLinkResolver.resolve(deepLink, externalUrl)
        } else null
    }

    LaunchedEffect(campaignId, manifestRevision) {
        if (manifestRevision > 0 && heroSection != null) {
            onBannerEvent(
                ExperienceBannerEvent(
                    type = ExperienceBannerEventType.IMPRESSION,
                    component = "hero_banner",
                    campaignId = campaignId,
                    sectionId = sectionId,
                    manifestRevision = manifestRevision,
                    marketCode = marketCode,
                    manifestId = manifestId,
                ),
            )
        }
    }

    val onClick = {
        if (manifestRevision > 0 && heroSection != null) {
            onBannerEvent(
                ExperienceBannerEvent(
                    type = ExperienceBannerEventType.CLICK,
                    component = "hero_banner",
                    campaignId = campaignId,
                    sectionId = sectionId,
                    manifestRevision = manifestRevision,
                    marketCode = marketCode,
                    manifestId = manifestId,
                ),
            )
        }
        if (target != null && target !is RemoteDeepLinkTarget.Invalid) onRemoteAction(target)
        else onPromoClick()
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF003D27)),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        onClick = onClick,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                // Keep the Figma compact baseline, but let the CTA remain
                // fully visible when localized/CMS copy wraps differently.
                .heightIn(min = 176.dp)
                .padding(start = 13.dp, top = 13.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f).padding(end = 6.dp)) {
                badge?.let { label ->
                    Surface(color = OrangeCta, shape = RoundedCornerShape(999.dp)) {
                        Text(
                            label.uppercase(),
                            color = OnOrangeCta,
                            fontSize = 8.sp,
                            fontWeight = FontWeight.Black,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        )
                    }
                }
                if (badge != null) Spacer(Modifier.height(7.dp))
                Text(
                    title,
                    color = Color.White,
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Black,
                    lineHeight = 20.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                price?.let { value ->
                    Text(
                        value,
                        color = OrangeCta,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Black,
                        lineHeight = 20.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 1.dp),
                    )
                }
                body?.let { copy ->
                    Text(
                        copy,
                        color = Color(0xFFA7C4B6),
                        fontSize = 10.sp,
                        lineHeight = 13.sp,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 3.dp),
                    )
                }
                ctaLabel?.let { label ->
                    Spacer(Modifier.height(8.dp))
                    Surface(color = OrangeCta, shape = RoundedCornerShape(999.dp)) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(label, color = OnOrangeCta, fontSize = 10.sp, fontWeight = FontWeight.Black)
                            Spacer(Modifier.width(3.dp))
                            Icon(Icons.Default.ArrowForward, contentDescription = null, tint = OnOrangeCta, modifier = Modifier.size(12.dp))
                        }
                    }
                }
            }
            Box(
                modifier = Modifier
                    .width(100.dp)
                    .fillMaxHeight(),
                contentAlignment = Alignment.Center,
            ) {
                Box(Modifier.size(112.dp).clip(CircleShape).border(8.dp, Color(0xFF1E654A), CircleShape))
                Box(Modifier.size(76.dp).clip(CircleShape).border(7.dp, Color(0xFF1E654A), CircleShape))
                Box(Modifier.size(42.dp).clip(CircleShape).background(Color(0xFF1E654A)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Default.LocalShipping, contentDescription = null, tint = Color(0xFFB8D8C7), modifier = Modifier.size(22.dp))
                }
            }
        }
    }
}

private fun promoDiscountLabel(promo: CustomerEligiblePromo): String? = when {
    promo.discountPercent != null && promo.discountPercent > 0 ->
        "Diskon ${java.math.BigDecimal.valueOf(promo.discountPercent).stripTrailingZeros().toPlainString()}%"
    promo.discountValueIdr > 0 -> "Diskon ${formatPromoIdr(promo.discountValueIdr)}"
    promo.discountType.equals("free_insurance", ignoreCase = true) -> "Gratis proteksi"
    else -> null
}

private fun formatPromoIdr(value: Long): String =
    "Rp ${java.text.NumberFormat.getNumberInstance(java.util.Locale("id", "ID")).format(value.coerceAtLeast(0))}"

/**
 * Customer Home shell from the Figma reference. Keep the CMS hero out of this
 * shell: the reference puts the product chrome, location, search and wallet
 * before the order/service content.
 */
@Composable
internal fun FigmaHomeHeader(
    customerName: String,
    onSearchClick: () -> Unit,
    onWalletTopUpClick: () -> Unit = {},
    onVoucherClick: () -> Unit = {},
    voucherCount: Int? = null,
    networkBanner: @Composable () -> Unit = {},
    locationLabel: String? = null,
    walletBalance: Long? = null,
    showSearchBar: Boolean = true,
    showWalletCard: Boolean = true,
    modifier: Modifier = Modifier,
) {
    val areaLabel = locationLabel
        ?.substringAfterLast(",")
        ?.trim()
        ?.removePrefix("Kecamatan ")
        ?.takeIf { it.isNotBlank() }
        ?: "Pilih area"

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(CustomerHomeCanvas)
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 6.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = TembusCopy.BrandName,
                color = Color(0xFF005E3D),
                fontSize = 16.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 0.3.sp,
            )
            Spacer(Modifier.width(8.dp))
            Surface(
                color = Color(0xFFFFF7F1),
                shape = RoundedCornerShape(999.dp),
                border = BorderStroke(1.dp, OrangeCta.copy(alpha = 0.28f)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.LocationOn, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(12.dp))
                    Spacer(Modifier.width(3.dp))
                    Text(areaLabel, color = Ink, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Spacer(Modifier.height(9.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.LocationOn, contentDescription = null, tint = OrangeCta, modifier = Modifier.size(13.dp))
            Spacer(Modifier.width(4.dp))
            Text("LOKASI ANDA", color = Muted, fontSize = 9.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.4.sp)
            Spacer(Modifier.width(7.dp))
            Text(
                locationLabel ?: "Pilih titik lokasi",
                color = Ink,
                fontSize = 10.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        if (showSearchBar) {
            Spacer(Modifier.height(7.dp))
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(40.dp)
                    .clickable(role = Role.Button, onClick = onSearchClick)
                    .semantics {
                        contentDescription = "$customerName. Cari layanan, makanan, atau lokasi"
                        role = Role.Button
                    },
                color = Color.White,
                shape = RoundedCornerShape(22.dp),
                border = BorderStroke(1.dp, Color(0xFFE2EAE5)),
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 13.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(Icons.Default.Search, contentDescription = null, tint = Color(0xFF507267), modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Cari layanan, makanan, atau lokasi...", color = Muted, fontSize = 11.sp)
                    Spacer(Modifier.weight(1f))
                    Icon(Icons.Default.GridView, contentDescription = null, tint = Color(0xFF006A45), modifier = Modifier.size(14.dp))
                }
            }
        }
        networkBanner()
        if (showWalletCard) {
            Spacer(Modifier.height(7.dp))
            WalletCard(
                balance = walletBalance,
                onTopUpClick = onWalletTopUpClick,
                onVoucherClick = onVoucherClick,
                voucherCount = voucherCount,
            )
        }
    }
}

@Composable
internal fun WalletCard(
    balance: Long?,
    onTopUpClick: () -> Unit = {},
    onVoucherClick: () -> Unit = {},
    voucherCount: Int? = null,
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 0.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF006640)),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 11.dp, vertical = 6.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(Color(0xFFE4F4EC)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = "Saldo TEMBUS-Pay", tint = Color(0xFF006640), modifier = Modifier.size(16.dp))
            }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text("SALDO TEMBUS-PAY", fontWeight = FontWeight.Medium, fontSize = 8.sp, color = Color(0xFFA9D4C0), letterSpacing = 0.4.sp)
                Text(
                    text = balance?.let { "Rp ${formatHomeRupiah(it)}" } ?: "Saldo belum tersedia",
                    fontWeight = FontWeight.Black,
                    fontSize = if (balance == null) 11.sp else 14.sp,
                    color = Color.White,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Surface(
                color = Color(0xFF1B7A59),
                shape = RoundedCornerShape(999.dp),
                modifier = Modifier.clickable(role = Role.Button, onClick = onVoucherClick),
            ) {
                Text(
                    voucherCount?.takeIf { it > 0 }?.let { "$it Voucher" } ?: "Voucher",
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                )
            }
            Spacer(Modifier.width(7.dp))
            Box(
                modifier = Modifier
                    .size(27.dp)
                    .clip(CircleShape)
                    .background(OrangeCta),
                contentAlignment = Alignment.Center,
            ) {
                IconButton(
                    onClick = onTopUpClick,
                    modifier = Modifier.size(27.dp),
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Top up saldo", tint = OnOrangeCta, modifier = Modifier.size(17.dp))
                }
            }
        }
    }
}

private fun formatHomeRupiah(value: Long): String =
    value.coerceAtLeast(0L).toString().reversed().chunked(3).joinToString(".").reversed()

@Composable
internal fun WalletAction(icon: ImageVector, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier.size(32.dp).clip(RoundedCornerShape(TembusRadius.Button)).background(LcGreen),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = label, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(20.dp))
        }
        Spacer(Modifier.height(4.dp))
        Text(label, fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Ink)
    }
}

@Composable
internal fun TembusHomeServiceGrid(
    onKirimClick: () -> Unit,
    onFoodClick: () -> Unit,
    showFood: Boolean = true,
    onAggregatorClick: () -> Unit,
    onTambalBanClick: () -> Unit,
    onTowingClick: () -> Unit,
    onMoreClick: () -> Unit,
    // LEGACY: single pickup entry (kirim+ambil gabung). Dipertahankan untuk
    // kompatibilitas, tetapi grid baru memakai onKirimClick dan aggregator.
    onPickupClick: (() -> Unit)? = null,
) {
    val goKirim = onPickupClick ?: onKirimClick
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Layanan Utama", color = Ink, fontWeight = FontWeight.Black, fontSize = 14.sp)
            Spacer(Modifier.weight(1f))
            Text("CEPAT & SIAGA", color = OrangeCta, fontWeight = FontWeight.Bold, fontSize = 8.sp)
        }
        Spacer(Modifier.height(8.dp))
        // Customer Home Figma: grid 2x3 — Kirim | Agregator | Food /
        // Tambal | Towing | Lainnya. Ambil Paket tetap tersedia lewat
        // universal search/secondary entry, bukan menggantikan aggregator.
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TembusHomeServiceTile("Kirim Paket", Icons.Default.Send, TembusHomeServiceTone.Primary, goKirim, modifier = Modifier.weight(1f))
            TembusHomeServiceTile("Agregator", Icons.Default.LocalShipping, TembusHomeServiceTone.Primary, onAggregatorClick, modifier = Modifier.weight(1f))
            if (showFood) {
                TembusHomeServiceTile(TembusServiceIcons.Food.label, TembusServiceIcons.Food.icon, TembusHomeServiceTone.Food, onFoodClick, modifier = Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TembusHomeServiceTile(TembusServiceIcons.TambalBan.label, TembusServiceIcons.TambalBan.icon, TembusHomeServiceTone.Emergency, onTambalBanClick, badge = "24 Jam", emergency = true, modifier = Modifier.weight(1f))
            TembusHomeServiceTile(TembusServiceIcons.Towing.label, TembusServiceIcons.Towing.icon, TembusHomeServiceTone.Towing, onTowingClick, badge = "Cepat", emergency = true, modifier = Modifier.weight(1f))
            TembusHomeServiceTile("Lainnya", Icons.Default.GridView, TembusHomeServiceTone.Secondary, onMoreClick, modifier = Modifier.weight(1f))
        }
    }
}

internal enum class TembusHomeServiceTone { Primary, Food, Secondary, Emergency, Towing }

@Composable
internal fun TembusHomeServiceTile(
    label: String,
    icon: ImageVector,
    tone: TembusHomeServiceTone,
    onClick: () -> Unit,
    badge: String? = null,
    emergency: Boolean = false,
    modifier: Modifier = Modifier
) {
    val (bgColor, iconColor) = when (tone) {
        TembusHomeServiceTone.Primary -> Color(0xFFEAF6F0) to Color(0xFF006640)
        TembusHomeServiceTone.Food -> Color(0xFFFFF0E7) to OrangeCta
        TembusHomeServiceTone.Secondary -> Color(0xFFEAF6F0) to Color(0xFF006640)
        TembusHomeServiceTone.Emergency -> Color(0xFFFFF0E7) to Color(0xFFE75B19)
        TembusHomeServiceTone.Towing -> Color(0xFFFFEAE6) to Color(0xFFE2472F)
    }
    Column(
        modifier = modifier
            .height(90.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White)
            .border(1.dp, Color(0xFFE6EEE9), RoundedCornerShape(12.dp))
            .padding(vertical = 6.dp)
            .semantics {
                contentDescription = if (emergency) "$label, layanan darurat" else label
                role = Role.Button
            }
            .clickable(role = Role.Button) { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(32.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(bgColor)
                    .align(Alignment.Center),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = label, tint = iconColor, modifier = Modifier.size(17.dp))
            }
            if (badge != null) {
                Box(
                    modifier = Modifier.align(Alignment.TopEnd),
                ) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(999.dp))
                            .background(OrangeCta)
                            .padding(horizontal = 5.dp, vertical = 2.dp),
                    ) {
                        MaterialText(
                            badge,
                            color = OnOrangeCta,
                            fontSize = 7.sp,
                            lineHeight = 8.sp,
                            fontWeight = FontWeight.Black,
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(4.dp))
        MaterialText(
            text = label,
            fontSize = 9.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
        MaterialText(
            text = when (label.lowercase()) {
                "kirim paket" -> "Instant & Sameday"
                "agregator" -> "Pick-up Driver"
                "food" -> "Kuliner Hangat"
                "tambal ban" -> "Darurat Siaga"
                "towing" -> "Derek Motor/Mobil"
                else -> "Semua Ekspedisi"
            },
            fontSize = 7.sp,
            color = Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
internal fun DashboardDataErrorCard(
    message: String,
    onRetry: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
        border = BorderStroke(1.dp, Accent.copy(alpha = 0.24f))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Warning, contentDescription = "", tint = Accent)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Data sedang disinkronkan", color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp)
                Text(message, color = PrimaryDark, fontSize = 12.sp, lineHeight = 17.sp)
            }
            TextButton(onClick = onRetry) {
                Text("Coba Lagi", fontWeight = FontWeight.ExtraBold)
            }
        }
    }
}

@Composable
internal fun NotificationPermissionPromptCard(
    onEnable: () -> Unit,
    onDismiss: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, SurfaceLine),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(17.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = "", tint = LcGreen)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Aktifkan update kurir", color = Ink, fontWeight = FontWeight.Black, fontSize = 16.sp)
                Text(
                    "Dapatkan alert saat kurir diterima, 5 menit dari lokasi, dan chat baru masuk.",
                    color = Muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp
                )
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = onDismiss) {
                        Text("Nanti", color = Muted, fontWeight = FontWeight.ExtraBold)
                    }
                    Button(
                        onClick = onEnable,
                        colors = ButtonDefaults.buttonColors(containerColor = LcGreen, contentColor = MaterialTheme.colorScheme.onPrimary),
                        shape = RoundedCornerShape(TembusRadius.Button)
                    ) {
                        Text("Aktifkan notifikasi", fontWeight = FontWeight.ExtraBold)
                    }
                }
            }
        }
    }
}

@Composable
internal fun GlobalBannerCard(banners: List<GlobalBanner>) {
    val banner = banners.first()
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        border = BorderStroke(1.dp, Primary.copy(alpha = 0.2f))
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(LcGreen.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.NotificationsActive, contentDescription = "", tint = LcGreen)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(banner.title, color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp)
                if (banner.message.isNotBlank()) {
                    Text(banner.message, color = Muted, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

// ─── DESIGN.md §11.4/§12: hero carousel (dots + 1 CTA, radius 20) ─────────

/**
 * Carousel promo dari daftar banner CMS: 1 CTA per slide, dots pagination,
 * swipe manual. Tidak memblokir Home bila daftar kosong (tampilkan nothing).
 * Alasan (§11.4): memberi ruang ≥1 promo tanpa menumpuk banner statis.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun TembusHeroCarousel(
    banners: List<GlobalBanner>,
    onActionClick: (GlobalBanner) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (banners.isEmpty()) return
    val pagerState = rememberPagerState(pageCount = { banners.size })
    Column(modifier = modifier.fillMaxWidth()) {
        HorizontalPager(
            state = pagerState,
            modifier = Modifier.fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = 18.dp),
            pageSpacing = 12.dp,
        ) { page ->
            val banner = banners[page]
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                border = BorderStroke(1.dp, Primary.copy(alpha = 0.2f)),
                onClick = { onActionClick(banner) },
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (!banner.imageUrl.isNullOrBlank()) {
                        AsyncImage(
                            model = banner.imageUrl,
                            contentDescription = banner.title,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(72.dp)
                                .clip(RoundedCornerShape(16.dp))
                        )
                        Spacer(Modifier.width(12.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Text(banner.title, color = Ink, fontWeight = FontWeight.Black, fontSize = 15.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        if (banner.message.isNotBlank()) {
                            Spacer(Modifier.height(2.dp))
                            Text(banner.message, color = Muted, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        }
                        if (!banner.actionLabel.isNullOrBlank()) {
                            Spacer(Modifier.height(8.dp))
                            TembusMiniCta(label = banner.actionLabel)
                        }
                    }
                }
            }
        }
        if (banners.size > 1) {
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center
            ) {
                repeat(banners.size) { index ->
                    val selected = pagerState.currentPage == index
                    Box(
                        modifier = Modifier
                            .padding(horizontal = 3.dp)
                            .size(width = if (selected) 18.dp else 6.dp, height = 6.dp)
                            .clip(CircleShape)
                            .background(if (selected) OrangeCta else Muted.copy(alpha = 0.35f))
                    )
                }
            }
        }
    }
}

@Composable
private fun TembusMiniCta(label: String) {
    // CTA tunggal per slide (§11.4): orange chart, teks gelap (kontras 6.33:1).
    Surface(
        shape = RoundedCornerShape(999.dp),
        color = OrangeCta,
        contentColor = OnOrangeCta,
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp)
        )
    }
}

// ─── DESIGN.md §12: rekomendasi kuliner (strip horizontal) ─────────────────

/**
 * Strip merchant terdekat: foto + nama + rating. Tap membuka detail merchant.
 * Saat daftar kosong, pertahankan hierarki Figma dengan empty state yang
 * mengarahkan ke Food; jangan menampilkan merchant atau rating sintetis.
 */
@Composable
internal fun TembusFoodRecommendationStrip(
    merchants: List<FoodMerchant>,
    onMerchantClick: (String) -> Unit,
    onSeeAllClick: () -> Unit,
    locationLabel: String? = null,
    modifier: Modifier = Modifier,
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                "Kuliner Terdekat${locationLabel?.let { " di ${it.substringAfterLast(',').trim()}" } ?: ""}",
                color = Ink,
                fontWeight = FontWeight.Black,
                fontSize = 15.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (merchants.isNotEmpty()) {
                Text(
                    "Semua (${merchants.size})",
                    color = OrangeCta,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable(role = Role.Button) { onSeeAllClick() }
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        if (merchants.isEmpty()) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp),
                shape = RoundedCornerShape(TembusRadius.Card),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                onClick = onSeeAllClick,
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFEAF6F0)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Default.Store, contentDescription = null, tint = Primary, modifier = Modifier.size(20.dp))
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(
                            "Belum ada merchant di sekitar lokasi ini",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            "Coba ubah kategori atau periksa kembali lokasi perangkat.",
                            fontSize = 10.sp,
                            color = Muted,
                            textAlign = TextAlign.Start,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text("Lihat", color = OrangeCta, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        } else {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(horizontal = 20.dp)
            ) {
                items(merchants, key = { it.id }) { merchant ->
                    val previewItem = merchant.menuItems
                        .firstOrNull { it.canBeAddedToCart }
                        ?: merchant.menuItems.firstOrNull()
                    val previewImage = previewItem?.foto?.takeIf { it.isNotBlank() }
                        ?: merchant.imageUrl?.takeIf { it.isNotBlank() }
                    val previewTitle = previewItem?.name?.takeIf { it.isNotBlank() } ?: merchant.name
                    val previewDescription = previewItem?.deskripsi?.takeIf { it.isNotBlank() }
                        ?: previewItem?.kategori?.takeIf { it.isNotBlank() }
                        ?: merchant.address.takeIf { it.isNotBlank() }
                    val ratingLabel = merchant.avgRating
                        ?.takeIf { merchant.ratingCount > 0 }
                        ?.let { "★ ${formatOneDecimal(it)} (${merchant.ratingCount})" }
                        ?: "Belum ada rating"
                    Card(
                        modifier = Modifier.width(166.dp),
                        shape = RoundedCornerShape(TembusRadius.Card),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        onClick = { onMerchantClick(merchant.id) }
                    ) {
                        Column {
                            if (!previewImage.isNullOrBlank()) {
                                AsyncImage(
                                    model = previewImage,
                                    contentDescription = "Foto $previewTitle dari ${merchant.name}",
                                    contentScale = ContentScale.Crop,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(86.dp)
                                )
                            } else {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(86.dp)
                                        .background(Color(0xFFEAF5EE)),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    Icon(Icons.Default.Restaurant, contentDescription = null, tint = Primary, modifier = Modifier.size(28.dp))
                                }
                            }
                            Column(Modifier.padding(10.dp)) {
                                Text(
                                    merchant.name,
                                    fontSize = 9.sp,
                                    color = Muted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Spacer(Modifier.height(2.dp))
                                Text(
                                    previewTitle,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                Text(
                                    previewDescription ?: ratingLabel,
                                    fontSize = 9.sp,
                                    color = Muted,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Spacer(Modifier.height(5.dp))
                                Text(ratingLabel, fontSize = 9.sp, color = Muted, maxLines = 1)
                                Spacer(Modifier.height(7.dp))
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    previewItem?.price?.takeIf { it > 0 }?.let {
                                        Text(formatIdr(it), fontSize = 11.sp, fontWeight = FontWeight.ExtraBold, color = Ink, modifier = Modifier.weight(1f))
                                    } ?: Spacer(Modifier.weight(1f))
                                    merchant.distanceKm?.let {
                                        Surface(color = Color(0xFFFFF0E7), shape = RoundedCornerShape(999.dp)) {
                                            Text(
                                                "${String.format(java.util.Locale.US, "%.1f", it)} km",
                                                fontSize = 8.sp,
                                                color = OrangeCta,
                                                fontWeight = FontWeight.Bold,
                                                modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
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
    }
}

private fun formatOneDecimal(value: Double): String = "%.1f".format(java.util.Locale.US, value)

private fun formatIdr(value: Long): String =
    java.text.NumberFormat.getCurrencyInstance(java.util.Locale("id", "ID"))
        .apply { maximumFractionDigits = 0; minimumFractionDigits = 0 }
        .format(value)
