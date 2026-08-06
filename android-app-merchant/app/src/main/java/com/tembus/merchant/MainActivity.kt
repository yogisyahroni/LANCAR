package com.tembus.merchant

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.tembus.merchant.ui.navigation.AppNavHost
import com.tembus.merchant.ui.theme.TEMBUSMerchantTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TEMBUSMerchantTheme {
                AppNavHost()
            }
        }
    }
}
