package com.tembus.courier.ui.screens

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.BorderStroke
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import com.tembus.courier.ui.localization.CourierText as Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.tembus.courier.receiver.NotificationReceiver
import com.tembus.courier.ui.MainActivity
import com.tembus.courier.ui.components.BidirectionalSwipeSlider
import com.tembus.courier.ui.theme.TEMBUSCourierTheme
import com.tembus.courier.ui.theme.TembusComponentDefaults
import com.tembus.courier.ui.theme.TembusSpacing
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class IncomingOfferActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Wake up screen & show over lockscreen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            keyguardManager.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        // Parse order data from intent
                val orderId = intent.getStringExtra(NotificationReceiver.EXTRA_ORDER_ID) ?: ""
                val dispatchId = intent.getStringExtra(NotificationReceiver.EXTRA_DISPATCH_ID) ?: ""
                val serviceCode = intent.getStringExtra("service_code") ?: ""
                val isMaintenance = serviceCode.startsWith("tambal_ban") || serviceCode.startsWith("towing")
                val pickupAddress = intent.getStringExtra(NotificationReceiver.EXTRA_PICKUP_ADDRESS)
                    ?: if (isMaintenance) "Lokasi layanan" else "Titik Jemput"
                val dropAddress = intent.getStringExtra(NotificationReceiver.EXTRA_DROP_ADDRESS) ?: if (isMaintenance) "" else "Titik Tujuan"
                val fee = intent.getStringExtra(NotificationReceiver.EXTRA_FEE) ?: "Rp -"
                                val estimatedNet = intent.getStringExtra(NotificationReceiver.EXTRA_ESTIMATED_NET_EARNINGS)
                                val feeDisplay = if (!estimatedNet.isNullOrBlank() && estimatedNet != fee) {
                                    estimatedNet
                                } else {
                                    fee
                                }
                                val distance = intent.getStringExtra(NotificationReceiver.EXTRA_DISTANCE) ?: "- km"

        setContent {
            TEMBUSCourierTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = TembusSpacing.Screen, vertical = TembusSpacing.Large),
                        verticalArrangement = Arrangement.spacedBy(TembusSpacing.Medium)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("Tawaran baru", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black, color = MaterialTheme.colorScheme.onSurface)
                                Text("Putuskan sebelum waktu habis", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Surface(color = LogisticsOrange.copy(alpha = 0.14f), shape = TembusComponentDefaults.chipShape()) {
                                Text("LIVE", modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp), color = LogisticsOrange, fontWeight = FontWeight.Black, style = MaterialTheme.typography.labelMedium)
                            }
                        }

                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.surface,
                            shape = TembusComponentDefaults.cardShape(),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.24f)),
                            shadowElevation = 8.dp
                        ) {
                            Column(modifier = Modifier.padding(TembusSpacing.Large), verticalArrangement = Arrangement.spacedBy(TembusSpacing.Medium)) {
                                Text(if (isMaintenance) "Layanan ${serviceCode.replace('_', ' ').ifBlank { "darurat" }}" else "On Demand", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black)
                                Text(if (isMaintenance) "Penanganan kendaraan di lokasi" else "Pengantaran barang pelanggan", color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OfferMetric(icon = Icons.Default.Payments, label = "Pendapatan", value = feeDisplay, modifier = Modifier.weight(1f))
                                    OfferMetric(icon = Icons.Default.Route, label = "Jarak", value = distance, modifier = Modifier.weight(1f))
                                }
                                OfferAddress(icon = Icons.Default.LocationOn, label = if (isMaintenance) "Lokasi layanan" else "Jemput", value = pickupAddress)
                                if (dropAddress.isNotBlank()) {
                                    OfferAddress(icon = Icons.Default.LocationOn, label = if (isMaintenance) "Catatan layanan" else "Antar", value = dropAddress)
                                }
                            }
                        }

                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.surfaceVariant,
                            shape = TembusComponentDefaults.cardShape()
                        ) {
                            Row(modifier = Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Schedule, contentDescription = null, tint = LogisticsOrange)
                                Text("Periksa titik, pendapatan, dan jarak sebelum menerima pekerjaan.", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                            }
                        }

                        BidirectionalSwipeSlider(
                            modifier = Modifier.fillMaxWidth(),
                            onAccept = {
                                acceptOffer()
                            },
                            onReject = {
                                rejectOffer()
                            }
                        )
                        
                        Text(
                            text = "Geser untuk terima • geser berlawanan untuk menolak",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }

    @Composable
    private fun OfferMetric(
        icon: androidx.compose.ui.graphics.vector.ImageVector,
        label: String,
        value: String,
        modifier: Modifier = Modifier
    ) {
        Surface(modifier = modifier, color = MaterialTheme.colorScheme.surfaceVariant, shape = TembusComponentDefaults.chipShape()) {
            Row(modifier = Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.size(18.dp))
                Column {
                    Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelSmall)
                    Text(value, color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Black)
                }
            }
        }
    }

    @Composable
    private fun OfferAddress(
        icon: androidx.compose.ui.graphics.vector.ImageVector,
        label: String,
        value: String
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Top) {
            Surface(color = LogisticsOrange.copy(alpha = 0.12f), shape = RoundedCornerShape(10.dp)) {
                Icon(icon, contentDescription = null, tint = LogisticsOrange, modifier = Modifier.padding(8.dp).size(18.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                Text(value, color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold)
            }
        }
    }

    private fun acceptOffer() {
        val acceptIntent = Intent(this, NotificationReceiver::class.java).apply {
            action = NotificationReceiver.ACTION_ACCEPT
            putExtras(intent) // Copy all extras from original intent
        }
        sendBroadcast(acceptIntent)
        
        // Open MainActivity to order detail
        val mainIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("selected_order_id", intent.getStringExtra(NotificationReceiver.EXTRA_ORDER_ID))
        }
        startActivity(mainIntent)
        finish()
    }

    private fun rejectOffer() {
        val rejectIntent = Intent(this, NotificationReceiver::class.java).apply {
            action = NotificationReceiver.ACTION_DISMISS
            putExtras(intent) // Copy all extras
        }
        sendBroadcast(rejectIntent)
        finish()
    }
}
