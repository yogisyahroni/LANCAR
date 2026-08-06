package com.tembus.merchant

import android.app.Application
import android.content.Context
import com.tembus.merchant.data.api.ApiClient
import com.tembus.merchant.data.api.TEMBUSApiService
import com.tembus.merchant.data.onboarding.OnboardingPreferences
import com.tembus.merchant.data.repository.AuthRepository
import com.tembus.merchant.data.repository.MerchantRepository
import com.tembus.merchant.data.session.AuthSessionManager

/**
 * AppContainer — manual dependency injection (tanpa Hilt; pola ringan & langsung).
 * Semua ViewModel mengambil dependency dari sini.
 */
class AppContainer(context: Context) {

    val sessionManager: AuthSessionManager = AuthSessionManager(context)
    val onboardingPreferences: OnboardingPreferences = OnboardingPreferences(context)

    val apiService: TEMBUSApiService = ApiClient.createService(sessionManager)

    val authRepository: AuthRepository = AuthRepository(apiService, sessionManager)
    val merchantRepository: MerchantRepository = MerchantRepository(apiService)
}

class TEMBUSApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
