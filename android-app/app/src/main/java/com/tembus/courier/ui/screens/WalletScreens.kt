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
import com.tembus.courier.ui.localization.CourierText as Text
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
import com.tembus.courier.ui.theme.TembusComponentDefaults
import com.tembus.courier.ui.theme.TembusSpacing
import com.tembus.courier.util.OrderSyncSignalBus
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.min

// Extracted from MainScreen.kt (Faza 2 refactor 2026-08)
@Composable
internal fun WalletContent(
    courierName: String,
    vehicleLabel: String,
    vehiclePlate: String?,
    rating: Double?,
    todayEarningsIdr: Int,
    isOnline: Boolean,
    localSecurityManager: LocalDeviceSecurityManager,
    earningsLedger: CourierEarningsLedger?,
    payoutSummary: CourierPayoutSummaryData?,
    performanceSummary: CourierPerformanceSummary?,
    payoutRequests: List<CourierPayoutRequestItem>,
    isPayoutSubmitting: Boolean,
    onRefreshPayout: () -> Unit,
    onRequestPayout: suspend (Int, String) -> Result<CourierPayoutRequestItem>
) {
    var showPayoutDialog by remember { mutableStateOf(false) }
    var showPayoutSecurityChallenge by remember { mutableStateOf(false) }
    var showPayoutHistory by remember { mutableStateOf(false) }
    var showLedgerHistory by remember { mutableStateOf(false) }
    var showAccountDetails by remember { mutableStateOf(false) }
    var selectedPayoutRequest by remember { mutableStateOf<CourierPayoutRequestItem?>(null) }

    if (showPayoutDialog && payoutSummary != null) {
        PayoutRequestDialog(
            payoutSummary = payoutSummary,
            isSubmitting = isPayoutSubmitting,
            onDismiss = { showPayoutDialog = false },
            onSubmit = onRequestPayout,
            onSubmitted = { request ->
                showPayoutDialog = false
                selectedPayoutRequest = request
                onRefreshPayout()
            }
        )
    }

    if (showPayoutSecurityChallenge) {
        LocalSecurityChallengeDialog(
            securityManager = localSecurityManager,
            title = "Verifikasi pencairan saldo",
            message = "Gunakan PIN atau biometrik lokal sebelum membuka pengajuan pencairan.",
            onCancel = { showPayoutSecurityChallenge = false },
            onVerified = {
                showPayoutSecurityChallenge = false
                showPayoutDialog = true
            }
        )
    }

    selectedPayoutRequest?.let { request ->
        PayoutRequestDetailDialog(
            request = request,
            onDismiss = { selectedPayoutRequest = null }
        )
    }

    if (showPayoutHistory) {
        AlertDialog(
            onDismissRequest = { showPayoutHistory = false },
            title = { Text("Riwayat payout", fontWeight = FontWeight.Black) },
            text = {
                if (payoutRequests.isEmpty()) {
                    Text("Belum ada pengajuan payout.")
                } else {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        payoutRequests.take(8).forEach { request ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        showPayoutHistory = false
                                        selectedPayoutRequest = request
                                    },
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = LogisticsOrange)
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(request.requestNumber, fontWeight = FontWeight.Bold)
                                    Text(request.statusLabel ?: request.status, style = MaterialTheme.typography.bodySmall)
                                }
                                Text(request.netAmountIdr.toRupiahCompact(), fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showPayoutHistory = false }) { Text("Tutup") }
            }
        )
    }

    if (showAccountDetails) {
        val account = payoutSummary?.payoutAccount ?: earningsLedger?.summary?.payoutAccount
        AlertDialog(
            onDismissRequest = { showAccountDetails = false },
            title = { Text("Rekening payout", fontWeight = FontWeight.Black) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        if (account == null) "Rekening utama belum terhubung."
                        else "${account.bankCode ?: "Bank"} • ${maskAccountNumber(account.accountNumber.orEmpty())}",
                        fontWeight = FontWeight.Bold
                    )
                    Text(account?.accountName ?: "Lengkapi verifikasi rekening melalui admin TEMBUS.")
                    Text(
                        "Perubahan rekening memerlukan verifikasi operasional sebelum dapat dipakai untuk pencairan.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showAccountDetails = false }) { Text("Tutup") }
            }
        )
    }

    if (showLedgerHistory) {
        AlertDialog(
            onDismissRequest = { showLedgerHistory = false },
            title = { Text("Aktivitas & mutasi saldo", fontWeight = FontWeight.Black) },
            text = {
                if (earningsLedger?.transactions.isNullOrEmpty()) {
                    Text("Belum ada mutasi saldo dari server.")
                } else {
                    Column(
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        earningsLedger?.transactions.orEmpty().forEach { transaction ->
                            StitchWalletTransactionRow(transaction)
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showLedgerHistory = false }) { Text("Tutup") }
            }
        )
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(TembusSpacing.Medium)
    ) {
        val ledgerSummary = earningsLedger?.summary
        val account = payoutSummary?.payoutAccount ?: earningsLedger?.summary?.payoutAccount
        val availableBalanceIdr = payoutSummary?.summary?.availableBalanceIdr
            ?: earningsLedger?.summary?.availableBalanceIdr
            ?: 0
        val accountStatus = account?.status?.lowercase().orEmpty()
        val isVerifiedAccount = account != null && accountStatus in setOf("verified", "active", "approved")
        val transactions = earningsLedger?.transactions.orEmpty()
        val dailyNetIdr = if (ledgerSummary != null) {
            ledgerSummary.todayNetEarningsIdr
        } else {
            performanceSummary?.todayEarningsIdr ?: todayEarningsIdr
        }
        val orderCount = ledgerSummary?.todayOrderCount ?: 0
        val grossTodayIdr = ledgerSummary?.todayOrderEarningsIdr ?: 0
        val tipTodayIdr = ledgerSummary?.todayTipEarningsIdr ?: 0
        val incentiveTodayIdr = ledgerSummary?.todayIncentiveEarningsIdr ?: 0
        val feeTodayIdr = ledgerSummary?.todayFeeIdr ?: 0

        StitchWalletHero(
            courierName = courierName,
            vehicleLabel = vehicleLabel,
            vehiclePlate = vehiclePlate,
            rating = rating,
            isOnline = isOnline,
            availableBalanceIdr = availableBalanceIdr,
            account = account,
            isVerifiedAccount = isVerifiedAccount,
            isPayoutSubmitting = isPayoutSubmitting,
            canRequestPayout = payoutSummary?.let { resolvePayoutActionState(it, isPayoutSubmitting).enabled } == true,
            onWithdraw = {
                if (localSecurityManager.settings.value.active) {
                    showPayoutSecurityChallenge = true
                } else {
                    showPayoutDialog = true
                }
            },
            onPayoutHistory = { showPayoutHistory = true },
            onAccountDetails = { showAccountDetails = true }
        )

        StitchDailySummaryCard(
            todayEarningsIdr = dailyNetIdr,
            orderEarningsIdr = grossTodayIdr,
            incentiveEarningsIdr = incentiveTodayIdr,
            feeIdr = feeTodayIdr,
            tipIdr = tipTodayIdr,
            orderCount = orderCount,
            dateLabel = SimpleDateFormat("EEEE, dd MMM", Locale("id", "ID")).format(Date())
        )

        StitchIncentiveCard(performanceSummary?.incentives.orEmpty())
        StitchProtectionCard()
        StitchWalletActivityCard(transactions, onViewAll = { showLedgerHistory = true })

        if (earningsLedger == null || payoutSummary == null) {
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = PrimaryLight.copy(alpha = 0.42f),
                shape = RoundedCornerShape(16.dp)
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Primary)
                    Text("Memperbarui saldo dan mutasi dari server...", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun StitchWalletHero(
    courierName: String,
    vehicleLabel: String,
    vehiclePlate: String?,
    rating: Double?,
    isOnline: Boolean,
    availableBalanceIdr: Int,
    account: com.tembus.courier.data.model.CourierPayoutAccount?,
    isVerifiedAccount: Boolean,
    isPayoutSubmitting: Boolean,
    canRequestPayout: Boolean,
    onWithdraw: () -> Unit,
    onPayoutHistory: () -> Unit,
    onAccountDetails: () -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = DeepForest,
        shape = RoundedCornerShape(22.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Surface(
                    color = if (isOnline) Success.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.12f),
                    shape = RoundedCornerShape(50)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(Modifier.size(7.dp).clip(CircleShape).background(if (isOnline) Success else Color.LightGray))
                        Text(if (isOnline) "ONLINE" else "OFFLINE", color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelSmall)
                    }
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        listOfNotNull(
                            rating?.takeIf { it > 0 }?.let { "★ ${"%.2f".format(Locale("id", "ID"), it)}" },
                            vehicleLabel.takeIf { it.isNotBlank() }
                        ).joinToString(" • ").ifBlank { "Profil operasional" },
                        color = Color.White.copy(alpha = 0.82f),
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        listOfNotNull(courierName.takeIf { it.isNotBlank() }, vehiclePlate?.takeIf { it.isNotBlank() }?.uppercase()).joinToString(" • "),
                        color = Color.White.copy(alpha = 0.62f),
                        style = MaterialTheme.typography.labelSmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                Spacer(Modifier.weight(1f))
                Icon(Icons.Default.NotificationsNone, contentDescription = "Notifikasi", tint = Color.White.copy(alpha = 0.82f), modifier = Modifier.size(20.dp))
            }

            Text(
                if (isVerifiedAccount) {
                    "BI REGULATED • ${account?.bankCode ?: "BANK"} • ${maskAccountNumber(account?.accountNumber.orEmpty())} / A/N ${account?.accountName ?: courierName}"
                } else {
                    "REKENING UTAMA • VERIFIKASI OPERASIONAL BELUM SELESAI"
                },
                color = Color.White.copy(alpha = 0.72f),
                style = MaterialTheme.typography.labelSmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("SALDO SIAP DITARIK (REAL-TIME)", color = Color.White.copy(alpha = 0.78f), style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                    Text(availableBalanceIdr.toRupiahCompact(), color = Color.White, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Black)
                    Text(
                        if (isVerifiedAccount) "Siap cair instan 24/7 ke rekening utama"
                        else "Pencairan aktif setelah rekening utama diverifikasi",
                        color = Color.White.copy(alpha = 0.72f),
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                Surface(color = Success.copy(alpha = 0.18f), shape = RoundedCornerShape(50)) {
                    Text(
                        if (isVerifiedAccount) "Aktif 24/7" else "Belum siap",
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            Button(
                onClick = onWithdraw,
                enabled = canRequestPayout && !isPayoutSubmitting,
                modifier = Modifier.fillMaxWidth().height(46.dp),
                shape = RoundedCornerShape(50),
                colors = ButtonDefaults.buttonColors(
                    containerColor = LogisticsOrange,
                    contentColor = Color.White,
                    disabledContainerColor = LogisticsOrange.copy(alpha = 0.42f),
                    disabledContentColor = Color.White.copy(alpha = 0.76f)
                )
            ) {
                if (isPayoutSubmitting) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                else Icon(Icons.Default.Bolt, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Tarik Dana Instan (Disbursement)", fontWeight = FontWeight.Bold)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(
                    onClick = onPayoutHistory,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(50),
                    contentPadding = PaddingValues(horizontal = 8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.28f))
                ) {
                    Icon(Icons.Default.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("Riwayat Payout", style = MaterialTheme.typography.labelSmall)
                }
                OutlinedButton(
                    onClick = onAccountDetails,
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(50),
                    contentPadding = PaddingValues(horizontal = 8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.28f))
                ) {
                    Icon(Icons.Default.AccountBalance, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(5.dp))
                    Text("Ubah Rekening", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun StitchDailySummaryCard(
    todayEarningsIdr: Int,
    orderEarningsIdr: Int,
    incentiveEarningsIdr: Int,
    feeIdr: Int,
    tipIdr: Int,
    orderCount: Int,
    dateLabel: String
) {
    StitchWalletSectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Ringkasan Hari Ini", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                Text(dateLabel.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("Realtime", color = Success, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
        }
        Row(
            modifier = Modifier.fillMaxWidth().background(PrimaryLight.copy(alpha = 0.56f), RoundedCornerShape(12.dp)).padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("Pendapatan Bersih", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            Text(todayEarningsIdr.toRupiahCompact(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, color = DeepForest)
        }
        StitchWalletAmountRow("Pendapatan Kotor${if (orderCount > 0) " ($orderCount Order)" else ""}", orderEarningsIdr.toRupiahCompact(), Icons.Default.LocalShipping)
        StitchWalletAmountRow("Tip Tunai & Digital", "+${tipIdr.toRupiahCompact()}", Icons.Default.ThumbUp)
        StitchWalletAmountRow("Bonus Insentif Harian", "+${incentiveEarningsIdr.toRupiahCompact()}", Icons.Default.Star)
        StitchWalletAmountRow("Potongan Platform", "-${feeIdr.toRupiahCompact()}", Icons.Default.RemoveCircleOutline)
    }
}

@Composable
private fun StitchIncentiveCard(incentives: List<com.tembus.courier.data.model.CourierIncentive>) {
    val activeIncentives = incentives.filter { it.safeForDriving }.take(3)
    val primaryIncentive = activeIncentives.firstOrNull()
    StitchWalletSectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Insentif Mingguan TEMBUS", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                Text(primaryIncentive?.title ?: "Target insentif belum tersedia", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            primaryIncentive?.let { Text("${it.progressPercent}%", color = LogisticsOrange, fontWeight = FontWeight.Black) }
        }
        if (primaryIncentive == null) {
            Text("Target akan muncul setelah data performa berhasil disinkronkan.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            Text("${primaryIncentive.progressDeliveries}/${primaryIncentive.targetDeliveries} order selesai", fontWeight = FontWeight.Bold)
            LinearProgressIndicator(
                progress = { (primaryIncentive.progressPercent / 100f).coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50)),
                color = LogisticsOrange,
                trackColor = PrimaryLight
            )
            Text(
                primaryIncentive.description.ifBlank { "Selesaikan target untuk mendapatkan bonus ${primaryIncentive.rewardIdr.toRupiahCompact()}." },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            activeIncentives.drop(1).forEach { incentive ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Success, modifier = Modifier.size(16.dp))
                    Text(
                        "${incentive.title} • ${incentive.progressDeliveries}/${incentive.targetDeliveries} • ${incentive.rewardIdr.toRupiahCompact()}",
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.weight(1f),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
        }
    }
}

@Composable
private fun StitchProtectionCard() {
    StitchWalletSectionCard {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Surface(color = Success.copy(alpha = 0.12f), shape = CircleShape) {
                Icon(Icons.Default.Security, contentDescription = null, tint = Success, modifier = Modifier.padding(10.dp).size(20.dp))
            }
            Column(Modifier.weight(1f)) {
                Text("BPJS Ketenagakerjaan", fontWeight = FontWeight.Black)
                Text("Status kepesertaan mengikuti verifikasi operasional TEMBUS.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text("INFO", color = Success, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Black)
        }
    }
}

@Composable
private fun StitchWalletActivityCard(
    transactions: List<CourierEarningsTransaction>,
    onViewAll: () -> Unit
) {
    StitchWalletSectionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Aktivitas & Mutasi Saldo", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
            TextButton(onClick = onViewAll, contentPadding = PaddingValues(0.dp)) {
                Text("Lihat Semua", color = LogisticsOrange, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
            }
        }
        if (transactions.isEmpty()) {
            Text("Belum ada mutasi saldo.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else {
            transactions.take(6).forEach { transaction ->
                StitchWalletTransactionRow(transaction)
            }
        }
    }
}

@Composable
private fun StitchWalletTransactionRow(transaction: CourierEarningsTransaction) {
    val isCredit = transaction.direction == "credit"
    val amountIdr = transaction.amountIdr.takeIf { it != 0 } ?: transaction.amountMinor.toInt()
    val icon = when {
        transaction.source.contains("tip", ignoreCase = true) -> Icons.Default.ThumbUp
        transaction.source.contains("payout", ignoreCase = true) -> Icons.Default.AccountBalanceWallet
        transaction.statementCategory.equals("order", ignoreCase = true) -> Icons.Default.LocalShipping
        transaction.statementCategory.equals("incentive", ignoreCase = true) -> Icons.Default.Star
        transaction.statementCategory.equals("fee", ignoreCase = true) -> Icons.Default.RemoveCircleOutline
        else -> Icons.Default.ReceiptLong
    }
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Surface(color = if (isCredit) Success.copy(alpha = 0.12f) else LogisticsOrange.copy(alpha = 0.12f), shape = CircleShape) {
            Icon(icon, contentDescription = null, tint = if (isCredit) Success else LogisticsOrange, modifier = Modifier.padding(8.dp).size(18.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(transaction.orderNumber ?: transaction.description ?: transaction.source.replace("_", " ").replaceFirstChar { it.uppercase() }, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(transaction.occurredAtLocal ?: transaction.settlementStatus.replace("_", " "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(
            (if (isCredit) "+" else "-") + amountIdr.toRupiahCompact(),
            color = if (isCredit) Success else LogisticsOrange,
            fontWeight = FontWeight.Black,
            style = MaterialTheme.typography.labelLarge
        )
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.10f))
}

@Composable
private fun StitchWalletAmountRow(label: String, amount: String, icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Icon(icon, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(16.dp))
        Text(label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        Text(amount, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold, color = DeepForest)
    }
}

@Composable
private fun StitchWalletSectionCard(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.10f))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(11.dp), content = content)
    }
}

@Composable
internal fun CourierWalletSkeleton() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        shape = TembusComponentDefaults.cardShape(),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.10f))
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
                CircularProgressIndicator(modifier = Modifier.size(22.dp), color = Primary, strokeWidth = 3.dp)
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Menyiapkan ledger pendapatan", fontWeight = FontWeight.Bold)
                    CourierSkeletonBlock(width = 240.dp, height = 12.dp)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                CourierSkeletonBlock(width = 96.dp, height = 52.dp)
                CourierSkeletonBlock(width = 96.dp, height = 52.dp)
                CourierSkeletonBlock(width = 96.dp, height = 52.dp)
            }
            repeat(3) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        CourierSkeletonBlock(width = 150.dp, height = 14.dp)
                        CourierSkeletonBlock(width = 92.dp, height = 11.dp)
                    }
                    CourierSkeletonBlock(width = 82.dp, height = 16.dp)
                }
            }
        }
    }
}
