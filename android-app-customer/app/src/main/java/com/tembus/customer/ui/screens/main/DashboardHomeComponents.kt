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
import androidx.compose.foundation.layout.height
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
import androidx.compose.material.icons.filled.MoveToInbox
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.R
import com.tembus.customer.data.model.GlobalBanner
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.ui.localization.CustomerTextCatalog
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.BrandHeader
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
    onBookingClick: (String?) -> Unit,
    onRemoteAction: (RemoteDeepLinkTarget) -> Unit,
    onBannerEvent: (ExperienceBannerEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isCms = heroSection != null
    val properties = heroSection?.properties
    val title = (properties?.get("title") as? JsonPrimitive)?.contentOrNull
        ?: "Kirim Paket Cepat & Hemat"
    val body = (properties?.get("body") as? JsonPrimitive)?.contentOrNull
        ?: "Diskon ongkir s.d. 30% untuk pengiriman instan hari ini"
    val badge = (properties?.get("badge") as? JsonPrimitive)?.contentOrNull
        ?: "PROMO TEMBUS"
    val ctaLabel = (properties?.get("cta_label") as? JsonPrimitive)?.contentOrNull
        ?: "Pesan Sekarang"
    val deepLink = (properties?.get("deep_link") as? JsonPrimitive)?.contentOrNull
    val externalUrl = (properties?.get("external_url") as? JsonPrimitive)?.contentOrNull
    val imageAssetId = (properties?.get("image_asset_id") as? JsonPrimitive)?.contentOrNull
    val campaignId = (properties?.get("campaign_id") as? JsonPrimitive)?.contentOrNull
        ?: heroSection?.id ?: "tembus_hero_default"

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
                    sectionId = heroSection?.id ?: "hero",
                    manifestRevision = manifestRevision,
                    marketCode = marketCode,
                    manifestId = manifestId,
                )
            )
        }
    }

    if (hasBannerImage) {
        // When marketing uploads a designed banner graphic (like Gojek GoCar/GoFood),
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
                                sectionId = heroSection?.id ?: "hero",
                                manifestRevision = manifestRevision,
                                marketCode = marketCode,
                                manifestId = manifestId,
                            )
                        )
                    }
                    if (target != null && target !is RemoteDeepLinkTarget.Invalid) {
                        onRemoteAction(target)
                    } else {
                        onBookingClick("pickup")
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
                                sectionId = heroSection?.id ?: "hero",
                                manifestRevision = manifestRevision,
                                marketCode = marketCode,
                                manifestId = manifestId,
                            )
                        )
                    }
                    if (target != null && target !is RemoteDeepLinkTarget.Invalid) {
                        onRemoteAction(target)
                    } else {
                        onBookingClick("pickup")
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
    onBookingClick: (String?) -> Unit,
    onRemoteAction: (RemoteDeepLinkTarget) -> Unit,
    onBannerEvent: (ExperienceBannerEvent) -> Unit,
    modifier: Modifier = Modifier,
    networkBanner: @Composable () -> Unit = {},
    // DESIGN.md §12: label lokasi terbalik-geocode (null = sembunyikan baris).
    locationLabel: String? = null,
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
                onBookingClick = onBookingClick,
                onRemoteAction = onRemoteAction,
                onBannerEvent = onBannerEvent,
            )
            Spacer(Modifier.height(14.dp))
            WalletCard()
        }
    }
}

@Composable
internal fun WalletCard() {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(TembusRadius.Card),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(SoftGreen),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.AccountBalanceWallet, contentDescription = "", tint = LcGreen)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("Saldo siap dipakai", fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = Muted)
                Text("Rp50.000", fontWeight = FontWeight.Black, fontSize = 18.sp, color = Ink)
                Text("183 coins reward", color = Muted, fontSize = 12.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                WalletAction(Icons.Default.ArrowUpward, "Bayar")
                WalletAction(Icons.Default.Add, "Top Up")
                WalletAction(Icons.Default.MoreHoriz, "Lainnya")
            }
        }
    }
}

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
    onAmbilClick: () -> Unit,
    onFoodClick: () -> Unit,
    showFood: Boolean = true,
    onAggregatorClick: () -> Unit,
    onTambalBanClick: () -> Unit,
    onTowingClick: () -> Unit,
    // LEGACY: single pickup entry (kirim+ambil gabung). Dipertahankan untuk
    // kompatibilitas, tetapi grid baru memakai onKirimClick/onAmbilClick.
    onPickupClick: (() -> Unit)? = null,
) {
    val goKirim = onPickupClick ?: onKirimClick
    val goAmbil = onPickupClick ?: onAmbilClick
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp)
    ) {
        Text("Mau apa hari ini?", color = Ink, fontWeight = FontWeight.Black, fontSize = 18.sp)
        Text("Layanan utama TEMBUS, satu tap ke pesanan.", color = Muted, fontSize = 12.sp)
        Spacer(Modifier.height(12.dp))
        // DESIGN.md §12: grid 2x3 — Kirim | Ambil | Food / Tambal | Towing | Lainnya.
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TembusHomeServiceTile("Kirim Paket", Icons.Default.Send, TembusHomeServiceTone.Primary, goKirim, modifier = Modifier.weight(1f))
            TembusHomeServiceTile("Ambil Paket", Icons.Default.MoveToInbox, TembusHomeServiceTone.Primary, goAmbil, modifier = Modifier.weight(1f))
            if (showFood) {
                TembusHomeServiceTile(TembusServiceIcons.Food.label, TembusServiceIcons.Food.icon, TembusHomeServiceTone.Food, onFoodClick, modifier = Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(14.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            TembusHomeServiceTile(TembusServiceIcons.TambalBan.label, TembusServiceIcons.TambalBan.icon, TembusHomeServiceTone.Emergency, onTambalBanClick, badge = "SOS", emergency = true, modifier = Modifier.weight(1f))
            TembusHomeServiceTile(TembusServiceIcons.Towing.label, TembusServiceIcons.Towing.icon, TembusHomeServiceTone.Towing, onTowingClick, badge = "SOS", emergency = true, modifier = Modifier.weight(1f))
            TembusHomeServiceTile("Lainnya", Icons.Default.GridView, TembusHomeServiceTone.Secondary, onAggregatorClick, modifier = Modifier.weight(1f))
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
        TembusHomeServiceTone.Primary -> MaterialTheme.colorScheme.primary to MaterialTheme.colorScheme.onPrimary
        TembusHomeServiceTone.Food -> MaterialTheme.colorScheme.tertiary to MaterialTheme.colorScheme.onTertiary
        TembusHomeServiceTone.Secondary -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
        TembusHomeServiceTone.Emergency -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        TembusHomeServiceTone.Towing -> MaterialTheme.colorScheme.errorContainer to MaterialTheme.colorScheme.onErrorContainer
    }
    Column(
        modifier = modifier
            .semantics {
                contentDescription = if (emergency) "$label, layanan darurat" else label
                role = Role.Button
            }
            .clickable(role = Role.Button) { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box {
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(TembusRadius.Card))
                    .background(bgColor),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = label, tint = iconColor, modifier = Modifier.size(28.dp))
            }
            if (badge != null) {
                Box(
                    modifier = Modifier.align(Alignment.TopEnd).size(22.dp).clip(CircleShape).background(Error),
                    contentAlignment = Alignment.Center
                ) {
                    Text(badge, color = MaterialTheme.colorScheme.onError, fontSize = 11.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Text(
            text = label,
            fontSize = 11.sp,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
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
 * Disembunyikan total bila daftar kosong (tidak ada placeholder palsu, R-38).
 */
@Composable
internal fun TembusFoodRecommendationStrip(
    merchants: List<FoodMerchant>,
    onMerchantClick: (String) -> Unit,
    onSeeAllClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (merchants.isEmpty()) return
    Column(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text("Rekomendasi kuliner dekatmu", color = Ink, fontWeight = FontWeight.Black, fontSize = 16.sp)
            Text(
                "Lihat Semua",
                color = Primary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(role = Role.Button) { onSeeAllClick() }
            )
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(horizontal = 20.dp)
        ) {
            items(merchants, key = { it.id }) { merchant ->
                Card(
                    modifier = Modifier.width(148.dp),
                    shape = RoundedCornerShape(TembusRadius.Card),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    onClick = { onMerchantClick(merchant.id) }
                ) {
                    Column {
                        if (!merchant.imageUrl.isNullOrBlank()) {
                            AsyncImage(
                                model = merchant.imageUrl,
                                contentDescription = merchant.name,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(88.dp)
                            )
                        }
                        Column(Modifier.padding(10.dp)) {
                            Text(
                                merchant.name,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                "★ ${formatOneDecimal(merchant.avgRating ?: 0.0)}",
                                fontSize = 11.sp,
                                color = Muted,
                                maxLines = 1
                            )
                        }
                    }
                }
            }
        }
    }
}

private fun formatOneDecimal(value: Double): String = "%.1f".format(java.util.Locale.US, value)
