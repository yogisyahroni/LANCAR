package com.tembus.merchant

import android.app.Application
import android.content.Context
import com.tembus.merchant.data.api.ApiClient
import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.notifications.OrderAlertNotifier
import com.tembus.merchant.data.onboarding.OnboardingPreferences
import com.tembus.merchant.data.repository.AuthRepository
import com.tembus.merchant.data.repository.ChatRepository
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.data.session.AuthSessionManager
import com.tembus.merchant.util.UpdateManager

/**
 * AppContainer — manual dependency injection (tanpa Hilt; pola ringan & langsung).
 * Semua ViewModel mengambil dependency dari sini.
 */
class AppContainer(context: Context) {

    val appContext: Context = context.applicationContext
    val sessionManager: AuthSessionManager = AuthSessionManager(context)
    val onboardingPreferences: OnboardingPreferences = OnboardingPreferences(context)
    val deviceIdentityProvider: DeviceIdentityProvider = DeviceIdentityProvider(context)

    val apiService: TEMBUSApiService = ApiClient.createService(sessionManager)

    val authRepository: AuthRepository = AuthRepository(apiService, sessionManager, onboardingPreferences, deviceIdentityProvider)
    val merchantRepository: MerchantRepository = MerchantRepository(apiService)

    // FB-119: chat customer↔merchant per order.
    val chatRepository: ChatRepository = ChatRepository(apiService)

    // FB-106: alert suara/getar order baru (local notification dari polling).
    val orderAlertNotifier: OrderAlertNotifier = OrderAlertNotifier(appContext)

    // Auto-update: GitHub Releases (debug/staging) + backend contract (release).
    val updateManager: UpdateManager = UpdateManager(apiService, appContext)
}

class TEMBUSApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        // FB-093: inisialisasi osmdroid (user agent wajib, kalau tidak tile 403)
        org.osmdroid.config.Configuration.getInstance().load(
            this, android.preference.PreferenceManager.getDefaultSharedPreferences(this)
        )
        org.osmdroid.config.Configuration.getInstance().userAgentValue = packageName
    }
}
