package com.tembus.customer.ui.screens.rating

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil.compose.AsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import com.tembus.customer.ui.theme.Primary

/**
 * Dialog rating kurir yang muncul saat order berstatus DELIVERED.
 *
 * Menampilkan:
 * - Foto profil kurir
 * - Nama kurir
 * - Nomor plat kendaraan
 * - 5 ikon bintang interaktif (tap untuk memilih)
 * - TextField opsional untuk komentar
 * - Tombol Kirim Rating / Skip (Ingatkan Nanti)
 *
 * @param courierName      Nama kurir
 * @param courierPhotoUrl  URL foto profil kurir
 * @param courierPlate     Nomor plat kendaraan kurir
 * @param orderNumber      Nomor order untuk referensi customer
 * @param isSubmitting     True saat request sedang berjalan (tampilkan loading)
 * @param isSubmitted      True saat rating berhasil dikirim (tampilkan sukses)
 * @param errorMessage     Pesan error jika submit gagal
 * @param onSubmit         Callback (rating: Float, comment: String) -> Unit
 * @param onDismiss        Callback saat customer memilih "Ingatkan Nanti"
 * @param onDismissError   Callback untuk membersihkan pesan error
 */
@Composable
fun CourierRatingDialog(
    courierName: String,
    courierPhotoUrl: String,
    courierPlate: String,
    orderNumber: String,
    isSubmitting: Boolean,
    isSubmitted: Boolean,
    errorMessage: String?,
    onSubmit: (rating: Float, comment: String) -> Unit,
    onDismiss: () -> Unit,
    onDismissError: () -> Unit
) {
    var selectedRating by remember { mutableFloatStateOf(0f) }
    var comment by remember { mutableStateOf("") }
    val focusManager = LocalFocusManager.current

    Dialog(
        onDismissRequest = { if (!isSubmitting) onDismiss() },
        properties = DialogProperties(
            dismissOnBackPress = !isSubmitting,
            dismissOnClickOutside = !isSubmitting
        )
    ) {
        Surface(
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 8.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp)
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(24.dp)
            ) {
                // Tombol tutup (hanya saat tidak submitting)
                if (!isSubmitting && !isSubmitted) {
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(32.dp)
                    ) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Ingatkan nanti",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // ─── KONDISI SUKSES ───────────────────────────────────
                    if (isSubmitted) {
                        RatingSuccessContent(onDismiss = onDismiss)
                    } else {
                        // ─── KONDISI FORM ─────────────────────────────────
                        RatingFormContent(
                            courierName = courierName,
                            courierPhotoUrl = courierPhotoUrl,
                            courierPlate = courierPlate,
                            orderNumber = orderNumber,
                            selectedRating = selectedRating,
                            comment = comment,
                            isSubmitting = isSubmitting,
                            errorMessage = errorMessage,
                            onStarSelect = { rating -> selectedRating = rating },
                            onCommentChange = { comment = it },
                            onSubmit = {
                                focusManager.clearFocus()
                                onSubmit(selectedRating, comment)
                            },
                            onDismiss = onDismiss,
                            onDismissError = onDismissError
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RatingSuccessContent(onDismiss: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(vertical = 16.dp)
    ) {
        Icon(
            imageVector = Icons.Default.CheckCircle,
            contentDescription = "Sukses",
            tint = Primary,
            modifier = Modifier.size(72.dp)
        )
        Spacer(modifier = Modifier.height(20.dp))
        Text(
            "Terima Kasih!",
            fontSize = 22.sp,
            fontWeight = FontWeight.ExtraBold,
            color = MaterialTheme.colorScheme.onSurface,
            letterSpacing = (-0.5).sp
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Penilaian Anda sangat membantu kurir kami untuk terus meningkatkan layanan.",
            fontSize = 14.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp
        )
        Spacer(modifier = Modifier.height(28.dp))
        Button(
            onClick = onDismiss,
            colors = ButtonDefaults.buttonColors(containerColor = Primary),
            shape = RoundedCornerShape(100.dp),
            modifier = Modifier
                .fillMaxWidth()
                .height(52.dp)
        ) {
            Text("Tutup", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
        }
    }
}

@Composable
private fun ColumnScope.RatingFormContent(
    courierName: String,
    courierPhotoUrl: String,
    courierPlate: String,
    orderNumber: String,
    selectedRating: Float,
    comment: String,
    isSubmitting: Boolean,
    errorMessage: String?,
    onStarSelect: (Float) -> Unit,
    onCommentChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
    onDismissError: () -> Unit
) {
    // Label rating berdasarkan jumlah bintang
    val ratingLabel = when {
        selectedRating >= 5f -> "Luar biasa!"
        selectedRating >= 4f -> "Bagus sekali"
        selectedRating >= 3f -> "Cukup baik"
        selectedRating >= 2f -> "Kurang memuaskan"
        selectedRating >= 1f -> "Sangat buruk"
        else -> "Ketuk bintang untuk memberi nilai"
    }

    // Header
    Text(
        text = "Nilai Kurirmu",
        fontSize = 18.sp,
        fontWeight = FontWeight.ExtraBold,
        color = MaterialTheme.colorScheme.onSurface,
        letterSpacing = (-0.5).sp,
        modifier = Modifier.padding(top = 4.dp, bottom = 20.dp)
    )

    // ─── Foto, Nama, Plat Kurir ─────────────────────────────────────────────
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            .padding(12.dp)
    ) {
        // Foto profil kurir
        if (courierPhotoUrl.isNotBlank()) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(courierPhotoUrl)
                    .crossfade(true)
                    .build(),
                contentDescription = "Foto $courierName",
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .border(2.dp, Primary.copy(alpha = 0.3f), CircleShape)
            )
        } else {
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(CircleShape)
                    .background(Primary.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = courierName.firstOrNull()?.uppercase() ?: "?",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = Primary
                )
            }
        }

        Spacer(modifier = Modifier.width(14.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = courierName.ifBlank { "Kurir Anda" },
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
            if (courierPlate.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Surface(
                    color = Color(0xFF1C1C1E),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Text(
                        text = courierPlate.uppercase(),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color.White,
                        letterSpacing = 2.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                    )
                }
            }
            if (orderNumber.isNotBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = "#$orderNumber",
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }

    Spacer(modifier = Modifier.height(24.dp))

    // ─── 5 Bintang Interaktif ──────────────────────────────────────────────
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(horizontal = 8.dp)
    ) {
        for (i in 1..5) {
            val isFilled = i <= selectedRating
            val starScale by animateFloatAsState(
                targetValue = if (isFilled) 1.15f else 1f,
                animationSpec = spring(dampingRatio = 0.5f),
                label = "starScale$i"
            )
            Icon(
                imageVector = if (isFilled) Icons.Default.Star else Icons.Outlined.StarOutline,
                contentDescription = "$i bintang",
                tint = if (isFilled) Color(0xFFFFBB00) else MaterialTheme.colorScheme.outline,
                modifier = Modifier
                    .size(44.dp)
                    .scale(starScale)
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null
                    ) { onStarSelect(i.toFloat()) }
            )
        }
    }

    Spacer(modifier = Modifier.height(8.dp))

    // Label deskripsi rating
    Text(
        text = ratingLabel,
        fontSize = 13.sp,
        fontWeight = if (selectedRating > 0) FontWeight.SemiBold else FontWeight.Normal,
        color = if (selectedRating >= 4f) Primary
                else if (selectedRating >= 3f) MaterialTheme.colorScheme.onSurface
                else if (selectedRating > 0f) Color(0xFFE53935)
                else MaterialTheme.colorScheme.onSurfaceVariant
    )

    Spacer(modifier = Modifier.height(20.dp))

    // ─── TextField Komentar (opsional) ─────────────────────────────────────
    OutlinedTextField(
        value = comment,
        onValueChange = { if (it.length <= 200) onCommentChange(it) },
        placeholder = {
            Text("Tulis komentar (opsional)", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        maxLines = 3,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Primary,
            unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
        ),
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
        keyboardActions = KeyboardActions(onDone = { onSubmit() }),
        enabled = !isSubmitting
    )

    // Karakter counter
    Text(
        text = "${comment.length}/200",
        fontSize = 10.sp,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier
            .align(Alignment.End)
            .padding(top = 4.dp, end = 4.dp)
    )

    // Error message
    if (errorMessage != null) {
        Spacer(modifier = Modifier.height(8.dp))
        Surface(
            color = MaterialTheme.colorScheme.errorContainer,
            shape = RoundedCornerShape(10.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.padding(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = errorMessage,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    fontSize = 12.sp,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = onDismissError, modifier = Modifier.size(20.dp)) {
                    Icon(Icons.Default.Close, contentDescription = null, tint = MaterialTheme.colorScheme.onErrorContainer, modifier = Modifier.size(14.dp))
                }
            }
        }
    }

    Spacer(modifier = Modifier.height(24.dp))

    // ─── Tombol Kirim ──────────────────────────────────────────────────────
    Button(
        onClick = onSubmit,
        enabled = selectedRating >= 1f && !isSubmitting,
        colors = ButtonDefaults.buttonColors(
            containerColor = Primary,
            disabledContainerColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f)
        ),
        shape = RoundedCornerShape(100.dp),
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp)
    ) {
        if (isSubmitting) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(22.dp)
            )
        } else {
            Text(
                "Kirim Penilaian",
                fontWeight = FontWeight.ExtraBold,
                fontSize = 15.sp
            )
        }
    }

    Spacer(modifier = Modifier.height(8.dp))

    // Tombol skip (Ingatkan Nanti)
    TextButton(
        onClick = onDismiss,
        enabled = !isSubmitting,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(
            "Ingatkan Nanti",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 13.sp
        )
    }
}
