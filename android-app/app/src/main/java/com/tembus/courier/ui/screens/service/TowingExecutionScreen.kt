package com.tembus.courier.ui.screens.service

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.tembus.courier.domain.TowingNextActionType
import com.tembus.courier.domain.TowingStage

private val TowingExecutionBackground = Color(0xFFF7F8F6)
private val TowingExecutionForest = Color(0xFF004D36)
private val TowingExecutionGreen = Color(0xFF087A54)
private val TowingExecutionOrange = Color(0xFFFF7800)
private val TowingExecutionInk = Color(0xFF17221D)
private val TowingExecutionMuted = Color(0xFF6A766F)
private val TowingExecutionSoftGreen = Color(0xFFE8F2EC)
private val TowingExecutionSoftOrange = Color(0xFFFFF0E5)
private val TowingExecutionBorder = Color(0xFFDDE6E0)

/** Figma-aligned active towing ticket for node 13-2568. */
@Composable
fun TowingExecutionScreen(
    orderId: String,
    uiState: TowingFlowUiState,
    inspectionPhoto: Bitmap?,
    loadingPhoto: Bitmap?,
    unloadingPhoto: Bitmap?,
    observedType: String,
    observedMake: String,
    observedModel: String,
    observedPlate: String,
    verificationNotes: String,
    vehicleMatched: Boolean,
    vehicleVerificationReady: Boolean,
    actionEnabled: Boolean,
    actionHint: String?,
    showManualArrivalAction: Boolean,
    onBackClick: () -> Unit,
    onAction: () -> Unit,
    onManualArrival: () -> Unit,
    onObservedTypeChange: (String) -> Unit,
    onObservedMakeChange: (String) -> Unit,
    onObservedModelChange: (String) -> Unit,
    onObservedPlateChange: (String) -> Unit,
    onVerificationNotesChange: (String) -> Unit,
    onVehicleMatchedChange: (Boolean) -> Unit,
    onInspectionPhotoCaptured: (Bitmap) -> Unit,
    onLoadingPhotoCaptured: (Bitmap) -> Unit,
    onUnloadingPhotoCaptured: (Bitmap) -> Unit,
) {
    val context = LocalContext.current
    val vehicle = uiState.customerVehicle
    val phone = uiState.customerPhone.trim().replace(Regex("[^0-9+]"), "")
    val canContact = phone.isNotBlank()
    val ticket = uiState.orderNumber.ifBlank { orderId.take(8).uppercase() }
    val vehicleLabel = listOf(vehicle?.make.orEmpty(), vehicle?.model.orEmpty())
        .filter(String::isNotBlank)
        .joinToString(" ")
        .ifBlank { vehicle?.type?.ifBlank { "Kendaraan customer" } ?: "Kendaraan customer" }
    val actionStage = uiState.stage

    Scaffold(
        containerColor = TowingExecutionBackground,
        topBar = {
            Row(
                modifier = Modifier.fillMaxWidth().background(TowingExecutionBackground).padding(start = 8.dp, end = 16.dp, top = 12.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBackClick) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Kembali", tint = TowingExecutionInk)
                }
                Column {
                    Text("TIKET AKTIF", color = TowingExecutionOrange, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp)
                    Text("Penanganan Derek $ticket", color = TowingExecutionInk, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        },
        bottomBar = {
            Surface(color = Color.White, shadowElevation = 10.dp, border = androidx.compose.foundation.BorderStroke(1.dp, TowingExecutionBorder)) {
                Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (!actionHint.isNullOrBlank()) {
                        Text(actionHint, color = TowingExecutionMuted, fontSize = 11.sp, lineHeight = 15.sp)
                    }
                    if (showManualArrivalAction) {
                        OutlinedButton(
                            onClick = onManualArrival,
                            modifier = Modifier.fillMaxWidth().height(42.dp),
                            shape = RoundedCornerShape(22.dp),
                        ) {
                            Text("Konfirmasi manual sudah tiba", fontWeight = FontWeight.Bold)
                        }
                    }
                    Button(
                        onClick = onAction,
                        enabled = actionEnabled && !uiState.isLoading,
                        modifier = Modifier.fillMaxWidth().height(54.dp),
                        shape = RoundedCornerShape(28.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TowingExecutionOrange, contentColor = Color.White),
                    ) {
                        Text(if (uiState.isLoading) "Memproses..." else uiState.nextActionLabel, fontWeight = FontWeight.Bold)
                    }
                }
            }
        },
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                ExecutionPill("STATUS OPERASIONAL AKTIF", TowingExecutionSoftOrange, TowingExecutionOrange)
                ExecutionPill("#TWG-${ticket.takeLast(6)}", TowingExecutionSoftGreen, TowingExecutionForest)
            }

            ExecutionLocationCard(uiState)
            TowingSafetyProtocolCard(uiState)
            TowingUnitCard(uiState, vehicleLabel, canContact, phone, context)
            TowingCustomerVehicleCard(uiState, vehicleLabel)

            if (actionStage == TowingStage.INSPECT_VEHICLE) {
                RoadsideVehicleVerificationCard(
                    customerVehicle = vehicle,
                    observedType = observedType,
                    observedMake = observedMake,
                    observedModel = observedModel,
                    observedPlate = observedPlate,
                    notes = verificationNotes,
                    matched = vehicleMatched,
                    onObservedTypeChange = onObservedTypeChange,
                    onObservedMakeChange = onObservedMakeChange,
                    onObservedModelChange = onObservedModelChange,
                    onObservedPlateChange = onObservedPlateChange,
                    onNotesChange = onVerificationNotesChange,
                    onMatchedChange = onVehicleMatchedChange,
                )
                InspectionPhotoCard(
                    photo = inspectionPhoto,
                    uploadedUrl = uiState.inspectionBeforePhotoUrl,
                    title = "Foto kondisi awal kendaraan",
                    description = if (vehicleVerificationReady) "Foto siap dikirim sebagai bukti sebelum loading." else "Cocokkan kendaraan dan ambil foto sebelum melanjutkan.",
                    onPhotoCaptured = onInspectionPhotoCaptured,
                )
            }

            if (actionStage == TowingStage.LOADING && uiState.loadingPhotoUrl.isNullOrBlank()) {
                InspectionPhotoCard(
                    photo = loadingPhoto,
                    uploadedUrl = uiState.loadingPhotoUrl,
                    title = "Foto kendaraan saat loading",
                    description = "Ambil foto ketika kendaraan sudah aman di atas tow truck.",
                    onPhotoCaptured = onLoadingPhotoCaptured,
                )
            }

            if (actionStage == TowingStage.UNLOADING && uiState.unloadingPhotoUrl.isNullOrBlank()) {
                InspectionPhotoCard(
                    photo = unloadingPhoto,
                    uploadedUrl = uiState.unloadingPhotoUrl,
                    title = "Foto kendaraan saat unloading",
                    description = "Ambil foto saat kendaraan diturunkan sebelum serah terima.",
                    onPhotoCaptured = onUnloadingPhotoCaptured,
                )
            }

            TowingChecklistCard(uiState)
            TowingLockedTariffCard(uiState)
            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun ExecutionLocationCard(uiState: TowingFlowUiState) {
    ExecutionCard {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Default.LocationOn, contentDescription = null, tint = TowingExecutionOrange, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("ZONA BAHU JALAN TOL", color = TowingExecutionOrange, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(uiState.pickupAddress.ifBlank { uiState.activeAddress.ifBlank { "Lokasi pickup sedang disinkronkan" } }, color = TowingExecutionInk, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text("Pastikan area berhenti aman sebelum proses derek.", color = TowingExecutionMuted, fontSize = 12.sp)
            }
        }
        Spacer(Modifier.height(10.dp))
        Surface(color = TowingExecutionSoftGreen, shape = RoundedCornerShape(12.dp)) {
            Row(modifier = Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Navigation, contentDescription = null, tint = TowingExecutionGreen, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(7.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("Tujuan drop-off", color = TowingExecutionMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Text(uiState.dropoffAddress.ifBlank { "Tujuan sedang disinkronkan" }, color = TowingExecutionInk, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun TowingSafetyProtocolCard(uiState: TowingFlowUiState) {
    val vehicleCondition = uiState.customerVehicle?.towingConditions.orEmpty().filter(String::isNotBlank)
    ExecutionCard(containerColor = TowingExecutionForest) {
        Row(verticalAlignment = Alignment.Top) {
            Icon(Icons.Default.WarningAmber, contentDescription = null, tint = TowingExecutionOrange, modifier = Modifier.size(24.dp))
            Spacer(Modifier.width(10.dp))
            Column {
                Text("PROTOKOL WAJIB KESELAMATAN TOL", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Text("Armada tiba di bahu jalan. Lampu hazard, pengaman dan komunikasi tetap aktif sesuai SOP.", color = Color.White.copy(alpha = 0.72f), fontSize = 12.sp, lineHeight = 17.sp)
            }
        }
        Spacer(Modifier.height(10.dp))
        val safetyItems = buildList {
            add("Lampu hazard & strobo derek aktif")
            add("Segitiga pengaman dipasang di belakang unit")
            add("Jalur dan area kerja aman sebelum loading")
            vehicleCondition.firstOrNull()?.let { add(it) }
        }.distinct().take(4)
        Column(modifier = Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.12f), RoundedCornerShape(10.dp)).padding(9.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
            safetyItems.forEach { item ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Icon(Icons.Default.CheckCircle, contentDescription = null, tint = TowingExecutionSoftGreen, modifier = Modifier.size(18.dp))
                    Text(item, color = Color.White.copy(alpha = 0.88f), fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun TowingUnitCard(uiState: TowingFlowUiState, vehicleLabel: String, canContact: Boolean, phone: String, context: android.content.Context) {
    val initials = uiState.customerName.trim().split(Regex("\\s+")).mapNotNull { it.firstOrNull()?.uppercase() }.take(2).joinToString("").ifBlank { "CU" }
    ExecutionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(44.dp).clip(CircleShape).background(TowingExecutionForest), contentAlignment = Alignment.Center) {
                Text(initials, color = Color.White, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(uiState.customerName.ifBlank { "Pelanggan" }, color = TowingExecutionInk, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("Permintaan towing • $vehicleLabel", color = TowingExecutionMuted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (canContact) {
                IconButton(onClick = { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }) {
                    Icon(Icons.Default.Call, contentDescription = "Telepon pelanggan", tint = TowingExecutionGreen)
                }
                IconButton(onClick = { context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:$phone"))) }) {
                    Icon(Icons.Default.ChatBubbleOutline, contentDescription = "Kirim pesan", tint = TowingExecutionOrange)
                }
            }
        }
    }
}

@Composable
private fun TowingCustomerVehicleCard(uiState: TowingFlowUiState, vehicleLabel: String) {
    val vehicle = uiState.customerVehicle
    val photoUrl = vehicle?.photoItems?.firstOrNull { it.url.isNotBlank() }?.url ?: vehicle?.photoUrls?.firstOrNull { it.isNotBlank() }
    ExecutionCard(contentPadding = 0.dp) {
        if (!photoUrl.isNullOrBlank()) {
            AsyncImage(model = photoUrl, contentDescription = "Foto kendaraan customer", modifier = Modifier.fillMaxWidth().height(184.dp), contentScale = ContentScale.Crop)
        } else {
            Box(modifier = Modifier.fillMaxWidth().height(128.dp).background(TowingExecutionSoftGreen), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Default.LocalShipping, contentDescription = null, tint = TowingExecutionForest, modifier = Modifier.size(34.dp))
                    Text("Foto unit belum tersedia dari server", color = TowingExecutionMuted, fontSize = 12.sp)
                }
            }
        }
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.DirectionsCar, contentDescription = null, tint = TowingExecutionGreen, modifier = Modifier.size(19.dp))
                Spacer(Modifier.width(7.dp))
                Text("KENDARAAN DITANGANI", color = TowingExecutionMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
            Text(vehicleLabel, color = TowingExecutionInk, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            val details = listOf(vehicle?.condition, vehicle?.damage, vehicle?.accessConstraints).mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
            Text(details.joinToString(" • ").ifBlank { "Detail kondisi kendaraan mengikuti order server." }, color = TowingExecutionMuted, fontSize = 12.sp)
            Surface(color = TowingExecutionSoftOrange, shape = RoundedCornerShape(11.dp)) {
                Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    Icon(Icons.Default.Info, contentDescription = null, tint = TowingExecutionOrange, modifier = Modifier.size(18.dp))
                    Text("Pastikan titik tumpu dan metode derek sesuai kondisi kendaraan sebelum loading.", color = TowingExecutionMuted, fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun TowingChecklistCard(uiState: TowingFlowUiState) {
    val current = uiState.currentStepIndex
    val items = listOf(
        "Tiba di zona pickup" to 1,
        "Verifikasi identitas & kendaraan" to 2,
        "Inspeksi kondisi awal" to 3,
        "Loading kendaraan" to 4,
        "Perjalanan ke tujuan" to 5,
        "Unloading & serah terima" to 7,
    )
    ExecutionCard {
        Text("CHECKLIST OPERASIONAL", color = TowingExecutionMuted, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
        Row(verticalAlignment = Alignment.Top) {
            Text("Eksekusi Derek Towing", color = TowingExecutionInk, fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            ExecutionPill("${current.coerceAtLeast(0)}/7", TowingExecutionSoftGreen, TowingExecutionForest)
        }
        Spacer(Modifier.height(6.dp))
        items.forEach { (label, step) ->
            val done = current >= step
            val active = !done && current + 1 >= step
            Row(modifier = Modifier.fillMaxWidth().background(if (active) TowingExecutionSoftOrange else Color.Transparent, RoundedCornerShape(11.dp)).padding(horizontal = 8.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(20.dp).border(1.dp, if (done) TowingExecutionForest else if (active) TowingExecutionOrange else TowingExecutionMuted.copy(alpha = 0.5f), RoundedCornerShape(3.dp)).background(if (done) TowingExecutionForest else Color.Transparent, RoundedCornerShape(3.dp)), contentAlignment = Alignment.Center) {
                    if (done) Icon(Icons.Default.Check, contentDescription = "Selesai", tint = Color.White, modifier = Modifier.size(14.dp))
                }
                Spacer(Modifier.width(9.dp))
                Text(label, color = if (active) TowingExecutionOrange else TowingExecutionInk, fontSize = 12.sp, fontWeight = if (active || done) FontWeight.Bold else FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun TowingLockedTariffCard(uiState: TowingFlowUiState) {
    val earnings = uiState.earnings
    ExecutionCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Lock, contentDescription = null, tint = TowingExecutionForest, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(7.dp))
            Text("Tarif Resmi Terkunci", color = TowingExecutionInk, fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            ExecutionPill("PASTI PAS", TowingExecutionSoftGreen, TowingExecutionForest)
        }
        Spacer(Modifier.height(8.dp))
        TowingMoneyRow("Jasa towing", earnings?.serviceFee ?: 0L)
        TowingMoneyRow("Jarak / perjalanan", earnings?.travelFee ?: 0L)
        Surface(color = TowingExecutionSoftGreen, shape = RoundedCornerShape(14.dp)) {
            Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("TOTAL PENGHASILAN MITRA", color = TowingExecutionForest, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Text("Otomatis masuk Dompet TEMBUS", color = TowingExecutionForest, fontSize = 11.sp)
                }
                Text(formatTowingExecutionRupiah(earnings?.estimatedNetEarnings ?: 0L), color = TowingExecutionForest, fontSize = 18.sp, fontWeight = FontWeight.Black)
            }
        }
        Spacer(Modifier.height(8.dp))
        Text("Nilai ini berasal dari settlement server dan tidak berubah karena inspeksi atau negosiasi di lapangan.", color = TowingExecutionMuted, fontSize = 11.sp)
    }
}

@Composable
private fun TowingMoneyRow(label: String, amount: Long) {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = TowingExecutionMuted, fontSize = 12.sp)
        Text(if (amount > 0) formatTowingExecutionRupiah(amount) else "—", color = TowingExecutionInk, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun ExecutionCard(containerColor: Color = Color.White, contentPadding: androidx.compose.ui.unit.Dp = 14.dp, content: @Composable ColumnScope.() -> Unit) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), colors = CardDefaults.cardColors(containerColor = containerColor), elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)) {
        Column(modifier = Modifier.padding(contentPadding), content = content)
    }
}

@Composable
private fun ExecutionPill(text: String, background: Color, contentColor: Color) {
    Surface(color = background, contentColor = contentColor, shape = RoundedCornerShape(16.dp)) {
        Text(text, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold, lineHeight = 12.sp)
    }
}

private fun formatTowingExecutionRupiah(amount: Long): String = "Rp%,d".format(amount).replace(',', '.')
