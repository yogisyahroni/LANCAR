package com.tembus.courier.ui.screens.face

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Face
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import com.tembus.courier.ui.localization.CourierTextCatalog
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.tembus.courier.ui.theme.Primary
import com.tembus.courier.ui.theme.Success

private val DeepForest = Color(0xFF0A2F20)
private val FaceRingColor = Color(0xFF00E096)
private val DimOverlay = Color(0xCC000000)

/**
 * FaceVerificationScreen
 *
 * Layar verifikasi wajah saat pickup. Kurir wajib scan wajah sebelum bisa scan kode paket.
 * Flow:
 *   1. Kamera aktif (pakai TakePicturePreview)
 *   2. Overlay panduan posisi wajah
 *   3. Tombol "Ambil Foto Wajah"
 *   4. Preview foto + tombol "Verifikasi"
 *   5. Loading → sukses (callback onVerified) atau gagal (tampil error + retry)
 */
@Composable
fun FaceVerificationScreen(
    orderId: String?,
    verificationType: String,
    workContext: String = "",
    onVerified: () -> Unit,
    onBack: () -> Unit,
    viewModel: FaceVerificationViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsState()
    var showLiveness by remember { mutableStateOf(false) }
    val contextCopy = remember(workContext) { faceVerificationCopy(workContext) }

    // Kamera launcher — TakePicturePreview untuk selfie live
    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) {
            viewModel.onPhotoCaptured(bitmap)
        }
    }

    // Camera permission launcher
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    if (showLiveness) {
        ActiveLivenessScreen(
            onSuccess = { bitmap ->
                viewModel.onPhotoCaptured(bitmap)
                showLiveness = false
            },
            onCancel = { showLiveness = false }
        )
        return
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(DeepForest)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // ── Top Bar ──────────────────────────────────────────
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = CourierTextCatalog.translate("Kembali"),
                        tint = Color.White
                    )
                }
                Spacer(Modifier.width(8.dp))
                Column {
                    Text(
                        "Verifikasi Wajah",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                    Text(
                        contextCopy.subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color.White.copy(alpha = 0.68f)
                    )
                }
            }

            Spacer(Modifier.height(8.dp))

            // ── Info Card ────────────────────────────────────────
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = Color.White.copy(alpha = 0.10f),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color.White.copy(alpha = 0.18f))
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    Icon(
                        Icons.Default.Face,
                        contentDescription = null,
                        tint = FaceRingColor,
                        modifier = Modifier.size(22.dp)
                    )
                    Column {
                        Text(
                            "Mengapa perlu scan wajah?",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Text(
                            contextCopy.reason,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.76f)
                        )
                    }
                }
            }

            // ── Face Capture Area ────────────────────────────────

    Box(
                modifier = Modifier
                    .size(260.dp)
                    .align(Alignment.CenterHorizontally),
                contentAlignment = Alignment.Center
            ) {
                val bitmap = state.capturedBitmap
                if (bitmap != null) {
                    // Preview foto yang diambil
                    androidx.compose.foundation.Image(
                        bitmap = bitmap.asImageBitmap(),
                        contentDescription = CourierTextCatalog.translate("Foto wajah"),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(240.dp)
                            .clip(CircleShape)
                            .border(3.dp, if (state.isVerified) Success else Primary, CircleShape)
                    )
                    // Overlay sukses
                    if (state.isVerified) {

    Box(
                            modifier = Modifier
                                .size(240.dp)
                                .clip(CircleShape)
                                .background(Success.copy(alpha = 0.55f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.CheckCircle,
                                contentDescription = CourierTextCatalog.translate("Terverifikasi"),
                                tint = Color.White,
                                modifier = Modifier.size(72.dp)
                            )
                        }
                    }
                } else {
                    // Placeholder dengan animasi ring pulse
                    FaceCapturePlaceholder()
                }
            }

            // ── Hint Text ────────────────────────────────────────
            Text(
                text = when {
                    state.isVerified -> "✅ Verifikasi berhasil!"
                    state.capturedBitmap != null -> "Foto siap. Tekan Verifikasi untuk melanjutkan."
                    else -> "Posisikan wajah di dalam lingkaran, lalu ambil foto"
                },
                color = if (state.isVerified) FaceRingColor else Color.White.copy(alpha = 0.84f),
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center,
                fontWeight = if (state.isVerified) FontWeight.Bold else FontWeight.Normal
            )

            // ── Attempt Counter ───────────────────────────────────
            if (!state.isVerified && state.attemptsLeft < 3) {
                Surface(
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.20f),
                    shape = RoundedCornerShape(8.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.45f))
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            "${state.attemptsLeft} percobaan tersisa",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.error,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }

            // ── Error Message ─────────────────────────────────────
            AnimatedVisibility(
                visible = state.error != null,
                enter = fadeIn() + scaleIn(initialScale = 0.96f),
                exit = fadeOut()
            ) {
                state.error?.let { errorMsg ->
                    Surface(
                        modifier = Modifier.fillMaxWidth(),
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.16f),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.48f))
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.Top
                        ) {
                            Icon(
                                Icons.Default.Warning,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(20.dp)
                            )
                            Text(
                                errorMsg,
                                style = MaterialTheme.typography.bodySmall,
                                color = Color.White,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
            }

            Spacer(Modifier.weight(1f))

            // ── Action Buttons ────────────────────────────────────
            if (!state.isVerified) {
                if (state.capturedBitmap == null) {
                    // Tombol ambil foto
                    Button(
                        onClick = {
                            if (!hasCameraPermission) {
                                permissionLauncher.launch(Manifest.permission.CAMERA)
                            } else {
                                showLiveness = true
                            }
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(56.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = FaceRingColor,
                            contentColor = DeepForest
                        )
                    ) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(10.dp))
                        Text(
                            if (!hasCameraPermission) "Izinkan Kamera" else "Ambil Foto Wajah",
                            fontWeight = FontWeight.Black,
                            fontSize = 16.sp
                        )
                    }
                } else {
                    // Tombol verifikasi + ulangi foto
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        OutlinedButton(
                            onClick = { viewModel.clearCapture() },
                            modifier = Modifier
                                .weight(1f)
                                .height(56.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.5f)),
                            enabled = !state.isLoading
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Ulangi Foto", fontWeight = FontWeight.Bold)
                        }

                        Button(
                            onClick = { viewModel.verifyFace(orderId, verificationType, onVerified) },
                            modifier = Modifier
                                .weight(1.5f)
                                .height(56.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = FaceRingColor,
                                contentColor = DeepForest
                            ),
                            enabled = !state.isLoading && state.attemptsLeft > 0
                        ) {
                            if (state.isLoading) {
                                CircularProgressIndicator(
                                    color = DeepForest,
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.5.dp
                                )
                            } else {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(6.dp))
                                Text("Verifikasi", fontWeight = FontWeight.Black, fontSize = 16.sp)
                            }
                        }
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
        }
    }
}

private data class FaceVerificationCopy(
    val subtitle: String,
    val reason: String
)

private fun faceVerificationCopy(workContext: String): FaceVerificationCopy {
    return when (workContext.trim().lowercase()) {
        "tambal_ban" -> FaceVerificationCopy(
            subtitle = "Wajib sebelum inspeksi ban",
            reason = "Untuk memastikan teknisi yang terdaftar benar-benar menangani layanan ini. Ini melindungi pelanggan dan akun kurir kamu."
        )
        "towing" -> FaceVerificationCopy(
            subtitle = "Wajib sebelum inspeksi kendaraan",
            reason = "Untuk memastikan armada yang terdaftar benar-benar menangani layanan ini. Ini melindungi pelanggan dan akun kurir kamu."
        )
        else -> FaceVerificationCopy(
            subtitle = "Wajib sebelum pickup barang",
            reason = "Untuk memastikan kamu — bukan orang lain — yang mengambil barang ini. Ini melindungi pelanggan dan akun kurir kamu."
        )
    }
}

@Composable
private fun FaceCapturePlaceholder() {
    val infiniteTransition = rememberInfiniteTransition(label = "face_pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.75f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse_alpha"
    )

    Box(
        modifier = Modifier.size(240.dp),
        contentAlignment = Alignment.Center
    ) {
        // Outer pulse ring

    Box(
            modifier = Modifier
                .size(240.dp)
                .border(
                    width = 2.dp,
                    color = FaceRingColor.copy(alpha = pulseAlpha),
                    shape = CircleShape
                )
        )
        // Inner placeholder circle

    Box(
            modifier = Modifier
                .size(220.dp)
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.06f)),
            contentAlignment = Alignment.Center
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    Icons.Default.Face,
                    contentDescription = null,
                    tint = FaceRingColor.copy(alpha = 0.6f),
                    modifier = Modifier.size(72.dp)
                )
                Text(
                    "Posisikan wajah\ndi sini",
                    color = Color.White.copy(alpha = 0.55f),
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center
                )
            }
        }
        // Corner guide lines (4 sudut)
        FaceGuideCorners()
    }
}

@Composable
private fun FaceGuideCorners() {
    val cornerSize = 30.dp
    val strokeWidth = 3.dp
    val color = FaceRingColor

    Box(modifier = Modifier.size(240.dp)) {
        // Top-Left

    Box(
            modifier = Modifier
                .size(cornerSize)
                .align(Alignment.TopStart)
                .border(
                    BorderStroke(strokeWidth, color),
                    RoundedCornerShape(topStart = 12.dp)
                )
        )
        // Top-Right

    Box(
            modifier = Modifier
                .size(cornerSize)
                .align(Alignment.TopEnd)
                .border(
                    BorderStroke(strokeWidth, color),
                    RoundedCornerShape(topEnd = 12.dp)
                )
        )
        // Bottom-Left

    Box(
            modifier = Modifier
                .size(cornerSize)
                .align(Alignment.BottomStart)
                .border(
                    BorderStroke(strokeWidth, color),
                    RoundedCornerShape(bottomStart = 12.dp)
                )
        )
        // Bottom-Right

    Box(
            modifier = Modifier
                .size(cornerSize)
                .align(Alignment.BottomEnd)
                .border(
                    BorderStroke(strokeWidth, color),
                    RoundedCornerShape(bottomEnd = 12.dp)
                )
        )
    }
}
