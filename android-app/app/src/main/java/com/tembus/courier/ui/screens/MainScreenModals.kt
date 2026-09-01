package com.tembus.courier.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.AlertDialog
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable

/**
 * Dialog and alert components extracted from MainScreen.kt on 2026-08-30.
 * Safe incremental extraction — zero circular dependencies.
 */

@Composable
internal fun MainScreenMissingPhotoWarning(
    show: Boolean,
    onDismiss: () -> Unit,
) {
    if (show) {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text(text = "Akses Operasional Terkunci") },
            text = { Text(text = "Anda belum melakukan foto. Tunggu sampai kami menghubungi Anda untuk sesi ambil foto dan jaket operasional di Basecamp kami.") },
            confirmButton = {
                TextButton(onClick = onDismiss) { Text(text = "Mengerti") }
            }
        )
    }
}

@Composable
internal fun MainScreenLogoutDialog(
    show: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    if (show) {
        AlertDialog(
            onDismissRequest = onDismiss,
            title = { Text("Konfirmasi Keluar") },
            text = { Text("Anda yakin ingin keluar dari akun kurir ini?") },
            confirmButton = {
                TextButton(onClick = {
                    onDismiss()
                    onConfirm()
                }) { Text("Keluar") }
            },
            dismissButton = {
                TextButton(onClick = onDismiss) { Text("Batal") }
            }
        )
    }
}

@Composable
internal fun MainScreenInlineError(
    message: String?,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    message?.let { msg ->
        CourierInlineErrorState(
            message = msg,
            onRetry = {
                onDismiss()
                onRetry()
            },
            onDismiss = onDismiss
        )
    }
}
