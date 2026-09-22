package com.tembus.customer.ui.screens.call

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalAnimationApi
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import com.tembus.customer.ui.localization.CustomerText as Text
import com.tembus.customer.ui.localization.CustomerTextCatalog
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.theme.Primary

private val CallCanvas = Color(0xFFF2FCF3)
private val CallSurface = Color.White
private val CallGreen = Color(0xFF075C2F)
private val CallGreenSoft = Color(0xFFE8F5EC)
private val CallOrange = Color(0xFFFF6B00)
private val CallText = Color(0xFF18231D)
private val CallMuted = Color(0xFF66736B)
private val CallBorder = Color(0xFFD7E8DC)

enum class InAppCallState {
    OUTGOING,
    INCOMING,
    ACCEPTED,
    ENDED,
    MISSED,
    FAILED;

    companion object {
        fun fromRoute(value: String?): InAppCallState {
            return entries.firstOrNull { it.name.equals(value, ignoreCase = true) } ?: OUTGOING
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalAnimationApi::class)
@Composable
fun InAppCallScreen(
    orderId: String,
    targetName: String?,
    initialState: InAppCallState,
    routeCallId: String? = null,
    onBackClick: () -> Unit,
    onOpenChat: () -> Unit,
    viewModel: InAppCallViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()
    val resolvedTargetName = uiState.targetName.takeIf { it.isNotBlank() }
        ?: targetName?.takeIf { it.isNotBlank() }
        ?: "Kurir Anda"
    val callState = uiState.callState
    var micPermissionGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        micPermissionGranted = granted
    }

    LaunchedEffect(orderId, micPermissionGranted, initialState, routeCallId) {
        if (micPermissionGranted) {
            viewModel.start(
                orderId = orderId,
                targetName = targetName,
                initialState = initialState,
                routeCallId = routeCallId
            )
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(text = "Active VoIP Call", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                        Text(
                            text = "MASKED CALL ACTIVE",
                            color = CallOrange,
                            fontWeight = FontWeight.Bold,
                            fontSize = 9.sp,
                            letterSpacing = 0.8.sp
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"), tint = CallText)
                    }
                },
                actions = {
                    Icon(
                        Icons.Default.Shield,
                        contentDescription = CustomerTextCatalog.translate("Panggilan aman"),
                        tint = CallGreen,
                        modifier = Modifier.padding(end = 16.dp).size(22.dp)
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = CallCanvas,
                    titleContentColor = CallText,
                    navigationIconContentColor = CallText
                )
            )
        },
        containerColor = CallCanvas
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(CallCanvas)
                .verticalScroll(rememberScrollState())
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            SecureCallBadge()
            Spacer(modifier = Modifier.height(14.dp))
            Text(
                text = callConnectionTitle(callState),
                color = CallGreen,
                fontWeight = FontWeight.Bold,
                fontSize = 24.sp
            )
            Text(
                text = callStatusText(callState, micPermissionGranted),
                color = CallMuted,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                lineHeight = 19.sp,
                modifier = Modifier.padding(top = 4.dp)
            )
            Spacer(modifier = Modifier.height(12.dp))
            Surface(
                color = CallGreenSoft,
                shape = RoundedCornerShape(100.dp),
                border = BorderStroke(1.dp, CallBorder)
            ) {
                Text(
                    text = "Order #${shortOrderId(orderId)} • Kirim Paket Instan",
                    color = CallGreen,
                    fontWeight = FontWeight.Bold,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp)
                )
            }
            Spacer(modifier = Modifier.height(14.dp))

            CallIdentityCard(
                targetName = resolvedTargetName,
                callState = callState
            )
            Spacer(modifier = Modifier.height(12.dp))
            CallSafetyCard()
            Spacer(modifier = Modifier.height(12.dp))
            CallRouteCard()
            Spacer(modifier = Modifier.height(12.dp))

            if (!micPermissionGranted) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = CallSurface),
                    border = BorderStroke(1.dp, CallBorder)
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        PermissionRequiredContent(
                            onRequestPermission = {
                                permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                            }
                        )
                    }
                }
            } else {
                if (callState == InAppCallState.ACCEPTED) {
                    CallControlGrid(
                        micMuted = uiState.micMuted,
                        onToggleMute = viewModel::toggleMute,
                        onOpenChat = onOpenChat
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                }
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = CallSurface),
                    border = BorderStroke(1.dp, CallBorder),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CallActionPanel(
                            state = callState,
                            errorMessage = uiState.errorMessage,
                            onAccept = viewModel::acceptIncomingCall,
                            onRetry = viewModel::retry,
                            onEnd = {
                                val status = when (callState) {
                                    InAppCallState.ACCEPTED -> "ended"
                                    InAppCallState.INCOMING -> "rejected"
                                    else -> "missed"
                                }
                                viewModel.endCall(status)
                            },
                            onOpenChat = onOpenChat,
                            onClose = onBackClick
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CallIdentityCard(targetName: String, callState: InAppCallState) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = CallSurface),
        border = BorderStroke(1.dp, CallBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(62.dp).clip(CircleShape).background(CallGreenSoft),
                contentAlignment = Alignment.Center
            ) {
                Text(initialsFor(targetName), color = CallGreen, fontWeight = FontWeight.Black, fontSize = 20.sp)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(targetName, color = CallText, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                Text("Mitra TEMBUS", color = CallMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                    Icon(Icons.Default.Star, contentDescription = null, tint = CallOrange, modifier = Modifier.size(14.dp))
                    Text("Status mengikuti order aktif", color = CallMuted, fontSize = 11.sp, modifier = Modifier.padding(start = 4.dp))
                }
            }
            Surface(
                color = if (callState == InAppCallState.ACCEPTED) CallGreenSoft else Color(0xFFFFF3E8),
                shape = RoundedCornerShape(10.dp)
            ) {
                Text(
                    text = callStateLabel(callState),
                    color = if (callState == InAppCallState.ACCEPTED) CallGreen else CallOrange,
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.sp,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 6.dp)
                )
            }
        }
    }
}

@Composable
private fun CallSafetyCard() {
    Surface(
        color = Color(0xFFEAF7EF),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, CallBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            Icon(Icons.Default.Shield, contentDescription = null, tint = CallGreen, modifier = Modifier.size(22.dp))
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text("Protokol Keselamatan Berkendara", color = CallText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text(
                    "Kurir menerima panggilan melalui mode hands-free. Jangan meminta atau membagikan nomor pribadi.",
                    color = CallMuted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

@Composable
private fun CallRouteCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = CallSurface),
        border = BorderStroke(1.dp, CallBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(modifier = Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(42.dp).clip(RoundedCornerShape(12.dp)).background(CallGreenSoft),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.LocationOn, contentDescription = null, tint = CallGreen, modifier = Modifier.size(21.dp))
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Lokasi order tersimpan", color = CallText, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                Text("Detail rute tersedia di halaman order aktif", color = CallMuted, fontSize = 12.sp, modifier = Modifier.padding(top = 3.dp))
            }
            Icon(Icons.Default.Navigation, contentDescription = null, tint = CallMuted, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun CallControlGrid(
    micMuted: Boolean,
    onToggleMute: () -> Unit,
    onOpenChat: () -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            CallControlTile(
                modifier = Modifier.weight(1f),
                icon = if (micMuted) Icons.Default.MicOff else Icons.Default.Mic,
                label = "Mikrofon",
                value = if (micMuted) "NONAKTIF" else "AKTIF",
                enabled = true,
                highlighted = micMuted,
                onClick = onToggleMute
            )
            CallControlTile(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.Call,
                label = "Speaker",
                value = "INTERNAL",
                enabled = false,
                onClick = {}
            )
            CallControlTile(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.Person,
                label = "Audio Output",
                value = "PERANGKAT",
                enabled = false,
                onClick = {}
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
            CallControlTile(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.Call,
                label = "Papan Angka",
                value = "BELUM TERSEDIA",
                enabled = false,
                onClick = {}
            )
            CallControlTile(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.ChatBubbleOutline,
                label = "Pesan Teks",
                value = "BALAS CEPAT",
                enabled = true,
                onClick = onOpenChat
            )
            CallControlTile(
                modifier = Modifier.weight(1f),
                icon = Icons.Default.SupportAgent,
                label = "Pusat Bantuan",
                value = "VIA CHAT ORDER",
                enabled = true,
                onClick = onOpenChat
            )
        }
    }
}

@Composable
private fun CallControlTile(
    modifier: Modifier,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    enabled: Boolean,
    highlighted: Boolean = false,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier
            .height(86.dp)
            .clickable(enabled = enabled, onClick = onClick),
        color = when {
            highlighted -> Color(0xFFFFF3E8)
            enabled -> CallSurface
            else -> Color(0xFFF6F9F7)
        },
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, if (enabled) CallBorder else Color(0xFFE5ECE7))
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 5.dp, vertical = 8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(icon, contentDescription = label, tint = if (enabled) CallGreen else CallMuted, modifier = Modifier.size(20.dp))
            Text(label, color = CallText, fontWeight = FontWeight.Bold, fontSize = 9.sp, textAlign = TextAlign.Center, maxLines = 1)
            Text(value, color = if (highlighted) CallOrange else CallMuted, fontSize = 8.sp, textAlign = TextAlign.Center, maxLines = 1)
        }
    }
}

@Composable
private fun SecureCallBadge() {
    Surface(
        color = CallSurface,
        contentColor = CallGreen,
        shape = RoundedCornerShape(100.dp),
        border = BorderStroke(1.dp, CallBorder)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Lock, contentDescription = "", modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Panggilan Aman TEMBUS • Nomor Disamarkan", fontWeight = FontWeight.Bold, fontSize = 11.sp)
        }
    }
}

@Composable
private fun CallAvatar(
    callState: InAppCallState,
    targetName: String
) {
    val pulseAlpha by animateFloatAsState(
        targetValue = if (callState == InAppCallState.OUTGOING) 0.24f else 0.12f,
        animationSpec = tween(durationMillis = 450),
        label = "call-pulse-alpha"
    )
    Box(contentAlignment = Alignment.Center) {
        Box(
            modifier = Modifier
                .size(152.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = pulseAlpha))
        )
        Box(
            modifier = Modifier
                .size(116.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.22f)),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = initialsFor(targetName),
                color = Color.White,
                fontWeight = FontWeight.Black,
                fontSize = 34.sp
            )
        }
    }
}

@Composable
private fun PermissionRequiredContent(onRequestPermission: () -> Unit) {
    Icon(
        imageVector = Icons.Default.Mic,
        contentDescription = "",
        tint = Primary,
        modifier = Modifier.size(34.dp)
    )
    Spacer(modifier = Modifier.height(12.dp))
    Text(
        text = "Aktifkan mikrofon",
        color = MaterialTheme.colorScheme.onSurface,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp
    )
    Spacer(modifier = Modifier.height(8.dp))
    Text(
        text = "Panggilan aman membutuhkan izin mikrofon. Nomor pribadi tetap tidak ditampilkan.",
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        fontSize = 14.sp,
        textAlign = TextAlign.Center,
        lineHeight = 20.sp
    )
    Spacer(modifier = Modifier.height(18.dp))
    Button(
        onClick = onRequestPermission,
        colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = Color.White),
        modifier = Modifier.fillMaxWidth()
    ) {
        Text("Izinkan Mikrofon", fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun CallActionPanel(
    state: InAppCallState,
    errorMessage: String?,
    onAccept: () -> Unit,
    onRetry: () -> Unit,
    onEnd: () -> Unit,
    onOpenChat: () -> Unit,
    onClose: () -> Unit
) {
    when (state) {
        InAppCallState.OUTGOING -> {
            CircularProgressIndicator(color = Primary, strokeWidth = 3.dp, modifier = Modifier.size(38.dp))
            Spacer(modifier = Modifier.height(14.dp))
            Text("Menghubungkan panggilan", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, fontSize = 18.sp)
            Text(
                text = "Sistem sedang menyiapkan jalur aman di aplikasi.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 6.dp)
            )
            Spacer(modifier = Modifier.height(20.dp))
            FilledIconButton(
                onClick = onEnd,
                modifier = Modifier.size(60.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFFE5484D), contentColor = Color.White)
            ) {
                Icon(Icons.Default.CallEnd, contentDescription = CustomerTextCatalog.translate("Akhiri"), modifier = Modifier.size(28.dp))
            }
        }
        InAppCallState.INCOMING -> {
            Text("Panggilan masuk", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, fontSize = 20.sp)
            Spacer(modifier = Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                FilledIconButton(
                    onClick = onEnd,
                    modifier = Modifier.size(62.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFFE5484D), contentColor = Color.White)
                ) {
                    Icon(Icons.Default.CallEnd, contentDescription = CustomerTextCatalog.translate("Tolak"), modifier = Modifier.size(28.dp))
                }
                FilledIconButton(
                    onClick = onAccept,
                    modifier = Modifier.size(62.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Primary, contentColor = Color.White)
                ) {
                    Icon(Icons.Default.Call, contentDescription = CustomerTextCatalog.translate("Terima"), modifier = Modifier.size(28.dp))
                }
            }
        }
        InAppCallState.ACCEPTED -> {
            Text("Panggilan tersambung", fontWeight = FontWeight.Bold, color = CallText, fontSize = 14.sp)
            Text("Gunakan kontrol di atas untuk mengatur audio.", color = CallMuted, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.padding(top = 4.dp))
            Spacer(modifier = Modifier.height(16.dp))
            FilledIconButton(
                onClick = onEnd,
                modifier = Modifier.size(66.dp),
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFFE5484D), contentColor = Color.White)
            ) {
                Icon(Icons.Default.CallEnd, contentDescription = CustomerTextCatalog.translate("Akhiri"), modifier = Modifier.size(30.dp))
            }
            Text("Tutup Panggilan", color = Color(0xFFE5484D), fontWeight = FontWeight.Bold, fontSize = 12.sp, modifier = Modifier.padding(top = 8.dp))
        }
        InAppCallState.ENDED, InAppCallState.MISSED, InAppCallState.FAILED -> {
            val failed = state == InAppCallState.FAILED
            Icon(
                imageVector = if (failed) Icons.Default.Shield else Icons.Default.CallEnd,
                contentDescription = "",
                tint = if (failed) Color(0xFFFF6B00) else Primary,
                modifier = Modifier.size(34.dp)
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = when (state) {
                    InAppCallState.FAILED -> "Panggilan belum tersedia"
                    InAppCallState.MISSED -> "Panggilan tidak tersambung"
                    else -> "Panggilan selesai"
                },
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold,
                fontSize = 20.sp
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = errorMessage ?: "Gunakan chat order agar koordinasi tetap tercatat.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                lineHeight = 20.sp
            )
            Spacer(modifier = Modifier.height(18.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onRetry, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Default.Refresh, contentDescription = "", modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Coba Lagi")
                }
                Button(
                    onClick = onOpenChat,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = Color.White)
                ) {
                    Icon(Icons.Default.SupportAgent, contentDescription = "", modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Buka Chat")
                }
            }
        }
    }

    if (state in setOf(InAppCallState.FAILED, InAppCallState.MISSED, InAppCallState.ENDED)) {
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedButton(onClick = onClose, modifier = Modifier.fillMaxWidth()) {
            Text("Kembali")
        }
    }
}

private fun callStatusText(state: InAppCallState, micPermissionGranted: Boolean): String {
    if (!micPermissionGranted) return "Izin mikrofon diperlukan untuk panggilan dalam aplikasi."
    return when (state) {
        InAppCallState.OUTGOING -> "Memanggil lewat jalur aman TEMBUS."
        InAppCallState.INCOMING -> "Panggilan masuk dari percakapan order aktif."
        InAppCallState.ACCEPTED -> "Panggilan sedang berlangsung."
        InAppCallState.ENDED -> "Panggilan sudah berakhir."
        InAppCallState.MISSED -> "Panggilan tidak dijawab."
        InAppCallState.FAILED -> "Layanan panggilan sedang disiapkan untuk order ini."
    }
}

private fun callConnectionTitle(state: InAppCallState): String {
    return when (state) {
        InAppCallState.ACCEPTED -> "Terhubung"
        InAppCallState.OUTGOING -> "Menghubungkan"
        InAppCallState.INCOMING -> "Panggilan Masuk"
        InAppCallState.ENDED -> "Panggilan Selesai"
        InAppCallState.MISSED -> "Panggilan Terlewat"
        InAppCallState.FAILED -> "Panggilan Belum Tersedia"
    }
}

private fun callStateLabel(state: InAppCallState): String {
    return when (state) {
        InAppCallState.ACCEPTED -> "AKTIF"
        InAppCallState.OUTGOING -> "MEMANGGIL"
        InAppCallState.INCOMING -> "MASUK"
        InAppCallState.ENDED -> "SELESAI"
        InAppCallState.MISSED -> "TERLEWAT"
        InAppCallState.FAILED -> "GAGAL"
    }
}

private fun shortOrderId(orderId: String): String {
    val normalized = orderId.trim().ifBlank { "ORDER" }
    return if (normalized.length > 12) normalized.takeLast(12) else normalized
}

private fun initialsFor(value: String): String {
    val parts = value.trim().split("\\s+".toRegex()).filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> "${parts[0].take(1)}${parts[1].take(1)}".uppercase()
        parts.isNotEmpty() -> parts[0].take(2).uppercase()
        else -> "TK"
    }
}
