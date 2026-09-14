package com.tembus.customer

import android.app.Application
import android.util.Log
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.memory.MemoryCache
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.tembus.customer.util.FirebaseInitializer
import com.tembus.customer.util.MobileCrashContext
import com.tembus.customer.ui.localization.LocaleApplier
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.featureflag.FeatureFlagManager
import com.tembus.customer.domain.config.AppStartupCoordinator
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

@HiltAndroidApp
class TEMBUSApplication : Application(), Configuration.Provider, ImageLoaderFactory {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var localeApplier: LocaleApplier

    @Inject
    lateinit var tembusApiService: TEMBUSApiService

    @Inject
    lateinit var appStartupCoordinator: AppStartupCoordinator

    private val TAG = "TEMBUSApplication"

    override fun onCreate() {
        super.onCreate()
        com.getkeepsafe.relinker.ReLinker.loadLibrary(this, "sqlcipher")
        FirebaseInitializer.initializeIfConfigured(this)
        MobileCrashContext.install(this)
        FeatureFlagManager.init(this, tembusApiService)
        // Experience config is presentation-only and must never delay the
        // native/authenticated shell. It restores cache and refreshes in the
        // manager's background scope.
        appStartupCoordinator.start()
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

    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.15).build() }
            .crossfade(true)
            .build()
}
