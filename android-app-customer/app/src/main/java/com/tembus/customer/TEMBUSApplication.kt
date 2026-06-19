package com.tembus.customer

import android.app.Application
import android.util.Log
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.tembus.customer.util.FirebaseInitializer
import dagger.hilt.android.HiltAndroidApp
import net.zetetic.database.sqlcipher.SQLiteDatabase
import javax.inject.Inject

@HiltAndroidApp
class TEMBUSApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    private val TAG = "TEMBUSApplication"

    override fun onCreate() {
        super.onCreate()
        // 🔒 WAJIB: Muat native library SQLCipher SEBELUM database apapun dibuka.
        // Tanpa ini, JVM tidak bisa menemukan implementasi nativeOpen() → UnsatisfiedLinkError → crash fatal.
        SQLiteDatabase.loadLibs(this)
        FirebaseInitializer.initializeIfConfigured(this)
        Log.d(TAG, "Customer Application created")
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
}
