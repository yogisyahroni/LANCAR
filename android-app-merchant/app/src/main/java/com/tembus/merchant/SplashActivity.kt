package com.tembus.merchant

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity

/**
 * Splash screen — menampilkan windowBackground (gambar brand full-bleed)
 * seketika saat app dibuka, lalu pindah ke MainActivity.
 *
 * Gambar tidak perlu di-inflate: windowBackground theme sudah dirender
 * oleh sistem sebelum activity pertama di-create (anti-flash putih).
 * Hold singkat (700ms) biar brand kelihatan, tanpa delay berlebihan.
 */
class SplashActivity : ComponentActivity() {

    private val handler = Handler(Looper.getMainLooper())

    private val goToMain = Runnable {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
        overridePendingTransition(0, 0)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handler.postDelayed(goToMain, SPLASH_HOLD_MS)
    }

    override fun onDestroy() {
        handler.removeCallbacks(goToMain)
        super.onDestroy()
    }

    private companion object {
        const val SPLASH_HOLD_MS = 700L
    }
}
