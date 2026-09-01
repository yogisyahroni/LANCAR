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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Shield
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.customer.ui.theme.Primary

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
                    Text(
                        text = "Panggilan TEMBUS",
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = CustomerTextCatalog.translate("Kembali"))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF075C2F),
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        },
        containerColor = Color(0xFFF6F8F7)
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(
                    Brush.verticalGradient(
                        colors = listOf(Color(0xFF075C2F), Color(0xFF0E7A3D), Color(0xFFF6F8F7)),
                        endY = 760f
                    )
                )
                .navigationBarsPadding()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(24.dp))
                SecureCallBadge()
                Spacer(modifier = Modifier.height(28.dp))
                CallAvatar(
                    callState = callState,
                    targetName = resolvedTargetName
                )
                Spacer(modifier = Modifier.height(22.dp))
                Text(
                    text = resolvedTargetName,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontSize = 28.sp,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                AnimatedContent(targetState = callState, label = "call-state-copy") { state ->
                    Text(
                        text = callStatusText(state, micPermissionGranted),
                        color = Color.White.copy(alpha = 0.86f),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 15.sp,
                        textAlign = TextAlign.Center,
                        lineHeight = 22.sp
                    )
                }

                Spacer(modifier = Modifier.weight(1f))

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(28.dp),
                    colors = CardDefaults.cardColors(containerColor = Color.White),
                    elevation = CardDefaults.cardElevation(defaultElevation = 12.dp)
                ) {
                    Column(
                        modifier = Modifier.padding(22.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        if (!micPermissionGranted) {
                            PermissionRequiredContent(
                                onRequestPermission = {
                                    permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                                }
                            )
                        } else {
                            CallActionPanel(
                                state = callState,
                                micMuted = uiState.micMuted,
                                errorMessage = uiState.errorMessage,
                                onToggleMute = viewModel::toggleMute,
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
}

@Composable
private fun SecureCallBadge() {
    Surface(
        color = Color.White.copy(alpha = 0.16f),
        contentColor = Color.White,
        shape = RoundedCornerShape(100.dp),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.28f))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Panggilan dalam aplikasi", fontWeight = FontWeight.Bold, fontSize = 13.sp)
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
        contentDescription = null,
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
    micMuted: Boolean,
    errorMessage: String?,
    onToggleMute: () -> Unit,
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
            Text("Panggilan tersambung", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, fontSize = 20.sp)
            Spacer(modifier = Modifier.height(18.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(18.dp), verticalAlignment = Alignment.CenterVertically) {
                FilledIconButton(
                    onClick = onToggleMute,
                    modifier = Modifier.size(58.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(
                        containerColor = if (micMuted) Color(0xFFFFF4E5) else Color(0xFFEAF7EF),
                        contentColor = if (micMuted) Color(0xFFFF6B00) else Primary
                    )
                ) {
                    Icon(if (micMuted) Icons.Default.MicOff else Icons.Default.Mic, contentDescription = CustomerTextCatalog.translate("Mikrofon"))
                }
                FilledIconButton(
                    onClick = onEnd,
                    modifier = Modifier.size(66.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = Color(0xFFE5484D), contentColor = Color.White)
                ) {
                    Icon(Icons.Default.CallEnd, contentDescription = CustomerTextCatalog.translate("Akhiri"), modifier = Modifier.size(30.dp))
                }
            }
        }
        InAppCallState.ENDED, InAppCallState.MISSED, InAppCallState.FAILED -> {
            val failed = state == InAppCallState.FAILED
            Icon(
                imageVector = if (failed) Icons.Default.Shield else Icons.Default.CallEnd,
                contentDescription = null,
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
                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Coba Lagi")
                }
                Button(
                    onClick = onOpenChat,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Primary, contentColor = Color.White)
                ) {
                    Icon(Icons.Default.SupportAgent, contentDescription = null, modifier = Modifier.size(18.dp))
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

private fun initialsFor(value: String): String {
    val parts = value.trim().split("\\s+".toRegex()).filter { it.isNotBlank() }
    return when {
        parts.size >= 2 -> "${parts[0].take(1)}${parts[1].take(1)}".uppercase()
        parts.isNotEmpty() -> parts[0].take(2).uppercase()
        else -> "TK"
    }
}
