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
import com.tembus.courier.ui.localization.CourierTextCatalog
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
internal fun ProfileContent(
    courierProfile: com.tembus.courier.data.model.CourierProfile?,
    courierName: String,
    courierRole: String,
    localSecurityManager: LocalDeviceSecurityManager,
    pendingSyncCount: Int,
    todayEarningsIdr: Int,
    totalEarningsIdr: Int,
    performanceSummary: CourierPerformanceSummary?,
    capabilityProfile: CourierCapabilityProfile?,
    authToken: String?,
    onCompleteTraining: () -> Unit,
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
    onOptimizeBattery: () -> Unit,
    onClearCache: () -> Unit,
    onUpdateCapacity: (Double?, Int?) -> Unit,
    onRequestServiceUpgrade: () -> Unit,
    onUpdateRadius: (Int) -> Unit = {}
) {
    var showDiagnostics by remember { mutableStateOf(false) }
    var showResetLocalDataDialog by remember { mutableStateOf(false) }
    var showCapacityDialog by remember { mutableStateOf(false) }
    var capacityWeight by remember { mutableStateOf(courierProfile?.maxWeightCapacityKg?.toString() ?: "") }
    var capacityPackages by remember { mutableStateOf(courierProfile?.maxPackagesCapacity?.toString() ?: "") }

    if (showCapacityDialog) {
        AlertDialog(
            onDismissRequest = { showCapacityDialog = false },
            title = { Text("Atur Kapasitas Bawaan") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Kapasitas ini digunakan untuk Bulk Order (multi-stop).", style = MaterialTheme.typography.bodyMedium)
                    androidx.compose.material3.OutlinedTextField(
                        value = capacityWeight,
                        onValueChange = { capacityWeight = it },
                        label = { Text("Maks. Berat (kg)") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
                    )
                    androidx.compose.material3.OutlinedTextField(
                        value = capacityPackages,
                        onValueChange = { capacityPackages = it },
                        label = { Text("Maks. Jumlah Paket") },
                        keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number)
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showCapacityDialog = false
                        onUpdateCapacity(capacityWeight.toDoubleOrNull(), capacityPackages.toIntOrNull())
                    }
                ) { Text("Simpan") }
            },
            dismissButton = {
                TextButton(onClick = { showCapacityDialog = false }) { Text("Batal") }
            }
        )
    }

    if (showResetLocalDataDialog) {
        AlertDialog(
            onDismissRequest = { showResetLocalDataDialog = false },
            title = { Text("Reset Data Lokal") },
            text = {
                Text(
                    if (pendingSyncCount > 0) {
                        "Masih ada $pendingSyncCount data yang belum terkirim. Selesaikan sinkronisasi dulu sebelum reset data lokal."
                    } else {
                        "Tindakan ini membersihkan berkas sementara aplikasi. Order dan sesi akun tetap tersimpan."
                    }
                )
            },
            confirmButton = {
                TextButton(
                    enabled = pendingSyncCount == 0,
                    onClick = {
                        showResetLocalDataDialog = false
                        onClearCache()
                    }
                ) {
                    Text("Reset", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetLocalDataDialog = false }) {
                    Text("Batal")
                }
            },
            shape = RoundedCornerShape(8.dp)
        )
    }

    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Text(
            text = "Profil Kurir",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )

        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.Transparent)
        ) {
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
            ) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .size(140.dp)
                        .clip(RoundedCornerShape(70.dp))
                        .background(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.10f), Color.Transparent)))
                )
                Row(
                    modifier = Modifier.padding(18.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(14.dp),
                        color = Color.White.copy(alpha = 0.16f),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.22f))
                    ) {
                        if (!courierProfile?.profilePhotoUrl.isNullOrBlank() && authToken != null) {
                            AsyncImage(
                                model = coil.request.ImageRequest.Builder(LocalContext.current)
                                    .data("${com.tembus.courier.BuildConfig.BASE_URL.dropLastWhile { it == '/' }}${courierProfile?.profilePhotoUrl}")
                                    .addHeader("Authorization", "Bearer $authToken")
                                    .crossfade(true)
                                    .build(),
                                contentDescription = CourierTextCatalog.translate("Foto Profil"),
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(56.dp).clip(RoundedCornerShape(14.dp))
                            )
                        } else {
                            Icon(
                                Icons.Default.Person,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.padding(12.dp).size(28.dp)
                            )
                        }
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text(courierName, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, color = Color.White)
                        Text(courierRoleLabel(courierRole), style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
                    }
                    Surface(
                        color = Color.White.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(10.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.34f))
                    ) {
                        Row(
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(
                                Icons.Default.VerifiedUser,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(16.dp)
                            )
                            Text(
                                "Aktif",
                                style = MaterialTheme.typography.labelLarge,
                                color = Color.White,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        LocalSecuritySettingsPanel(
            securityManager = localSecurityManager,
            onNotice = {}
        )

        CourierLanguagePickerCard()

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(16.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f))
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("Kesiapan Operasional", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                ProfileMetricRow(
                    icon = Icons.Default.AccountBalanceWallet,
                    title = "Pendapatan hari ini",
                    value = todayEarningsIdr.toRupiahCompact(),
                    color = Secondary
                )
                ProfileMetricRow(
                    icon = Icons.Default.Payments,
                    title = "Total pendapatan",
                    value = totalEarningsIdr.toRupiahCompact(),
                    color = Success
                )
                ProfileMetricRow(
                    icon = Icons.Default.CloudDone,
                    title = "Sinkronisasi",
                    value = if (pendingSyncCount > 0) "$pendingSyncCount tertunda" else "Tersinkron",
                    color = if (pendingSyncCount > 0) Warning else Success
                )
                ProfileMetricRow(
                    icon = Icons.Default.GpsFixed,
                    title = "Lokasi & tracking",
                    value = "Siap",
                    color = Primary
                )
                ProfileMetricRow(
                    icon = Icons.Default.BatteryChargingFull,
                    title = "Latar belakang",
                    value = "Aktif",
                    color = Success
                )
            }
        }

        capabilityProfile?.let { capability ->
            val enabledCapabilities = capability.serviceCapabilities.filter { item ->
                item.status.equals("enabled", ignoreCase = true)
            }
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f))
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Kendaraan & Layanan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        TextButton(onClick = { showCapacityDialog = true }) {
                            Text("Atur Kapasitas", color = LogisticsOrange)
                        }
                    }
                    capability.vehicle?.let { vehicle ->
                        Surface(color = PrimaryLight.copy(alpha = 0.72f), shape = RoundedCornerShape(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                Icon(Icons.Default.TwoWheeler, contentDescription = null, tint = Primary, modifier = Modifier.size(28.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        listOfNotNull(vehicle.brand, vehicle.model).joinToString(" ").ifBlank { courierRoleLabel(courierRole) },
                                        fontWeight = FontWeight.Black,
                                        color = Primary
                                    )
                                    Text(
                                        "${vehicle.plateNumber} • ${vehicle.engineCc ?: 0} cc • ${vehicle.productionYear ?: "-"}",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                CapabilityStatusPill(vehicle.verificationStatus)
                            }
                        }
                    }

                    enabledCapabilities.take(5).forEach { item ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Surface(
                                color = Color.Transparent,
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Icon(
                                    if (item.status == "enabled") Icons.Default.CheckCircle else Icons.Default.PendingActions,
                                    contentDescription = null,
                                    tint = if (item.status == "enabled") Success else Warning,
                                    modifier = Modifier.padding(2.dp).size(20.dp)
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Text(item.serviceName, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text(
                                    "${item.serviceCategory.replace("_", " ")} • maks ${item.maxWeightKg ?: 0.0} kg",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            CapabilityStatusPill(item.status)
                        }
                    }
                    if (enabledCapabilities.isEmpty()) {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = Warning.copy(alpha = 0.12f),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(
                                "Belum ada layanan aktif untuk kendaraan ini.",
                                modifier = Modifier.padding(12.dp),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    // FOOD-BIKE-029: dropdown radius jangkauan food delivery
                    // (1-20 km, sesuai CHECK constraint DB & endpoint PUT /courier/radius)
                    val radiusOptions = listOf(1, 2, 4, 6, 10, 12, 14, 16, 18, 20)
                    var selectedRadius by remember(courierProfile?.radiusMaxKm) {
                        mutableStateOf(courierProfile?.radiusMaxKm ?: 1)
                    }
                    var radiusExpanded by remember { mutableStateOf(false) }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            Icons.Default.Radar,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.size(18.dp)
                        )
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Radius Jangkauan Food",
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.bodyMedium
                            )
                            Text(
                                "Driver sepeda: batas jarak terima order food",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Box {
                            OutlinedButton(
                                onClick = { radiusExpanded = !radiusExpanded },
                                modifier = Modifier.height(40.dp)
                            ) {
                                Text("$selectedRadius km", fontWeight = FontWeight.Bold)
                                Icon(
                                    Icons.Default.ArrowDropDown,
                                    contentDescription = CourierTextCatalog.translate("Pilih radius"),
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                            DropdownMenu(
                                expanded = radiusExpanded,
                                onDismissRequest = { radiusExpanded = false }
                            ) {
                                radiusOptions.forEach { r ->
                                    DropdownMenuItem(
                                        text = { Text("$r km") },
                                        onClick = {
                                            radiusExpanded = false
                                            selectedRadius = r
                                            onUpdateRadius(r)
                                        }
                                    )
                                }
                            }
                        }
                    }

                    HorizontalDivider()
                    Text("Onboarding", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    capability.onboardingSteps.forEach { step ->
                        ProfileMetricRow(
                            icon = if (step.status == "complete") Icons.Default.CheckCircle else Icons.Default.PendingActions,
                            title = step.title,
                            value = step.status.replace("_", " "),
                            color = if (step.status == "complete") Success else Warning
                        )
                    }
                    if (capability.trainingCompletions.isEmpty()) {
                        Button(
                            onClick = onCompleteTraining,
                            modifier = Modifier.fillMaxWidth().height(48.dp),
                            shape = RoundedCornerShape(8.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Primary)
                        ) {
                            Icon(Icons.Default.School, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Selesaikan Training Operasional")
                        }
                    }
                }
            }
        }

        performanceSummary?.let { summary ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Surface(color = Secondary.copy(alpha = 0.12f), shape = RoundedCornerShape(8.dp)) {
                            Icon(Icons.Default.WorkspacePremium, contentDescription = null, tint = Secondary, modifier = Modifier.padding(10.dp).size(22.dp))
                        }
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Performa Kurir", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                "Tier ${summary.tier.tierName} • ${summary.tier.benefitSummary}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 2,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        MiniProfileStat("Hari ini", summary.todayEarningsIdr.toRupiahCompact(), Modifier.weight(1f))
                        MiniProfileStat("Minggu ini", summary.weekEarningsIdr.toRupiahCompact(), Modifier.weight(1f))
                        MiniProfileStat("Rating", "%.1f".format(summary.avgRating), Modifier.weight(1f))
                    }
                    ProfileMetricRow(
                        icon = Icons.Default.TaskAlt,
                        title = "Completion rate",
                        value = "${summary.completionRatePct}%",
                        color = Success
                    )
                    ProfileMetricRow(
                        icon = Icons.Default.Bolt,
                        title = "Acceptance rate",
                        value = "${summary.acceptanceRatePct}%",
                        color = Primary
                    )
                    if (summary.incentives.isNotEmpty()) {
                        HorizontalDivider()
                        Text("Insentif aktif", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                        summary.incentives.take(2).forEach { incentive ->
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(incentive.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        "${incentive.progressPercent}%",
                                        style = MaterialTheme.typography.labelLarge,
                                        color = Secondary,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                                LinearProgressIndicator(
                                    progress = { incentive.progressPercent.coerceIn(0, 100) / 100f },
                                    modifier = Modifier.fillMaxWidth().height(8.dp),
                                    color = Secondary,
                                    trackColor = PrimaryLight
                                )
                                Text(
                                    "${incentive.progressDeliveries}/${incentive.targetDeliveries} selesai • Bonus ${incentive.rewardIdr.toRupiahCompact()}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Surface(color = PrimaryLight, shape = RoundedCornerShape(8.dp)) {
                        Icon(
                            Icons.Default.HealthAndSafety,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.padding(10.dp).size(22.dp)
                        )
                    }
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Kesehatan Aplikasi", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(
                            if (pendingSyncCount > 0) "Perlu sinkronisasi data tertunda" else "Aplikasi siap untuk operasional",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    TextButton(onClick = { showDiagnostics = !showDiagnostics }) {
                        Text(if (showDiagnostics) "Tutup" else "Diagnostik")
                    }
                }

                Button(
                    onClick = onOptimizeBattery,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Secondary)
                ) {
                    Icon(Icons.Default.BatteryChargingFull, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Optimalkan Latar Belakang")
                }

                AnimatedVisibility(visible = showDiagnostics) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        HorizontalDivider()
                        ProfileMetricRow(
                            icon = if (pendingSyncCount > 0) Icons.Default.SyncProblem else Icons.Default.CheckCircle,
                            title = "Status data lokal",
                            value = if (pendingSyncCount > 0) "$pendingSyncCount belum terkirim" else "Aman",
                            color = if (pendingSyncCount > 0) Warning else Success
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            MaintenanceButton(
                                icon = Icons.Default.Sync,
                                label = "Sinkronkan",
                                onClick = onSyncNow,
                                modifier = Modifier.weight(1f)
                            )
                            MaintenanceButton(
                                icon = Icons.Default.DeleteSweep,
                                label = "Reset Lokal",
                                onClick = { showResetLocalDataDialog = true },
                                modifier = Modifier.weight(1f),
                                enabled = pendingSyncCount == 0
                            )
                        }
                    }
                }
            }
        }

        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(8.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("Layanan & Kemampuan", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Text(
                    "Tingkatkan pendapatan dengan menambahkan layanan baru seperti Tambal Ban atau Towing.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Button(
                    onClick = onRequestServiceUpgrade,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Icon(Icons.Default.Build, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Daftar Layanan Tambahan")
                }
            }
        }

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
        ) {
            Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Keluar Aplikasi")
        }
    }
}
