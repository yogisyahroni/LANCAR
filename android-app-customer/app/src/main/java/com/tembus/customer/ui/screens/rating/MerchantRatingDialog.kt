package com.tembus.customer.ui.screens.rating

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Restaurant
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.tembus.customer.ui.theme.Accent
import com.tembus.customer.ui.theme.Primary
import com.tembus.customer.ui.theme.PrimaryLight

/**
 * Dialog rating merchant (makanan) — FOOD-BIKE-060.
 * Terpisah dari CourierRatingDialog: customer menilai rasa/kesesuaian makanan,
 * sementara rating driver tetap di dialog kurir.
 *
 * @param merchantName   Nama merchant
 * @param orderNumber    Nomor order untuk referensi
 * @param isSubmitting   True saat request berjalan (tampilkan loading)
 * @param isSubmitted    True saat rating berhasil dikirim (tampilkan sukses)
 * @param errorMessage   Pesan error jika submit gagal
 * @param onSubmit       Callback (rating: Float, comment: String) -> Unit
 * @param onDismiss      Callback saat customer skip / tutup
 * @param onDismissError Callback untuk membersihkan pesan error
 */
@Composable
fun MerchantRatingDialog(
    merchantName: String,
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

    Dialog(
        onDismissRequest = { if (!isSubmitting && !isSubmitted) onDismiss() },
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
                if (!isSubmitting && !isSubmitted) {
                    IconButton(
                        onClick = onDismiss,
                        modifier = Modifier
                            .align(Alignment.TopEnd)
                            .size(32.dp)
                    ) {
                        Icon(Icons.Default.Close, contentDescription = "Tutup", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                    }
                }

                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    if (isSubmitted) {
                        // ── State sukses ──
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = Primary,
                            modifier = Modifier.size(56.dp)
                        )
                        Spacer(Modifier.height(14.dp))
                        Text("Terima kasih!", fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onSurface)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            "Penilaian untuk $merchantName berhasil dikirim.",
                            fontSize = 13.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center
                        )
                        Spacer(Modifier.height(20.dp))
                        Button(
                            onClick = onDismiss,
                            shape = RoundedCornerShape(14.dp)
                        ) {
                            Text("Selesai", fontWeight = FontWeight.Bold)
                        }
                        return@Column
                    }

                    // ── Ikon merchant ──
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(PrimaryLight),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Restaurant, contentDescription = null, tint = Primary, modifier = Modifier.size(30.dp))
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Beri penilaian untuk $merchantName",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        textAlign = TextAlign.Center
                    )
                    Text(
                        "Order $orderNumber • Makanan kamu sudah sampai?",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(16.dp))

                    // ── 5 bintang interaktif ──
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        repeat(5) { index ->
                            val starIndex = index + 1
                            Icon(
                                imageVector = if (starIndex <= selectedRating.toInt()) Icons.Filled.Star else Icons.Outlined.StarOutline,
                                contentDescription = "$starIndex bintang",
                                tint = if (starIndex <= selectedRating.toInt()) Color(0xFFF59E0B) else Color(0xFFCBD5E1),
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(CircleShape)
                                    .clickable { selectedRating = starIndex.toFloat() }
                                    .padding(4.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        when (selectedRating.toInt()) {
                            0 -> "Ketuk bintang untuk menilai"
                            1 -> "Sangat buruk"
                            2 -> "Buruk"
                            3 -> "Cukup"
                            4 -> "Bagus"
                            else -> "Sangat bagus!"
                        },
                        fontSize = 12.sp,
                        color = if (selectedRating > 0) Accent else Color(0xFF94A3B8),
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(Modifier.height(14.dp))

                    // ── Komentar opsional ──
                    OutlinedTextField(
                        value = comment,
                        onValueChange = { comment = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Komentar (opsional) — rasa, porsi, kemasan...", fontSize = 13.sp) },
                        minLines = 2,
                        maxLines = 3,
                        shape = RoundedCornerShape(14.dp)
                    )

                    errorMessage?.let {
                        Spacer(Modifier.height(10.dp))
                        Text(
                            it,
                            color = Color(0xFFEF4444),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center
                        )
                        TextButton(onClick = onDismissError) {
                            Text("Tutup", color = Color(0xFFEF4444), fontSize = 12.sp)
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    // ── Tombol aksi ──
                    Button(
                        onClick = { if (selectedRating >= 1f) onSubmit(selectedRating, comment.trim()) },
                        enabled = selectedRating >= 1f && !isSubmitting,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(14.dp)
                    ) {
                        if (isSubmitting) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp))
                        } else {
                            Text("Kirim Penilaian", fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    TextButton(
                        onClick = onDismiss,
                        enabled = !isSubmitting
                    ) {
                        Text("Nanti Saja", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}
