package com.lancar.customer

import android.app.Application
import android.util.Log
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.lancar.customer.util.FirebaseInitializer
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class TEMBUSApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    private val TAG = "TEMBUSApplication"

    override fun onCreate() {
        super.onCreate()
        FirebaseInitializer.initializeIfConfigured(this)
        Log.d(TAG, "Customer Application created")
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
}
