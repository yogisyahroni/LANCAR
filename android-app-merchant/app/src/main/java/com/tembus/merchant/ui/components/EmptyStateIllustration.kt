package com.tembus.merchant.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * EmptyStateIllustration — empty state konsisten antar screen (design 2026):
 * ilustrasi brand (unDraw, recolored) + judul + deskripsi + CTA.
 *
 * Dipakai oleh:
 * - MenuScreen   → ill_streetfood (menu kosong)
 * - HomeScreen   → ill_receipt    (belum ada order)
 *
 * Aset: res/drawable-nodpi/ill_*.png — open source (unDraw), license free.
 */
@Composable
fun EmptyStateIllustration(
    @DrawableRes illustration: Int,
    title: String,
    description: String,
    modifier: Modifier = Modifier,
    imageWidthFraction: Float = 0.85f,
    imageMaxHeight: Dp = 220.dp,
    contentPadding: PaddingValues = PaddingValues(32.dp),
    action: (@Composable () -> Unit)? = null
) {
    // Box + contentAlignment = Center: PASTI center di sisa ruang parent
    // (pola Column fillMaxSize + Arrangement.Center terbukti TIDAK center
    //  saat dipanggil sebagai child terakhir Column parent — konten
    //  menggantung di bawah, debug 2026-08-11).
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(contentPadding),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Image(
                painter = painterResource(illustration),
                contentDescription = null,
                modifier = Modifier
                    .fillMaxWidth(imageWidthFraction)
                    .heightIn(max = imageMaxHeight)
                    // Kartu hijau muda + border: bikin ilustrasi "nempel" dan
                    // kontras di background putih (pola GoFood/GrabFood empty state).
                    // Sebelumnya ilustrasi transparan tampil pucat/hilang (debug 2026-08-11).
                    .clip(RoundedCornerShape(28.dp))
                    .background(Color(0xFFE7F7EE))
                    .border(
                        BorderStroke(1.dp, Color(0xFFD9E8E0)),
                        RoundedCornerShape(28.dp)
                    )
                    .padding(horizontal = 16.dp, vertical = 20.dp),
                contentScale = ContentScale.Fit
            )
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
            if (action != null) {
                Spacer(modifier = Modifier.height(24.dp))
                action()
            }
        }
    }
}
