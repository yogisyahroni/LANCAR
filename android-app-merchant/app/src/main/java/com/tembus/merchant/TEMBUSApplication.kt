package com.tembus.merchant

import android.app.Application
import android.content.Context
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.memory.MemoryCache
import com.tembus.merchant.data.api.ApiClient
import com.tembus.merchant.data.api.NetworkRequestReferenceStore
import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.featureflag.FeatureFlagManager
import com.tembus.merchant.data.cache.MerchantOfflineCache
import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.notifications.OrderAlertNotifier
import com.tembus.merchant.data.onboarding.OnboardingPreferences
import com.tembus.merchant.data.repository.AuthRepository
import com.tembus.merchant.data.repository.ChatRepository
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.data.session.AuthSessionManager
import com.tembus.merchant.util.UpdateManager
import com.tembus.merchant.util.MobileCrashContext
import com.tembus.merchant.util.FirebaseInitializer
import com.tembus.merchant.util.MobileTelemetry

/**
 * AppContainer — manual dependency injection (tanpa Hilt; pola ringan & langsung).
 * Semua ViewModel mengambil dependency dari sini.
 */
class AppContainer(context: Context) {

    val appContext: Context = context.applicationContext
    val sessionManager: AuthSessionManager = AuthSessionManager(context)
    val onboardingPreferences: OnboardingPreferences = OnboardingPreferences(context)
    val deviceIdentityProvider: DeviceIdentityProvider = DeviceIdentityProvider(context)
    val requestReferenceStore: NetworkRequestReferenceStore = NetworkRequestReferenceStore()
    val mobileTelemetry: MobileTelemetry = MobileTelemetry(appContext)

    val apiService: TEMBUSApiService = ApiClient.createService(
        sessionManager,
        deviceIdentityProvider,
        requestReferenceStore,
        mobileTelemetry,
    )

    val authRepository: AuthRepository = AuthRepository(apiService, sessionManager, onboardingPreferences, deviceIdentityProvider)
    val merchantOfflineCache: MerchantOfflineCache = MerchantOfflineCache(appContext) { sessionManager.getUserIdSync() }
    val merchantRepository: MerchantRepository = MerchantRepository(apiService, merchantOfflineCache)
    val experienceConfigRepository: com.tembus.merchant.data.repository.ExperienceConfigRepository =
        com.tembus.merchant.data.repository.ExperienceConfigRepository(appContext, apiService)

    // FB-119: chat customer↔merchant per order.
    val chatRepository: ChatRepository = ChatRepository(apiService)

    // FB-106: alert suara/getar order baru (local notification dari polling).
    val orderAlertNotifier: OrderAlertNotifier = OrderAlertNotifier(appContext)

    // Auto-update: GitHub Releases (debug/staging) + backend contract (release).
    val updateManager: UpdateManager = UpdateManager(apiService, appContext)
}

class TEMBUSApplication : Application(), ImageLoaderFactory {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        FirebaseInitializer.initializeIfConfigured(this)
        MobileCrashContext.install()
        container = AppContainer(this)
        FeatureFlagManager.init(this, container.apiService)
        // FB-093: inisialisasi osmdroid (user agent wajib, kalau tidak tile 403)
        org.osmdroid.config.Configuration.getInstance().load(
            this, android.preference.PreferenceManager.getDefaultSharedPreferences(this)
        )
        org.osmdroid.config.Configuration.getInstance().userAgentValue = packageName
    }

    override fun newImageLoader(): ImageLoader =
        ImageLoader.Builder(this)
            .memoryCache { MemoryCache.Builder(this).maxSizePercent(0.15).build() }
            .crossfade(true)
            .build()
}
