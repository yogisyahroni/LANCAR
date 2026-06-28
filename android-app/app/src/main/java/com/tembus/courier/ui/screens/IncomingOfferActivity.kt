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
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.tembus.courier.receiver.NotificationReceiver
import com.tembus.courier.ui.MainActivity
import com.tembus.courier.ui.components.BidirectionalSwipeSlider
import com.tembus.courier.ui.theme.TEMBUSCourierTheme
import com.tembus.courier.ui.theme.PrimaryDark
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
        val pickupAddress = intent.getStringExtra(NotificationReceiver.EXTRA_PICKUP_ADDRESS) ?: "Titik Jemput"
        val dropAddress = intent.getStringExtra(NotificationReceiver.EXTRA_DROP_ADDRESS) ?: "Titik Tujuan"
        val fee = intent.getStringExtra(NotificationReceiver.EXTRA_FEE) ?: "Rp -"
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
                            .padding(24.dp),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "Pekerjaan Masuk!",
                            style = MaterialTheme.typography.headlineMedium,
                            fontWeight = FontWeight.Bold,
                            color = PrimaryDark,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "$fee • $distance",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary
                        )
                        
                        Spacer(modifier = Modifier.height(32.dp))
                        
                        // Addresses
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                            shape = MaterialTheme.shapes.medium
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text("Jemput:", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(pickupAddress, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                                Spacer(modifier = Modifier.height(12.dp))
                                Text("Antar:", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(dropAddress, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                            }
                        }

                        Spacer(modifier = Modifier.height(48.dp))

                        BidirectionalSwipeSlider(
                            onAccept = {
                                acceptOffer()
                            },
                            onReject = {
                                rejectOffer()
                            }
                        )
                        
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Abaikan atau kunci layar untuk menutup",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
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
