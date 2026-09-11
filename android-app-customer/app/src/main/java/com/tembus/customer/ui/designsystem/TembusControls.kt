package com.tembus.customer.ui.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonColors
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.tembus.customer.ui.theme.TembusComponentDefaults
import com.tembus.customer.ui.theme.TembusRadius

enum class TembusButtonVariant {
    Primary,
    Secondary,
    Outline,
    Tonal,
    Destructive,
    Text,
}

enum class TembusControlState {
    Default,
    Loading,
    Success,
    Warning,
    Error,
    Disabled,
}

enum class TembusControlSize {
    Small,
    Medium,
    Large,
}

private fun TembusControlSize.minHeight(): Dp = when (this) {
    TembusControlSize.Small -> 48.dp
    TembusControlSize.Medium -> 48.dp
    TembusControlSize.Large -> 56.dp
}

private fun TembusControlSize.horizontalPadding(): Dp = when (this) {
    TembusControlSize.Small -> 12.dp
    TembusControlSize.Medium -> 16.dp
    TembusControlSize.Large -> 20.dp
}

@Composable
private fun buttonColors(variant: TembusButtonVariant): ButtonColors = when (variant) {
    TembusButtonVariant.Primary -> TembusComponentDefaults.primaryButtonColors()
    TembusButtonVariant.Secondary,
    TembusButtonVariant.Tonal -> ButtonDefaults.filledTonalButtonColors(
        containerColor = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
        disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
        disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    TembusButtonVariant.Outline -> ButtonDefaults.outlinedButtonColors(
        contentColor = MaterialTheme.colorScheme.primary,
        disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    TembusButtonVariant.Destructive -> TembusComponentDefaults.destructiveButtonColors()
    TembusButtonVariant.Text -> ButtonDefaults.textButtonColors(
        contentColor = MaterialTheme.colorScheme.primary,
        disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
fun TembusButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: TembusButtonVariant = TembusButtonVariant.Primary,
    state: TembusControlState = TembusControlState.Default,
    size: TembusControlSize = TembusControlSize.Medium,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
) {
    val isEnabled = state != TembusControlState.Disabled && state != TembusControlState.Loading
    val contentColor = when (variant) {
        TembusButtonVariant.Primary -> MaterialTheme.colorScheme.onPrimary
        TembusButtonVariant.Secondary,
        TembusButtonVariant.Tonal -> MaterialTheme.colorScheme.onSecondaryContainer
        TembusButtonVariant.Outline,
        TembusButtonVariant.Text -> MaterialTheme.colorScheme.primary
        TembusButtonVariant.Destructive -> MaterialTheme.colorScheme.onError
    }
    val resolvedContentColor = if (state == TembusControlState.Error) {
        MaterialTheme.colorScheme.onError
    } else {
        contentColor
    }
    val content: @Composable RowScope.() -> Unit = {
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
        ) {
            if (state == TembusControlState.Loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    strokeWidth = 2.dp,
                    color = resolvedContentColor,
                )
            } else if (leadingIcon != null) {
                Icon(imageVector = leadingIcon, contentDescription = "", modifier = Modifier.size(20.dp))
            }
            Text(text = text)
            if (state != TembusControlState.Loading && trailingIcon != null) {
                Icon(imageVector = trailingIcon, contentDescription = "", modifier = Modifier.size(20.dp))
            }
        }
    }

    if (variant == TembusButtonVariant.Text) {
        TextButton(
            onClick = onClick,
            enabled = isEnabled,
            modifier = modifier.heightIn(min = size.minHeight()),
            contentPadding = PaddingValues(
                start = size.horizontalPadding(),
                end = size.horizontalPadding(),
                top = 8.dp,
                bottom = 8.dp,
            ),
            colors = buttonColors(variant),
            content = content,
        )
    } else {
        Button(
            onClick = onClick,
            enabled = isEnabled,
            modifier = modifier.heightIn(min = size.minHeight()),
            shape = RoundedCornerShape(TembusRadius.Button),
            border = if (variant == TembusButtonVariant.Outline) ButtonDefaults.outlinedButtonBorder(enabled = isEnabled) else null,
            contentPadding = PaddingValues(
                start = size.horizontalPadding(),
                end = size.horizontalPadding(),
                top = 8.dp,
                bottom = 8.dp,
            ),
            colors = buttonColors(variant),
            content = content,
        )
    }
}

@Composable
fun TembusIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    selected: Boolean = false,
) {
    IconButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .size(48.dp)
            .semantics {
                role = Role.Button
                this.selected = selected
            },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
fun TembusTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    supportingText: String? = null,
    errorText: String? = null,
    state: TembusControlState = TembusControlState.Default,
    enabled: Boolean = true,
    singleLine: Boolean = true,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    onTrailingIconClick: (() -> Unit)? = null,
) {
    val isError = state == TembusControlState.Error || !errorText.isNullOrBlank()
    val fieldModifier = if (isError) {
        modifier.semantics { error(errorText ?: "Nilai tidak valid") }
    } else {
        modifier
    }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = fieldModifier.fillMaxWidth(),
        enabled = enabled && state != TembusControlState.Disabled,
        label = { Text(label) },
        placeholder = placeholder?.let { { Text(it) } },
        supportingText = (errorText ?: supportingText)?.let { message -> { Text(message) } },
        isError = isError,
        singleLine = singleLine,
        leadingIcon = leadingIcon?.let { icon -> { Icon(icon, contentDescription = "") } },
        trailingIcon = trailingIcon?.let { icon ->
            {
                if (onTrailingIconClick == null) Icon(icon, contentDescription = "")
                else TembusIconButton(icon, "Aksi $label", onTrailingIconClick)
            }
        },
        colors = TembusComponentDefaults.inputColors(),
    )
}

@Composable
fun TembusSearchField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String = "Cari",
    modifier: Modifier = Modifier,
    placeholder: String = "Cari layanan atau pesanan",
    onSearch: (() -> Unit)? = null,
    enabled: Boolean = true,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        label = { Text(label) },
        placeholder = { Text(placeholder) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text, imeAction = ImeAction.Search),
        keyboardActions = KeyboardActions(onSearch = { onSearch?.invoke() }),
        colors = TembusComponentDefaults.inputColors(),
    )
}

@Composable
fun TembusChip(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    enabled: Boolean = true,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
) {
    AssistChip(
        onClick = onClick,
        enabled = enabled,
        label = { Text(label) },
        modifier = modifier.heightIn(min = 48.dp),
        leadingIcon = leadingIcon?.let { icon -> { Icon(icon, contentDescription = "") } },
        trailingIcon = trailingIcon?.let { icon -> { Icon(icon, contentDescription = "") } },
        colors = AssistChipDefaults.assistChipColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
            labelColor = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurface,
            leadingIconContentColor = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
            trailingIconContentColor = if (selected) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant,
            disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            disabledLabelColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
    )
}
