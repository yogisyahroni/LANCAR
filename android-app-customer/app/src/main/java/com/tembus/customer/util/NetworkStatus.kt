package com.tembus.customer.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.SignalCellularConnectedNoInternet4Bar
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.tembus.customer.ui.localization.CustomerText as Text

/**
 * Observe validated internet access instead of relying on the last request.
 * This keeps offline UI honest after airplane mode / Wi-Fi changes and does
 * not conflate a cached snapshot with a live server response.
 */
@Composable
fun rememberNetworkAvailable(): State<Boolean> {
    val context = androidx.compose.ui.platform.LocalContext.current.applicationContext
    val state = remember(context) { mutableStateOf(hasValidatedInternet(context)) }
    DisposableEffect(context) {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        if (connectivityManager == null) return@DisposableEffect onDispose {}
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                state.value = hasValidatedInternet(context)
            }

            override fun onLost(network: Network) {
                // During onLost, activeNetwork can still briefly reference
                // the network being torn down. Do not let that stale handle
                // keep the UI falsely online; the next available/default
                // network callback will validate the replacement.
                state.value = false
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                state.value = hasValidatedInternet(context)
            }
        }
        runCatching {
            // Compose state is observed by the main-thread recomposer. Keep
            // connectivity callbacks on that looper so a live Wi-Fi/data
            // transition updates the mounted screen, not only a cold launch.
            connectivityManager.registerDefaultNetworkCallback(
                callback,
                Handler(Looper.getMainLooper()),
            )
        }.onFailure {
            state.value = hasValidatedInternet(context)
        }
        onDispose {
            runCatching { connectivityManager.unregisterNetworkCallback(callback) }
        }
    }
    return state
}

private fun hasValidatedInternet(context: Context): Boolean {
    val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        ?: return false
    val network = connectivityManager.activeNetwork ?: return false
    val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
    return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}

@Composable
fun CustomerNetworkRecoveryBanner(
    isOnline: Boolean,
    isSlow: Boolean,
    isRetrying: Boolean,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (isOnline && !isSlow) return

    val offline = !isOnline
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Polite },
        color = if (offline) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.tertiaryContainer,
        contentColor = if (offline) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onTertiaryContainer,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = if (offline) Icons.Default.CloudOff else Icons.Default.SignalCellularConnectedNoInternet4Bar,
                contentDescription = null,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(if (offline) "Kamu sedang offline" else "Koneksi sedang lambat")
                Text(
                    if (offline) {
                        "Data yang tersimpan tetap tersedia. Perubahan akan dikirim saat koneksi pulih."
                    } else {
                        "Permintaan membutuhkan waktu lebih lama. Data lama tetap dipertahankan."
                    },
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            TextButton(onClick = onRetry, enabled = !isRetrying) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Text(if (isRetrying) "Memuat" else "Coba lagi")
            }
        }
    }
}
