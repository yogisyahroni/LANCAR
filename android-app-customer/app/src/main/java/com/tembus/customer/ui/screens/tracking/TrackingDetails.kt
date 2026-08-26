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
internal fun PackageSection(detail: OrderTrackingDetail) {
    if (detail.packages.isEmpty()) return

    Spacer(modifier = Modifier.height(14.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFF7FAFC))
            .padding(14.dp)
    ) {
        Text("Rincian paket", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF1A1A1A))
        Spacer(modifier = Modifier.height(12.dp))
        detail.packages.forEachIndexed { index, item ->
            val scanDone = !item.pickupScanVerifiedAt.isNullOrBlank()
            val photoDone = !item.pickupPhotoVerifiedAt.isNullOrBlank()
            val podDone = !item.deliveryPodVerifiedAt.isNullOrBlank()
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Top
            ) {
                Surface(
                    shape = CircleShape,
                    color = if (podDone) Primary.copy(alpha = 0.12f) else Color.White
                ) {
                    Text(
                        text = "${item.packageIndex ?: index + 1}",
                        modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                        fontWeight = FontWeight.Black,
                        fontSize = 12.sp,
                        color = Primary
                    )
                }
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = item.description?.takeIf { it.isNotBlank() } ?: "Paket ${index + 1}",
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 14.sp,
                        color = Color(0xFF1A1A1A)
                    )
                    val meta = buildList {
                        item.packageCode?.takeIf { it.isNotBlank() }?.let { add(it) }
                        item.sizeTier?.takeIf { it.isNotBlank() }?.let { add(it.uppercase()) }
                        item.weightKg?.takeIf { it > 0.0 }?.let { add("${it} kg") }
                    }.joinToString(" • ")
                    if (meta.isNotBlank()) {
                        Text(meta, color = Color.Gray, fontSize = 12.sp)
                    }
                    Text(
                        text = buildList {
                            add(if (scanDone) "Scan pickup OK" else "Scan pickup belum")
                            add(if (photoDone) "Foto pickup OK" else "Foto pickup belum")
                            add(if (podDone) "POD OK" else "POD belum")
                        }.joinToString(" • "),
                        color = if (podDone) Primary else Color.Gray,
                        fontSize = 12.sp
                    )
                }
            }
            if (index != detail.packages.lastIndex) {
                Spacer(modifier = Modifier.height(10.dp))
                HorizontalDivider(color = Color(0xFFE8ECEF))
                Spacer(modifier = Modifier.height(10.dp))
            }
        }
    }
}

@Composable
internal fun TrackingTimeline(detail: OrderTrackingDetail) {
    val completedTypes = remember(detail.events) { detail.events.map { it.eventType.lowercase() }.toSet() }
    val status = detail.order.status.lowercase()
    val copy = trackingCopy(detail.order.serviceSubType, detail.order.model, detail.order.merchantId)
    val isFood = copy.kind == TrackingServiceKind.FOOD
    val isCancelled = status in setOf("cancelled", "failed") || completedTypes.contains("pickup_cancelled_by_courier")
    val steps = if (isCancelled) {
        listOf(
            TimelineStep("merchant_order", "Order diterima", true),
            TimelineStep("cancelled", copy.cancelledLabel, true)
        )
    } else if (isFood) {
        // FOOD-BIKE-058: timeline khusus food — tahap merchant sebelum kurir
        // FB-123: kalau status 'scheduled', tampilkan step jadwal dulu.
        fun pastOrAt(vararg states: String) = status in states || status == "delivered" || status == "completed"
        if (status == "scheduled") {
            listOf(
                TimelineStep("scheduled", "Pesanan dijadwalkan", true),
                TimelineStep("merchant_order", "Merchant menerima pesanan", false),
                TimelineStep("merchant_prep", "Makanan disiapkan", false),
                TimelineStep("delivery", "Dalam pengantaran", false)
            )
        } else listOf(
            TimelineStep("merchant_order", "Merchant menerima pesanan", pastOrAt("pending_merchant", "preparing", "searching", "accepted", "picking_up", "picked_up", "delivering")),
            TimelineStep("merchant_prep", "Makanan disiapkan", pastOrAt("preparing", "searching", "accepted", "picking_up", "picked_up", "delivering")),
            TimelineStep("accepted", "Kurir sepeda mengambil", pastOrAt("accepted", "picking_up", "picked_up", "delivering")),
            TimelineStep("pickup", "Diverifikasi di merchant", pastOrAt("picked_up", "delivering")),
            TimelineStep("delivery", "Dalam pengantaran", pastOrAt("delivering")),
            TimelineStep("pod", "POD diterima", status in setOf("delivered", "completed"))
        )
    } else listOf(
        TimelineStep("accepted", copy.acceptedLabel, completedTypes.any { it in setOf("accepted", "courier_assigned", "assigned") } || status in setOf("accepted", "picking_up", "arrived_pickup", "picked_up", "service_started", "in_transit", "delivering", "loading", "unloading", "delivered", "completed")),
        TimelineStep("pickup", copy.pickupLabel, completedTypes.contains("pickup_verified") || status in setOf("arrived_pickup", "picked_up", "service_started", "in_transit", "delivering", "loading", "unloading", "delivered", "completed")),
        TimelineStep("delivery", copy.activeLabel, status in setOf("service_started", "in_transit", "delivering", "loading", "unloading", "delivered", "completed")),
        TimelineStep("pod", copy.completedLabel, completedTypes.contains("pod_verified") || status in setOf("delivered", "completed"))
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFF7FAFC))
            .padding(14.dp)
    ) {
        Text(copy.timelineTitle, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF1A1A1A))
        Spacer(modifier = Modifier.height(12.dp))
        steps.forEachIndexed { index, step ->
            Row(verticalAlignment = Alignment.Top) {
                Icon(
                    imageVector = if (step.done) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                    contentDescription = null,
                    tint = if (step.done) Primary else Color.Gray,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(step.label, fontWeight = FontWeight.SemiBold, color = if (step.done) Color(0xFF0B3D2E) else Color.Gray)
                    val event = detail.events.lastOrNull { event -> eventMatchesStep(event.eventType, step.key) }
                    if (event?.createdAt != null) {
                        Text(formatTrackingDate(event.createdAt), color = Color.Gray, fontSize = 12.sp)
                    }
                }
            }
            if (index != steps.lastIndex) {
                Spacer(modifier = Modifier.height(10.dp))
            }
        }
    }
}

internal data class TimelineStep(val key: String, val label: String, val done: Boolean)

@Composable
internal fun ProofSection(detail: OrderTrackingDetail) {
    val copy = trackingCopy(detail.order.serviceSubType, detail.order.model, detail.order.merchantId)
    val pickupProof = detail.proofs.lastOrNull {
        it.scanType?.lowercase() in setOf("pickup", "pickup_photo") && !it.photoUrl.isNullOrBlank()
    }
    val podProof = detail.proofs.lastOrNull { it.scanType?.lowercase() == "pod" && !it.photoUrl.isNullOrBlank() }
    val cancellationProof = detail.proofs.lastOrNull {
        it.scanType?.lowercase() == "pickup_cancellation" && !it.photoUrl.isNullOrBlank()
    }
    val serviceProofs = buildList {
        detail.order.tambalBanReport?.let { report ->
            report.tirePhotoBeforeUrl?.takeIf { it.isNotBlank() }?.let { add("Foto ban sebelum" to it) }
            report.tirePhotoAfterUrl?.takeIf { it.isNotBlank() }?.let { add("Foto ban sesudah" to it) }
        }
        detail.order.towingReport?.let { report ->
            report.vehiclePhotoBeforeUrl?.takeIf { it.isNotBlank() }?.let { add("Foto kendaraan sebelum" to it) }
            report.loadingPhotoUrl?.takeIf { it.isNotBlank() }?.let { add("Foto loading" to it) }
            report.unloadingPhotoUrl?.takeIf { it.isNotBlank() }?.let { add("Foto unloading" to it) }
            report.completionPhotoUrl?.takeIf { it.isNotBlank() }?.let { add("Foto completion" to it) }
            report.signatureUrl?.takeIf { it.isNotBlank() }?.let { add("Tanda tangan penerima" to it) }
        }
    }
    if (pickupProof == null && podProof == null && cancellationProof == null && serviceProofs.isEmpty()) return

    Spacer(modifier = Modifier.height(14.dp))
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0xFFFFFBF5))
            .padding(14.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Image, contentDescription = null, tint = Color(0xFFFF6B00), modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(copy.proofSectionTitle, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color(0xFF0B3D2E))
        }
        Spacer(modifier = Modifier.height(12.dp))
        val context = LocalContext.current
        val sessionManager = remember(context) { com.tembus.customer.data.session.AuthSessionManager(context) }
        val authToken by sessionManager.authToken.collectAsState(initial = null)
        
        cancellationProof?.let {
            CancellationProofCard(proof = it, authToken = authToken, title = copy.cancelledLabel)
            if (pickupProof != null || podProof != null) {
                Spacer(modifier = Modifier.height(10.dp))
            }
        }
        pickupProof?.let {
            ProofImage(title = copy.pickupProofTitle, url = absoluteUploadUrl(it.photoUrl), authToken = authToken)
            Spacer(modifier = Modifier.height(10.dp))
        }
        podProof?.let {
            ProofImage(title = copy.podProofTitle, url = absoluteUploadUrl(it.photoUrl), authToken = authToken)
        }
        serviceProofs.forEachIndexed { index, proof ->
            if (pickupProof != null || podProof != null || cancellationProof != null || index > 0) {
                Spacer(modifier = Modifier.height(10.dp))
            }
            ProofImage(title = proof.first, url = absoluteUploadUrl(proof.second), authToken = authToken)
        }
    }
}

@Composable
internal fun CancellationProofCard(proof: com.tembus.customer.data.model.TrackingProof, authToken: String?, title: String) {
    val reasonText = proof.reasonNote
        ?: proof.overrideReason?.substringAfter(":", missingDelimiterValue = proof.overrideReason)?.trim()
        ?: "Alasan operasional sudah dikirim oleh kurir."
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color(0xFFFFF1F1))
            .padding(12.dp)
    ) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFFB42318))
        Spacer(modifier = Modifier.height(4.dp))
        Text(reasonText, fontSize = 13.sp, color = Color(0xFF5F1D1B))
        Spacer(modifier = Modifier.height(10.dp))
        ProofImage(title = "Foto bukti pembatalan", url = absoluteUploadUrl(proof.photoUrl), authToken = authToken)
    }
}

@Composable
internal fun ProofImage(title: String, url: String, authToken: String?) {
    Column {
        Text(title, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Color(0xFF1A1A1A))
        Spacer(modifier = Modifier.height(6.dp))
        val context = LocalContext.current
        AsyncImage(
            model = if (authToken != null) {
                ImageRequest.Builder(context)
                    .data(url)
                    .addHeader("Authorization", "Bearer $authToken")
                    .crossfade(true)
                    .build()
            } else url,
            contentDescription = title,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .height(150.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(Color(0xFFEDEFF2))
        )
    }
}

@Composable
internal fun SearchTimeoutSheet(
    orderId: String,
    viewModel: TrackingViewModel,
    modifier: Modifier = Modifier
) {
    var isRetrying by remember { mutableStateOf(false) }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Schedule, contentDescription = null, tint = Color(0xFFFF9500), modifier = Modifier.size(24.dp))
                Spacer(Modifier.width(10.dp))
                Text("Belum ada kurir tersedia", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
            Text(
                "Kami belum menemukan kurir di sekitar lokasi kamu. Pilih opsi di bawah:",
                color = Color.Gray,
                fontSize = 14.sp
            )

            Button(
                onClick = {
                    isRetrying = true
                    viewModel.retrySearch(orderId)
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Primary),
                enabled = !isRetrying
            ) {
                if (isRetrying) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (isRetrying) "Mencoba lagi..." else "Coba Lagi", fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = {
                    isRetrying = true
                    viewModel.retryWithSurge(orderId)
                },
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
                enabled = !isRetrying
            ) {
                Icon(Icons.Default.TrendingUp, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Naikkan Tarif + Coba Lagi", fontWeight = FontWeight.Bold)
            }

            TextButton(
                onClick = { viewModel.cancelSearch(orderId) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Batalkan & Ajukan Refund", color = Color(0xFFFF5252), fontWeight = FontWeight.Bold)
            }
        }
    }
}
