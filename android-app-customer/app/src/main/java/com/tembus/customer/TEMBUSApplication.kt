package com.tembus.customer

import android.app.Application
import android.util.Log
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.tembus.customer.util.FirebaseInitializer
import com.tembus.customer.ui.localization.LocaleApplier
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.featureflag.FeatureFlagManager
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

@HiltAndroidApp
class TEMBUSApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var localeApplier: LocaleApplier

    @Inject
    lateinit var tembusApiService: TEMBUSApiService

    private val TAG = "TEMBUSApplication"

    override fun onCreate() {
        super.onCreate()
        com.getkeepsafe.relinker.ReLinker.loadLibrary(this, "sqlcipher")
        FirebaseInitializer.initializeIfConfigured(this)
        FeatureFlagManager.init(this, tembusApiService)
        // C7: terapkan bahasa tersimpan (id default) sebelum UI dirender.
        GlobalScope.launch {
            try { localeApplier.applySavedLanguage() } catch (_: Exception) {}
        }
        Log.d(TAG, "Customer Application created")
    }

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()
}
