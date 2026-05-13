package com.lancar.customer.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.lancar.customer.ui.screens.auth.AuthNavGraph
import com.lancar.customer.ui.theme.LANCARCustomerTheme
import com.scottyab.rootbeer.RootBeer
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // =========================================================================
        // 🛡️ ENTERPRISE SECURITY: ROOT DETECTION
        // =========================================================================
        // Prevent app from running on rooted devices to secure payments and location
        val rootBeer = RootBeer(this)
        if (rootBeer.isRooted) {
            Toast.makeText(this, "Aplikasi tidak dapat berjalan di perangkat yang di-root", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        setContent {
            LANCARCustomerTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    com.lancar.customer.ui.navigation.RootNavGraph()
                }
            }
        }
    }
}
