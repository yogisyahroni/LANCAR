package com.tembus.customer.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.tembus.customer.data.model.AppVersion

/**
 * Shows a dialog notifying the customer that a newer version is available.
 */
@Composable
fun UpdateDialog(
    version: AppVersion,
    isUpdating: Boolean,
    errorMessage: String?,
    onUpdateNow: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = {
            if (!version.force && !isUpdating) onDismiss()
        },
        title = {
            Text(
                text = "Update tersedia",
                style = MaterialTheme.typography.titleLarge
            )
        },
        text = {
            Column {
                Text(
                    text = "TEMBUS Customer ${version.name} sudah tersedia. App akan menyiapkan paket update dan membuka installer Android."
                )

                if (isUpdating) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(modifier = Modifier.width(10.dp))
                        Text(
                            text = "Mengunduh update...",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }

                if (!errorMessage.isNullOrBlank()) {
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = errorMessage,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !isUpdating,
                onClick = onUpdateNow
            ) {
                Text(if (isUpdating) "Mengunduh..." else "Update sekarang")
            }
        },
        dismissButton = {
            if (!version.force && !isUpdating) {
                TextButton(onClick = onDismiss) {
                    Text("Nanti")
                }
            }
        }
    )
}
