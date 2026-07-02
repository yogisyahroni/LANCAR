package com.tembus.courier.ui

import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.SosTamperRequest
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@AndroidEntryPoint
class TamperAlertActivity : ComponentActivity() {

    @Inject
    lateinit var apiService: TEMBUSApiService

    private var mediaPlayer: MediaPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var isBlinking = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Play Alarm Sound
        playAlarm()

        // Report to Backend
        reportTamperingToBackend()

        // Start GPS Polling
        startGpsPolling()

        setContent {
            var colorState by remember { mutableStateOf(Color.Red) }

            LaunchedEffect(Unit) {
                while (isBlinking) {
                    colorState = if (colorState == Color.Red) Color.Black else Color.Red
                    delay(500)
                }
            }

            MaterialTheme {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(colorState),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = "⚠ WARNING ⚠",
                            color = Color.White,
                            fontSize = 40.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "GPS / IZIN LOKASI DIMATIKAN SAAT SOS\n\nNYALAKAN KEMBALI GPS & IZINKAN LOKASI ANDA UNTUK MELANJUTKAN.\n\nSistem telah melaporkan indikasi fraud ke server pusat.",
                            color = Color.White,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(32.dp)
                        )
                        Spacer(modifier = Modifier.height(24.dp))
                        androidx.compose.material3.Button(
                            onClick = {
                                val intent = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                                    data = android.net.Uri.fromParts("package", packageName, null)
                                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                                }
                                startActivity(intent)
                            },
                            colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.Red)
                        ) {
                            Text(text = "BUKA PENGATURAN", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }

    private fun playAlarm() {
        try {
            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            mediaPlayer = MediaPlayer.create(this, alarmUri)
            mediaPlayer?.isLooping = true
            mediaPlayer?.start()
        } catch (e: Exception) {
            Log.e("TamperAlert", "Failed to play alarm", e)
        }
    }

    private fun reportTamperingToBackend() {
        val sharedPreferences = getSharedPreferences("sos_prefs", Context.MODE_PRIVATE)
        val incidentId = sharedPreferences.getString("active_incident_id", "") ?: return
        
        if (incidentId.isEmpty()) return

        lifecycleScope.launch {
            try {
                val request = SosTamperRequest(incident_id = incidentId)
                val response = apiService.reportSosTamper(request)
                if (response.isSuccessful) {
                    Log.d("TamperAlert", "Tampering successfully reported to backend.")
                } else {
                    Log.e("TamperAlert", "Failed to report tampering to backend: ${response.code()}")
                }
            } catch (e: Exception) {
                Log.e("TamperAlert", "Failed to report tampering", e)
            }
        }
    }

    private val gpsCheckRunnable = object : Runnable {
        override fun run() {
            val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)

            val hasFineLocation = androidx.core.content.ContextCompat.checkSelfPermission(
                this@TamperAlertActivity, android.Manifest.permission.ACCESS_FINE_LOCATION
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED
            val hasCoarseLocation = androidx.core.content.ContextCompat.checkSelfPermission(
                this@TamperAlertActivity, android.Manifest.permission.ACCESS_COARSE_LOCATION
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            if ((isGpsEnabled || isNetworkEnabled) && (hasFineLocation || hasCoarseLocation)) {
                // User turned GPS back on and restored permissions
                isBlinking = false
                mediaPlayer?.stop()
                mediaPlayer?.release()
                finish()
            } else {
                handler.postDelayed(this, 1000)
            }
        }
    }

    private fun startGpsPolling() {
        handler.post(gpsCheckRunnable)
    }

    override fun onBackPressed() {
        // DO NOTHING to prevent user from closing the screen
    }

    override fun onDestroy() {
        super.onDestroy()
        isBlinking = false
        mediaPlayer?.release()
        handler.removeCallbacks(gpsCheckRunnable)
    }
}
