package com.tembus.merchant.ui.components

import androidx.annotation.DrawableRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
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
    imageSize: Int = 220,
    contentPadding: PaddingValues = PaddingValues(32.dp),
    action: (@Composable () -> Unit)? = null
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(contentPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Image(
            painter = painterResource(illustration),
            contentDescription = null,
            modifier = Modifier
                .fillMaxWidth()
                .size(imageSize.dp)
                .padding(horizontal = 16.dp),
            contentScale = ContentScale.Fit
        )
        Spacer(modifier = Modifier.height(20.dp))
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        if (action != null) {
            Spacer(modifier = Modifier.height(20.dp))
            action()
        }
    }
}
