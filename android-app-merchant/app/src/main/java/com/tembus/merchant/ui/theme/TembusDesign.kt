package com.tembus.merchant.ui.theme

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object TembusRadius {
    // Stitch merchant screens use compact operational surfaces, not pill-like cards.
    val Card = 8.dp
    val Sheet = 8.dp
    val Button = 8.dp
    val Input = 8.dp
    val Chip = 50.dp
}

object TembusSpacing {
    val Base = 4.dp
    val XSmall = 4.dp
    val Small = 8.dp
    val Medium = 16.dp
    val Large = 24.dp
    val XLarge = 32.dp
    val Edge = 16.dp
    val Screen = 16.dp
    val Section = 32.dp
}

object TembusCopy {
    const val BrandName = "TEMBUS"
    const val CustomerTagline = "Kiriman aman, sampai tujuan."
    const val CourierTitle = "Mitra Kurir"
    const val OperationalSync = "Data operasional sedang disinkronkan."
}

enum class TembusStatus {
    Success,
    Warning,
    Error,
    Info,
    Pending,
    Active,
    Completed,
    Cancelled,
    Disabled
}

object TembusComponentDefaults {
    val MinTouchTarget = 48.dp
    val Icon = 24.dp
    val CardBorderWidth = 1.dp

    fun cardShape() = RoundedCornerShape(TembusRadius.Card)
    fun sheetShape() = RoundedCornerShape(TembusRadius.Sheet)
    fun buttonShape() = RoundedCornerShape(TembusRadius.Button)
    fun inputShape() = RoundedCornerShape(TembusRadius.Input)
    fun chipShape() = RoundedCornerShape(TembusRadius.Chip)

    @Composable
    fun primaryButtonColors() = ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.primary,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant
    )

    @Composable
    fun accentButtonColors() = ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.tertiary,
        contentColor = MaterialTheme.colorScheme.onTertiary,
        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant
    )

    @Composable
    fun destructiveButtonColors() = ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.error,
        contentColor = MaterialTheme.colorScheme.onError,
        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant
    )

    @Composable
    fun cardColors() = CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface
    )

    @Composable
    fun elevatedCardColors() = CardDefaults.elevatedCardColors(
        containerColor = MaterialTheme.colorScheme.surface,
        contentColor = MaterialTheme.colorScheme.onSurface
    )

    @Composable
    fun cardBorder() = BorderStroke(CardBorderWidth, MaterialTheme.colorScheme.outline)

    @Composable
    fun inputColors() = OutlinedTextFieldDefaults.colors(
        focusedTextColor = MaterialTheme.colorScheme.onSurface,
        unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
        focusedBorderColor = MaterialTheme.colorScheme.primary,
        unfocusedBorderColor = MaterialTheme.colorScheme.outline,
        focusedLabelColor = MaterialTheme.colorScheme.primary,
        unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        focusedContainerColor = MaterialTheme.colorScheme.surface,
        unfocusedContainerColor = MaterialTheme.colorScheme.surface,
        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant
    )

    @Composable
    fun chipColors(selected: Boolean = false) = AssistChipDefaults.assistChipColors(
        containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        labelColor = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
        leadingIconContentColor = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant
    )

    @Composable
    fun dialogContainerColor() = MaterialTheme.colorScheme.surface

    @Composable
    @OptIn(ExperimentalMaterial3Api::class)
    fun topAppBarColors() = TopAppBarDefaults.topAppBarColors(
        containerColor = MaterialTheme.colorScheme.surface,
        titleContentColor = MaterialTheme.colorScheme.onSurface,
        navigationIconContentColor = MaterialTheme.colorScheme.onSurface,
        actionIconContentColor = MaterialTheme.colorScheme.onSurface
    )

    @Composable
    fun bottomNavItemColors() = NavigationBarItemDefaults.colors(
        selectedIconColor = MaterialTheme.colorScheme.primary,
        selectedTextColor = MaterialTheme.colorScheme.primary,
        indicatorColor = MaterialTheme.colorScheme.primaryContainer,
        unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
        unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
        disabledIconColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f),
        disabledTextColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
    )

    @Composable
    fun statusColor(status: TembusStatus): Color = when (status) {
        TembusStatus.Success, TembusStatus.Completed -> Success
        TembusStatus.Warning, TembusStatus.Pending -> Warning
        TembusStatus.Error, TembusStatus.Cancelled -> MaterialTheme.colorScheme.error
        TembusStatus.Info, TembusStatus.Active -> Info
        TembusStatus.Disabled -> TextDisabled
    }

    @Composable
    fun statusContainerColor(status: TembusStatus): Color = statusColor(status).copy(alpha = 0.12f)

    @Composable
    fun timelineConnectorColor(active: Boolean): Color =
        if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline

    @Composable
    fun proofCardColors(isComplete: Boolean) = CardDefaults.cardColors(
        containerColor = if (isComplete) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
        contentColor = if (isComplete) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface
    )
}
