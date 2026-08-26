package com.tembus.customer.ui.screens.tracking
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import androidx.annotation.DrawableRes
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tembus.customer.ui.components.maps.CameraUpdateFactory
import com.tembus.customer.ui.components.maps.BitmapDescriptorFactory
import com.tembus.customer.ui.components.maps.CameraPosition
import com.tembus.customer.ui.components.maps.LatLng
import com.tembus.customer.ui.components.maps.*
import com.tembus.customer.BuildConfig
import com.tembus.customer.R
import com.tembus.customer.data.model.OrderTrackingDetail
import com.tembus.customer.ui.components.maps.RuntimeMapMarker
import com.tembus.customer.ui.components.maps.RuntimeMapRenderer
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.screens.rating.CourierRatingDialog
import com.tembus.customer.ui.screens.rating.CourierRatingViewModel
import com.tembus.customer.ui.screens.rating.MerchantRatingDialog
import com.tembus.customer.ui.screens.rating.MerchantRatingViewModel
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.screens.tip.TipDialog
import com.tembus.customer.ui.screens.tip.TipViewModel
import androidx.compose.material.icons.filled.VolunteerActivism

import com.tembus.customer.ui.screens.tracking.*

@Composable
internal fun RuntimeMapFallback(
    provider: String,
    reason: String?,
    courierLocation: LatLng?,
    eta: String?,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(Color(0xFFEFF6FF)),
        contentAlignment = Alignment.Center
    ) {
        Card(
            modifier = Modifier
                .padding(24.dp)
                .fillMaxWidth(),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier.padding(22.dp),
                horizontalAlignment = Alignment.Start
            ) {
                Text(
                    text = if (provider == "openstreetmap") "Peta OpenStreetMap aktif" else "Mode peta teks aktif",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Color(0xFF0B3D2E)
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Pelacakan tetap berjalan realtime dan mengikuti konfigurasi operasional terbaru.",
                    color = Color(0xFF4B5563),
                    fontSize = 14.sp,
                    lineHeight = 20.sp
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = courierLocation?.let { "Kurir: ${"%.5f".format(it.latitude)}, ${"%.5f".format(it.longitude)}" }
                        ?: "Menunggu koordinat kurir...",
                    color = Color(0xFF111827),
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = eta?.let { "Estimasi: $it" } ?: "Estimasi dihitung otomatis saat lokasi tersedia.",
                    color = Color(0xFF6B7280),
                    fontSize = 13.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )
                if (!reason.isNullOrBlank()) {
                    Text(
                        text = reason.replace("_", " "),
                        color = Color(0xFF92400E),
                        fontSize = 12.sp,
                        modifier = Modifier
                            .padding(top = 14.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Color(0xFFFFFBEB))
                            .padding(horizontal = 12.dp, vertical = 8.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun CourierStatusCard(
    eta: String,
    detail: OrderTrackingDetail?,
    staleTrackingReason: String?,
    lastLiveTrackingAt: Long?,
    onCallClick: () -> Unit,
    onChatClick: () -> Unit,
    hasUnreadMessage: Boolean,
    canTip: Boolean = false,
    onTipClick: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val sessionManager = remember(context) { com.tembus.customer.data.session.AuthSessionManager(context) }
    val authToken by sessionManager.authToken.collectAsState(initial = null)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .shadow(24.dp, RoundedCornerShape(24.dp)),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(
            modifier = Modifier.padding(20.dp)
        ) {
            val order = detail?.order
            val stageText = remember(order?.status, order?.serviceSubType, order?.statusLabel, detail?.tracking?.stageLabel) {
                order?.statusLabel?.takeIf { it.isNotBlank() }
                    ?: detail?.tracking?.stageLabel?.takeIf { it.isNotBlank() }
                    ?: trackingStageText(order?.status, order?.serviceSubType)
            }
            // ETA Banner
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Primary.copy(alpha = 0.1f))
                    .padding(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Icon(
                    painter = painterResource(id = android.R.drawable.ic_menu_recent_history), // system fallback icon
                    contentDescription = null,
                    tint = Primary,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = stageText,
                    fontWeight = FontWeight.Bold,
                    color = Primary,
                    fontSize = 15.sp
                )
            }
            Text(
                text = if (eta.isBlank() || eta == "Menghitung...") "Lokasi kurir diperbarui otomatis." else "Estimasi $eta",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 13.sp,
                modifier = Modifier.padding(start = 32.dp, top = 6.dp)
            )
            staleTrackingReason?.let { reason ->
                Text(
                    text = "${trackingFreshnessLabel(lastLiveTrackingAt)}. $reason",
                    color = Color(0xFF92400E),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier
                        .padding(top = 10.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color(0xFFFFFBEB))
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            // Driver Info Row
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                // Avatar Placeholder
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFE0E0E0)),
                    contentAlignment = Alignment.Center
                ) {
                    if (!order?.courierPhotoUrl.isNullOrBlank() && authToken != null) {
                        AsyncImage(
                            model = ImageRequest.Builder(context)
                                .data(absoluteUploadUrl(order?.courierPhotoUrl))
                                .addHeader("Authorization", "Bearer $authToken")
                                .crossfade(true)
                                .build(),
                            contentDescription = "Foto Profil Kurir",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize()
                        )
                    } else {
                        val initials = remember(order?.courierName) {
                            val name = order?.courierName ?: "K"
                            val parts = name.trim().split("\\s+".toRegex())
                            if (parts.size >= 2) {
                                "${parts[0].take(1)}${parts[1].take(1)}".uppercase()
                            } else {
                                name.take(2).uppercase()
                            }
                        }
                        Text(initials, fontWeight = FontWeight.Bold, color = Color.DarkGray)
                    }
                }

                Spacer(modifier = Modifier.width(16.dp))

                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = order?.courierName ?: "Sedang mencari kurir...",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = Color(0xFF1A1A1A)
                    )
                    Text(
                        text = if (order?.courierPlate != null) "${order.courierPlate} • ${order.courierVehicle ?: ""}" else "Menghubungkan driver",
                        color = Color.Gray,
                        fontSize = 14.sp
                    )
                }

                // Action Buttons (Call / Chat)
                Row {
                    FilledIconButton(
                        onClick = onCallClick,
                        modifier = Modifier.size(42.dp),
                        shape = CircleShape,
                        colors = IconButtonDefaults.filledIconButtonColors(
                            containerColor = Color(0xFFF2F2F7)
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.Call,
                            contentDescription = "Panggil",
                            tint = Color.DarkGray,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(8.dp))
                    Box {
                        FilledIconButton(
                            onClick = onChatClick,
                            modifier = Modifier.size(42.dp),
                            shape = CircleShape,
                            colors = IconButtonDefaults.filledIconButtonColors(
                                containerColor = Primary
                            )
                        ) {
                            Icon(
                                imageVector = Icons.Default.ChatBubbleOutline,
                                contentDescription = "Pesan",
                                tint = Color.White,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        if (hasUnreadMessage) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .size(11.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFFFF7A00))
                            )
                        }
                    }
                }
            }

            // FB-077: tombol Kasih Tip — tampil saat kurir ditugaskan & status eligible
            if (canTip) {
                Spacer(modifier = Modifier.height(14.dp))
                Button(
                    onClick = onTipClick,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFFF4E5))
                ) {
                    Icon(
                        imageVector = Icons.Default.VolunteerActivism,
                        contentDescription = null,
                        tint = Primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Kasih Tip ke Kurir",
                        color = Primary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }
            }

            if (detail != null) {
                Spacer(modifier = Modifier.height(18.dp))
                TrackingTimeline(detail = detail)
                PackageSection(detail = detail)
                ProofSection(detail = detail)
            }
        }
    }
}

@Composable
internal fun SafeAreaWrapper(content: @Composable () -> Unit) {
    Box(modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars)) {
        content()
    }
}

internal fun bitmapDescriptorFromVector(
    context: android.content.Context,
    @DrawableRes vectorResId: Int,
    width: Int,
    height: Int
): com.tembus.customer.ui.components.maps.BitmapDescriptor {
    return try {
        val vectorDrawable = ContextCompat.getDrawable(context, vectorResId) ?: return BitmapDescriptorFactory.defaultMarker()
        vectorDrawable.setBounds(0, 0, width, height)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        vectorDrawable.draw(canvas)
        BitmapDescriptorFactory.fromBitmap(bitmap)
    } catch (e: Exception) {
        BitmapDescriptorFactory.defaultMarker()
    }
}
