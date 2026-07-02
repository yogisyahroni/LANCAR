package com.tembus.courier.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.util.Log
import com.tembus.courier.ui.TamperAlertActivity

class GpsTamperReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == LocationManager.PROVIDERS_CHANGED_ACTION) {
            val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)

            if (!isGpsEnabled && !isNetworkEnabled) {
                // GPS is disabled. 
                // Check if SOS is currently active.
                val sharedPreferences = context.getSharedPreferences("sos_prefs", Context.MODE_PRIVATE)
                val isSosActive = sharedPreferences.getBoolean("is_sos_active", false)

                if (isSosActive) {
                    Log.e("GpsTamperReceiver", "GPS DISABLED DURING ACTIVE SOS! Triggering UI Lock...")
                    val tamperIntent = Intent(context, TamperAlertActivity::class.java).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                    }
                    context.startActivity(tamperIntent)
                }
            }
        }
    }
}
