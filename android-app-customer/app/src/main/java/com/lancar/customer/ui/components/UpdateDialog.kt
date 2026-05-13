package com.lancar.customer.ui.components

import android.content.Intent
import android.net.Uri
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.lancar.customer.data.model.AppVersion

/**
 * UpdateDialog
 * 
 * Shows a dialog notifying the user that a newer version is available.
 */
@Composable
fun UpdateDialog(
    version: AppVersion,
    onDismiss: () -> Unit
) {
    val context = LocalContext.current

    AlertDialog(
        onDismissRequest = { 
            if (!version.force) onDismiss() 
        },
        title = { 
            Text(
                text = "Update Available",
                style = MaterialTheme.typography.titleLarge
            ) 
        },
        text = { 
            Text(
                text = "A new version of LANCAR Customer (${version.name}) is available. Please update to continue enjoying the best experience."
            ) 
        },
        confirmButton = {
            Button(
                onClick = {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(version.updateUrl))
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    context.startActivity(intent)
                }
            ) {
                Text("Update Now")
            }
        },
        dismissButton = {
            if (!version.force) {
                TextButton(onClick = onDismiss) {
                    Text("Later")
                }
            }
        }
    )
}
