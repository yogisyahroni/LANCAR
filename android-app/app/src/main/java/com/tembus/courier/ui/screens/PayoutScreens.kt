package com.tembus.courier.ui.screens
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import coil.request.ImageRequest
import android.Manifest
import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.compose.ui.draw.clip
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.Priority
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.CancellationTokenSource
import com.tembus.courier.ui.components.maps.CameraPosition
import com.tembus.courier.ui.components.maps.LatLng
import com.tembus.courier.ui.components.maps.RuntimeMap
import com.tembus.courier.ui.components.maps.MapUiSettings
import com.tembus.courier.ui.components.maps.MapMarker
import com.tembus.courier.ui.components.maps.MarkerState
import com.tembus.courier.ui.components.maps.MapPolyline
import com.tembus.courier.ui.components.maps.rememberCameraPositionState
import com.tembus.courier.ui.components.BatteryOptimizationCard
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierServiceCapability
import com.tembus.courier.data.model.CourierEarningsLedger
import com.tembus.courier.data.model.CourierEarningsTransaction
import com.tembus.courier.data.model.CourierPerformanceSummary
import com.tembus.courier.data.model.CourierPayoutRequestItem
import com.tembus.courier.data.model.CourierPayoutSummaryData
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.displayServiceName
import com.tembus.courier.data.model.estimatedNetEarningsIdr
import com.tembus.courier.data.model.isMaintenanceService
import com.tembus.courier.data.model.normalizedWorkflowRole
import com.tembus.courier.data.model.toRupiahCompact
import com.tembus.courier.domain.CourierProofTypes
import com.tembus.courier.domain.CourierRouteReducer
import com.tembus.courier.domain.CourierRouteScreen
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.service.LocationTrackerService
import com.tembus.courier.ui.components.maps.RuntimeMapMarker
import com.tembus.courier.ui.components.maps.RuntimeMapRenderer
import com.tembus.courier.ui.screens.call.CallEventsViewModel
import com.tembus.courier.ui.screens.call.InAppCallScreen
import com.tembus.courier.ui.screens.call.InAppCallState
import com.tembus.courier.ui.screens.order.OrderDetailScreen
import com.tembus.courier.ui.screens.order.OrderScreen
import com.tembus.courier.ui.screens.order.OrderViewModel
import com.tembus.courier.ui.screens.notification.InboxScreen
import com.tembus.courier.ui.screens.service.ServiceUpgradeScreen
import com.tembus.courier.ui.screens.service.TambalBanFlowScreen
import com.tembus.courier.ui.screens.service.TowingFlowScreen
import com.tembus.courier.ui.screens.service.CompletionScreen
import com.tembus.courier.ui.screens.pod.ProofOfDeliveryScreen
import com.tembus.courier.ui.screens.profile.resolvePayoutActionState
import com.tembus.courier.ui.screens.scan.ScanScreen
import com.tembus.courier.ui.screens.chat.ChatScreen
import com.tembus.courier.ui.screens.face.FaceVerificationScreen
import com.tembus.courier.ui.security.LocalSecurityChallengeDialog
import com.tembus.courier.ui.security.LocalSecuritySettingsPanel
import com.tembus.courier.ui.security.SecureScreenEffect
import com.tembus.courier.ui.components.BidirectionalSwipeSlider
import com.tembus.courier.ui.theme.Accent
import com.tembus.courier.ui.theme.AccentDark
import com.tembus.courier.ui.theme.AccentLight
import com.tembus.courier.ui.theme.Background
import com.tembus.courier.ui.theme.CourierMapBase
import com.tembus.courier.ui.theme.CourierPanel
import com.tembus.courier.ui.theme.Outline
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.PrimaryDark
import com.tembus.courier.ui.theme.PrimaryLight
import com.tembus.courier.ui.theme.Secondary
import com.tembus.courier.ui.theme.SecondaryLight
import com.tembus.courier.ui.theme.Success
import com.tembus.courier.ui.theme.Info
import com.tembus.courier.ui.theme.Warning
import com.tembus.courier.util.OrderSyncSignalBus
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import kotlin.math.min

// Extracted from MainScreen.kt (Faza 2 refactor 2026-08)
@Composable
internal fun PayoutBalanceCard(
    payoutSummary: CourierPayoutSummaryData?,
    payoutRequests: List<CourierPayoutRequestItem>,
    isSubmitting: Boolean,
    onRefresh: () -> Unit,
    onRequestClick: () -> Unit,
    onRequestDetail: (CourierPayoutRequestItem) -> Unit
) {
    val summary = payoutSummary?.summary
    val account = payoutSummary?.payoutAccount
    val eligibility = payoutSummary?.eligibility
    val policy = payoutSummary?.policy
    val actionState = resolvePayoutActionState(payoutSummary, isSubmitting)
    val canRequest = actionState.enabled

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Surface(color = Success.copy(alpha = 0.12f), shape = RoundedCornerShape(10.dp)) {
                    Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Success, modifier = Modifier.padding(10.dp).size(22.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text("Pencairan saldo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("Settlement pendapatan ke rekening terverifikasi", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.9f))
                }
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh pencairan", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            if (payoutSummary == null) {
                Surface(modifier = Modifier.fillMaxWidth(), color = PrimaryLight.copy(alpha = 0.55f), shape = RoundedCornerShape(12.dp)) {
                    Text(
                        "Memuat saldo pencairan dari sistem...",
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                return@Column
            }

            // 🎨 HERO CARD — saldo utama dalam satu modul gradasi (standar driver-wallet 2025/26:
            // Uber/Gojek menampilkan saldo sebagai fokus utama dengan hierarchy tegas)
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(Color(0xFF06231A), Color(0xFF0E5C33), Color(0xFF16A34A)),
                            start = Offset.Zero,
                            end = Offset.Infinite
                        )
                    )
                    .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(20.dp))
                    .padding(20.dp)
            ) {
                // Subtle accent glow di pojok kanan-atas — kesan premium
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(140.dp)
                        .clip(RoundedCornerShape(70.dp))
                        .background(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.10f), Color.Transparent)))
                )
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    // Label saldo utama + aksi cepat pencairan
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "SALDO TERSEDIA",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.2.sp,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                        Spacer(modifier = Modifier.weight(1f))
                        Text(
                            "IDR",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.sp,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                    }
                    Text(
                        summary?.availableBalanceIdr?.toRupiahCompact() ?: "Rp0",
                        style = MaterialTheme.typography.displayLarge,
                        fontWeight = FontWeight.Black,
                        color = Color.White
                    )

                    // Sub-stats dalam satu baris chip glassmorphism
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        HeroBalanceChip("Pending", summary?.pendingBalanceIdr?.toRupiahCompact() ?: "Rp0", Modifier.weight(1f))
                        HeroBalanceChip("Total", summary?.totalBalanceIdr?.toRupiahCompact() ?: "Rp0", Modifier.weight(1f))
                    }
                }
            }

            PayoutAccountStatusPanel(account)

            eligibility?.reasons?.takeIf { it.isNotEmpty() }?.let { reasons ->
                Surface(modifier = Modifier.fillMaxWidth(), color = Warning.copy(alpha = 0.1f), shape = RoundedCornerShape(12.dp)) {
                    Row(modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Icon(Icons.Default.Info, contentDescription = null, tint = Warning, modifier = Modifier.size(18.dp))
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("Pencairan sedang ditinjau", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurface)
                            reasons.take(1).forEach { reason ->
                                Text(reason, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }

            Button(
                onClick = onRequestClick,
                enabled = canRequest,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(8.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Secondary,
                    disabledContainerColor = Secondary.copy(alpha = 0.32f),
                    disabledContentColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.55f)
                )
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                } else {
                    Icon(Icons.Default.Payments, contentDescription = null, modifier = Modifier.size(18.dp))
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text("Ajukan Pencairan")
            }

            Text(
                "Minimum ${policy?.minAmountIdr?.toRupiahCompact() ?: "Rp25rb"} • Limit harian ${policy?.dailyLimitIdr?.toRupiahCompact() ?: "-"}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            HorizontalDivider()
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Riwayat pencairan", modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text("${payoutRequests.size} pengajuan", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            if (payoutRequests.isEmpty()) {
                Surface(modifier = Modifier.fillMaxWidth(), color = PrimaryLight.copy(alpha = 0.55f), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        "Belum ada pengajuan pencairan.",
                        modifier = Modifier.padding(12.dp),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                payoutRequests.take(5).forEach { request ->
                    PayoutRequestRow(request = request, onClick = { onRequestDetail(request) })
                }
            }
        }
    }
}

@Composable
internal fun PayoutAccountStatusPanel(account: com.tembus.courier.data.model.CourierPayoutAccount?) {
    val status = account?.status ?: "incomplete"
    val isVerified = status == "verified"
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (isVerified) PrimaryLight.copy(alpha = 0.45f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f), shape = RoundedCornerShape(10.dp)) {
                Icon(Icons.Default.AccountBalance, contentDescription = null, tint = if (isVerified) MaterialTheme.colorScheme.onSurface else Warning, modifier = Modifier.padding(8.dp).size(18.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("Rekening pencairan", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    if (account != null) {
                        "${account.bankCode ?: "-"} • ${maskAccountNumber(account.accountNumber.orEmpty())} • ${account.accountName ?: "-"}"
                    } else {
                        "Rekening sedang ditinjau operasional."
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            CapabilityStatusPill(if (isVerified) "verified" else "incomplete")
        }
    }
}

@Composable
internal fun PayoutRequestRow(request: CourierPayoutRequestItem, onClick: () -> Unit) {
    val color = payoutStatusColor(request.status)
    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        color = Color.Transparent,
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                Icon(payoutStatusIcon(request.status), contentDescription = null, tint = color, modifier = Modifier.padding(8.dp).size(18.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(request.requestNumber, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(request.statusLabel ?: payoutStatusLabel(request.status), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    payoutStatusMessage(request),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(request.netAmountIdr.toRupiahCompact(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text(shortDateLabel(request.requestedAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
internal fun PayoutRequestDialog(
    payoutSummary: CourierPayoutSummaryData,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: suspend (Int, String) -> Result<CourierPayoutRequestItem>,
    onSubmitted: (CourierPayoutRequestItem) -> Unit
) {
    val scope = rememberCoroutineScope()
    var step by rememberSaveable { mutableStateOf("amount") }
    var amountText by rememberSaveable { mutableStateOf("") }
    var pin by rememberSaveable { mutableStateOf("") }
    var errorText by remember { mutableStateOf<String?>(null) }
    val maxAmount = payoutSummary.eligibility.maxRequestableIdr
    val amount = amountText.filter { it.isDigit() }.toIntOrNull() ?: 0
    val amountValid = amount >= payoutSummary.policy.minAmountIdr && amount <= maxAmount
    val account = payoutSummary.payoutAccount

    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Surface(color = Secondary.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                        Icon(Icons.Default.Payments, contentDescription = null, tint = Secondary, modifier = Modifier.padding(10.dp).size(22.dp))
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Ajukan Pencairan", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("Dana dikirim ke rekening terverifikasi", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                when (step) {
                    "amount" -> {
                        Text("Nominal pencairan", fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            value = amountText,
                            onValueChange = { amountText = it.filter { char -> char.isDigit() }.take(9) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Nominal") },
                            prefix = { Text("Rp") },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            shape = RoundedCornerShape(8.dp)
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                            quickPayoutAmounts(payoutSummary).forEach { quick ->
                                AssistChip(
                                    onClick = { amountText = quick.toString() },
                                    label = { Text(quick.toRupiahCompact()) },
                                    enabled = quick <= maxAmount
                                )
                            }
                        }
                        Text("Saldo tersedia ${payoutSummary.summary.availableBalanceIdr.toRupiahCompact()} • Maks ${maxAmount.toRupiahCompact()}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }

                    "review" -> {
                        Text("Review pencairan", fontWeight = FontWeight.Bold)
                        PayoutReviewRow("Nominal", amount.toRupiahCompact())
                        PayoutReviewRow("Rekening", "${account?.bankCode ?: "-"} • ${maskAccountNumber(account?.accountNumber.orEmpty())}")
                        PayoutReviewRow("Atas nama", account?.accountName ?: "-")
                        Surface(modifier = Modifier.fillMaxWidth(), color = PrimaryLight.copy(alpha = 0.55f), shape = RoundedCornerShape(8.dp)) {
                            Text(
                                "Pastikan nominal dan rekening sudah benar. Setelah dikirim, pengajuan masuk tinjauan treasury.",
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    "pin" -> {
                        Text("Verifikasi PIN", fontWeight = FontWeight.Bold)
                        OutlinedTextField(
                            value = pin,
                            onValueChange = { pin = it.filter { char -> char.isDigit() }.take(6) },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("PIN transaksi") },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                            shape = RoundedCornerShape(8.dp)
                        )
                        Text("PIN diperlukan sebagai step-up keamanan pencairan.", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }

                errorText?.let {
                    Surface(modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp)) {
                        Text(it, modifier = Modifier.padding(10.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
                    }
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(
                        onClick = {
                            errorText = null
                            if (step == "amount") onDismiss() else step = if (step == "pin") "review" else "amount"
                        },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(if (step == "amount") "Batal" else "Kembali")
                    }
                    Button(
                        onClick = {
                            errorText = null
                            when (step) {
                                "amount" -> {
                                    if (amountValid) step = "review" else errorText = "Nominal harus sesuai minimum dan saldo tersedia."
                                }
                                "review" -> step = "pin"
                                else -> {
                                    if (pin.length < 4) {
                                        errorText = "PIN transaksi belum lengkap."
                                    } else {
                                        scope.launch {
                                            val result = onSubmit(amount, pin)
                                            result.onSuccess(onSubmitted)
                                            result.onFailure { errorText = it.message ?: "Pengajuan pencairan gagal." }
                                        }
                                    }
                                }
                            }
                        },
                        enabled = !isSubmitting,
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Secondary)
                    ) {
                        if (isSubmitting) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                        else Text(if (step == "pin") "Kirim" else "Lanjut")
                    }
                }
            }
        }
    }
}

@Composable
internal fun PayoutReviewRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
internal fun PayoutRequestDetailDialog(request: CourierPayoutRequestItem, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        Card(shape = RoundedCornerShape(8.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
            Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Surface(color = payoutStatusColor(request.status).copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                        Icon(payoutStatusIcon(request.status), contentDescription = null, tint = payoutStatusColor(request.status), modifier = Modifier.padding(10.dp).size(22.dp))
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Detail Pencairan", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(request.requestNumber, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                PayoutReviewRow("Status", request.statusLabel ?: payoutStatusLabel(request.status))
                PayoutReviewRow("Nominal", request.amountIdr.toRupiahCompact())
                PayoutReviewRow("Diterima", request.netAmountIdr.toRupiahCompact())
                PayoutReviewRow("Rekening", "${request.destinationSnapshot["bank_code"] ?: "-"} • **** ${request.destinationSnapshot["account_last4"] ?: request.destinationSnapshot["account_number_last4"] ?: "-"}")
                PayoutReviewRow("Tanggal", shortDateLabel(request.requestedAt))
                Surface(modifier = Modifier.fillMaxWidth(), color = payoutStatusColor(request.status).copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp)) {
                    Text(
                        payoutStatusMessage(request),
                        modifier = Modifier.padding(10.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.labelMedium
                    )
                }
                request.failureReason?.takeIf { it.isNotBlank() }?.let { reason ->
                    Surface(modifier = Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp)) {
                        Text(reason, modifier = Modifier.padding(10.dp), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
                    }
                }
                Button(onClick = onDismiss, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(8.dp)) {
                    Text("Tutup")
                }
            }
        }
    }
}

@Composable
internal fun CapabilityStatusPill(status: String) {
    val normalized = when (status) {
        "verified" -> "terverifikasi"
        "enabled" -> "aktif"
        "approved" -> "approved"
        "complete" -> "lengkap"
        "incomplete" -> "belum lengkap"
        else -> status.replace("_", " ")
    }
    val color = when (status) {
        "enabled", "approved", "complete", "verified" -> Success
        "disabled", "rejected", "suspended" -> MaterialTheme.colorScheme.error
        else -> Warning
    }
    val isDark = isSystemInDarkTheme()
    Surface(
        color = if (isDark && color != MaterialTheme.colorScheme.error) Warning.copy(alpha = 0.14f) else color.copy(alpha = 0.12f),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(1.dp, if (isDark && color != MaterialTheme.colorScheme.error) Color(0xFFFBBF24).copy(alpha = 0.35f) else Color.Transparent)
    ) {
        Text(
            normalized,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
            style = MaterialTheme.typography.labelSmall,
            color = if (isDark) {
                // Di dark mode, warna status terlalu gelap bila dipakai langsung di atas surface gelap.
                // Naikkan luminansi: warning/success pakai versi lebih terang.
                when (status) {
                    "disabled", "rejected", "suspended" -> MaterialTheme.colorScheme.error
                    else -> Color(0xFFFBBF24)
                }
            } else {
                color
            },
            fontWeight = FontWeight.Bold,
            maxLines = 1
        )
    }
}

@Composable
internal fun PayoutAccountPanel(ledger: CourierEarningsLedger) {
    val account = ledger.summary.payoutAccount
    val bankCode = account?.bankCode?.takeIf { it.isNotBlank() }
    val accountNumber = account?.accountNumber?.takeIf { it.isNotBlank() }
    val accountName = account?.accountName?.takeIf { it.isNotBlank() }
    val isReady = bankCode != null && accountNumber != null && accountName != null
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = if (isReady) PrimaryLight.copy(alpha = 0.58f) else Warning.copy(alpha = 0.12f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
                shape = RoundedCornerShape(8.dp)
            ) {
                Icon(
                    Icons.Default.AccountBalance,
                    contentDescription = null,
                    tint = if (isReady) MaterialTheme.colorScheme.onSurface else Warning,
                    modifier = Modifier.padding(10.dp).size(18.dp)
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text("Rekening pencairan", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    if (isReady) {
                        "$bankCode • ${maskAccountNumber(accountNumber.orEmpty())} • $accountName"
                    } else {
                        "Rekening belum lengkap. Lengkapi lewat proses verifikasi operasional."
                    },
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            CapabilityStatusPill(if (isReady) "verified" else "incomplete")
        }
    }
}

@Composable
internal fun EarningsLedgerRow(transaction: CourierEarningsTransaction) {
    val isCredit = transaction.direction == "credit"
    val color = if (isCredit) Success else MaterialTheme.colorScheme.error
    val orderLabel = transaction.orderNumber ?: transaction.source.replace("_", " ").uppercase()
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
            Icon(
                if (isCredit) Icons.AutoMirrored.Filled.CallReceived else Icons.AutoMirrored.Filled.CallMade,
                contentDescription = null,
                tint = color,
                modifier = Modifier.padding(8.dp).size(18.dp)
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(orderLabel, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                transaction.description ?: transaction.settlementStatus.replace("_", " "),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(
                transaction.amountIdr.toRupiahCompact(),
                style = MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                color = color
            )
            Text(
                transaction.settlementStatus.replace("_", " "),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1
            )
        }
    }
}

internal fun maskAccountNumber(value: String): String {
    val digits = value.filter { it.isDigit() }
    if (digits.length <= 4) return value
    return "**** ${digits.takeLast(4)}"
}

internal fun payoutStatusLabel(status: String): String = when (status) {
    "requested", "risk_screening" -> "Dalam pemeriksaan otomatis"
    "risk_hold", "manual_review", "under_review" -> "Butuh review"
    "approved_auto", "approved", "processing" -> "Diproses"
    "paid" -> "Berhasil"
    "rejected", "blocked" -> "Ditolak"
    "failed" -> "Gagal"
    "cancelled" -> "Dibatalkan"
    else -> status.replace("_", " ")
}

internal fun payoutStatusMessage(request: CourierPayoutRequestItem): String {
    request.statusMessage?.takeIf { it.isNotBlank() }?.let { return it }
    return when (request.status) {
        "requested", "risk_screening" -> "Pengajuan sedang dicek otomatis. Kamu bisa memantau statusnya di sini."
        "approved_auto", "approved", "processing" -> "Pengajuan sedang diproses ke rekening pencairan."
        "risk_hold", "manual_review", "under_review" -> "Sedang diverifikasi oleh tim operasional."
        "paid" -> "Pencairan berhasil diproses."
        "rejected", "blocked" -> "Pengajuan belum dapat diproses. Cek detail atau hubungi operasional jika perlu."
        "failed" -> "Pencairan belum berhasil. Saldo tetap tercatat dan akan ditinjau."
        "cancelled" -> "Pengajuan dibatalkan."
        else -> "Pengajuan pencairan saldo berhasil dibuat."
    }
}

@Composable
internal fun payoutStatusColor(status: String): Color = when (status) {
    "paid" -> Success
    "failed", "rejected", "blocked", "cancelled" -> MaterialTheme.colorScheme.error
    "approved_auto", "approved", "processing" -> Primary
    else -> Warning
}

internal fun payoutStatusIcon(status: String): androidx.compose.ui.graphics.vector.ImageVector = when (status) {
    "paid" -> Icons.Default.CheckCircle
    "failed", "rejected", "blocked", "cancelled" -> Icons.Default.Cancel
    "approved_auto", "approved", "processing" -> Icons.Default.Sync
    else -> Icons.Default.Schedule
}

internal fun shortDateLabel(value: String?): String {
    if (value.isNullOrBlank()) return "-"
    return value.take(16).replace("T", " ")
}

internal fun quickPayoutAmounts(summary: CourierPayoutSummaryData): List<Int> {
    val minAmount = summary.policy.minAmountIdr
    val maxAmount = summary.eligibility.maxRequestableIdr
    return listOf(minAmount, maxAmount)
        .filter { it > 0 }
        .distinct()
        .filter { it <= maxAmount }
        .take(4)
}

@Composable
internal fun HeroBalanceChip(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = Color.White.copy(alpha = 0.18f),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.28f))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.White, maxLines = 1)
            Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium, color = Color.White.copy(alpha = 0.9f), maxLines = 1)
        }
    }
}

@Composable
internal fun MiniProfileStat(label: String, value: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = PrimaryLight.copy(alpha = 0.66f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onSurface, maxLines = 1)
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
internal fun ProfileMetricRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    value: String,
    color: Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
            Icon(icon, contentDescription = null, tint = color, modifier = Modifier.padding(8.dp).size(20.dp))
        }
        Text(title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, color = color)
    }
}

@Composable
internal fun MaintenanceButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(8.dp),
        contentPadding = PaddingValues(horizontal = 8.dp)
    ) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelMedium)
    }
}

// ponytail: single on_demand mode — inferCourierRole() removed 2026-08; role is now constant.
internal fun List<Order>.filterByCourierRole(courierRole: String): List<Order> {
    return filter { it.normalizedWorkflowRole() == "on_demand" }
}

// ponytail: single on_demand mode — regular/other role mappings removed 2026-08.
internal fun normalizeCourierMode(courierRole: String): String = "on_demand"

internal fun courierRoleLabel(courierRole: String): String = "On Demand"

internal fun courierRoleHint(courierRole: String): String = "Siap menerima tawaran on-demand"

internal fun courierPendingLabel(courierRole: String): String = "menunggu"

internal fun courierCompletedLabel(courierRole: String): String = "Selesai"

internal fun courierCurrentTaskTitle(courierRole: String): String = "Tugas Saat Ini"

internal fun courierEmptyTaskTitle(courierRole: String): String = "Belum ada tugas aktif"

internal fun Order.communicationCallTargetType(): String {
    return if (communicationShouldCallRecipient()) {
        "recipient"
    } else {
        "customer"
    }
}

internal fun Order.communicationIsDeliveryGroup(): Boolean {
    return status.trim().lowercase() in setOf(
        "picked_up",
        "in_transit",
        "delivering",
        "delivered",
        "completed"
    )
}

internal fun Order.communicationShouldCallRecipient(): Boolean {
    return status.trim().lowercase() in setOf(
        "picked_up",
        "in_transit",
        "delivering"
    )
}

internal fun Order.communicationCallTargetLabel(): String {
    return when (communicationCallTargetType()) {
        "recipient" -> if (isMaintenanceService()) "Customer" else "Penerima"
        else -> customerName.takeIf { it.isNotBlank() } ?: "Pelanggan"
    }
}

internal fun Order.communicationChatTitle(): String {
    return if (isMaintenanceService()) {
        "Percakapan Layanan"
    } else if (communicationIsDeliveryGroup()) {
        "Percakapan Pengantaran"
    } else {
        "Hubungi Pelanggan"
    }
}

internal fun Order.communicationChatSubtitle(): String {
    return if (communicationIsDeliveryGroup()) {
        "Koordinasi customer, kurir, dan penerima tetap di satu percakapan order."
    } else if (isMaintenanceService()) {
        "Kirim pesan jika Anda butuh arahan lokasi layanan atau konfirmasi pekerjaan."
    } else {
        "Kirim pesan jika Anda butuh arahan pickup atau konfirmasi paket."
    }
}

internal fun Order.communicationChatPlaceholder(): String {
    return if (communicationIsDeliveryGroup()) {
        "Tulis pesan di grup pengantaran..."
    } else {
        "Tulis pesan untuk pelanggan..."
    }
}

internal fun orderSyncHint(isOnline: Boolean, lastRemoteSyncAt: Long?): String {
    if (!isOnline) return "Aktifkan On Duty untuk menerima order otomatis."
    if (lastRemoteSyncAt == null) return "Menunggu sinkronisasi order otomatis."

    val elapsedSeconds = ((System.currentTimeMillis() - lastRemoteSyncAt) / 1000).coerceAtLeast(0)
    return when {
        elapsedSeconds < 10 -> "Sinkron otomatis baru saja berjalan."
        elapsedSeconds < 60 -> "Sinkron terakhir ${elapsedSeconds} detik lalu."
        else -> "Sinkron terakhir ${elapsedSeconds / 60} menit lalu."
    }
}

internal fun openCourierMapNavigation(context: Context, address: String, point: LatLng? = null) {
    val validPoint = point?.takeIf { it.isValidNavigationPoint() }
    if (validPoint == null && address.isBlank()) return

    val preferredIntent = if (validPoint != null) {
        Intent(
            Intent.ACTION_VIEW,
            Uri.parse("geo:${validPoint.latitude},${validPoint.longitude}?q=${validPoint.latitude},${validPoint.longitude}")
        )
    } else {
        Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(address)}"))
    }

    val launchIntent = if (preferredIntent.resolveActivity(context.packageManager) != null) {
        preferredIntent
    } else if (validPoint != null) {
        Intent(
            Intent.ACTION_VIEW,
            Uri.parse("geo:${validPoint.latitude},${validPoint.longitude}?q=${validPoint.latitude},${validPoint.longitude}")
        )
    } else {
        Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=${Uri.encode(address)}"))
    }

    if (launchIntent.resolveActivity(context.packageManager) != null) {
        context.startActivity(launchIntent)
    }
}

internal fun DutyLocation.toLatLng(): LatLng = LatLng(latitude, longitude)

internal fun latLngOrNull(latitude: Double?, longitude: Double?): LatLng? {
    if (latitude == null || longitude == null) return null
    return LatLng(latitude, longitude).takeIf { it.isValidNavigationPoint() }
}

internal fun LatLng.isValidNavigationPoint(): Boolean {
    return !latitude.isNaN() &&
        !longitude.isNaN() &&
        !latitude.isInfinite() &&
        !longitude.isInfinite() &&
        latitude in -90.0..90.0 &&
        longitude in -180.0..180.0 &&
        !(latitude == 0.0 && longitude == 0.0)
}

internal const val ON_DEMAND_FOREGROUND_SYNC_INTERVAL_MS = 5_000L
internal const val ON_DEMAND_FOREGROUND_SYNC_MIN_INTERVAL_MS = 4_000L
internal const val FOREGROUND_SYNC_MAX_BACKOFF_MS = 120_000L
internal const val PUSH_SYNC_MIN_INTERVAL_MS = 2_000L
internal const val ON_DEMAND_OFFER_TTL_SECONDS = 15
internal val ACTIVE_ON_DEMAND_STATUSES = setOf("assigned", "accepted", "picked_up", "in_transit")

/** Radius soft-gate arrival maintenance service (standar industri: 100m). */
internal const val ARRIVAL_RADIUS_M = 100

/**
 * Jarak horizontal (meter) dari last known location ke titik layanan.
 * null jika lokasi belum tersedia / izin belum diberikan.
 */
internal fun currentDistanceMeters(context: Context, lat: Double, lng: Double): Int? {
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        ?: return null
    val provider = if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER))
        LocationManager.GPS_PROVIDER
    else LocationManager.NETWORK_PROVIDER
    val loc = try {
        lm.getLastKnownLocation(provider)
    } catch (_: SecurityException) {
        null
    }
    if (loc == null) return null
    val target = Location(provider).apply {
        latitude = lat
        longitude = lng
    }
    return loc.distanceTo(target).toInt()
}

internal data class DutyLocation(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float?
)

internal fun hasForegroundLocationPermission(context: Context): Boolean {
    return ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
}

internal fun hasBackgroundLocationPermission(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
        ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
}

internal suspend fun getLastKnownDutyLocation(context: Context): DutyLocation? {
    if (!hasForegroundLocationPermission(context)) return null

    return try {
        val client = LocationServices.getFusedLocationProviderClient(context)
        val location = client.lastLocation.await()
            ?: withTimeoutOrNull(8_000) {
                client.getCurrentLocation(
                    Priority.PRIORITY_HIGH_ACCURACY,
                    CancellationTokenSource().token
                ).await()
            }
        location?.let {
            DutyLocation(
                latitude = it.latitude,
                longitude = it.longitude,
                accuracy = it.takeIf { point -> point.hasAccuracy() }?.accuracy
            )
        }
    } catch (_: SecurityException) {
        null
    } catch (_: Exception) {
        null
    }
}
