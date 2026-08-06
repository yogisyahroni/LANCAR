package com.tembus.merchant.data.onboarding

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.merchantDataStore by preferencesDataStore(name = "merchant_prefs")

/**
 * OnboardingPreferences — flag onboarding selesai (FOOD-BIKE-028: onboarding wajib
 * muncul setelah login pertama untuk memberitahu cara pakai aplikasi).
 */
class OnboardingPreferences(private val context: Context) {

    suspend fun markOnboardingCompleted() {
        context.merchantDataStore.edit { prefs ->
            prefs[KEY_ONBOARDING_DONE] = true
        }
    }

    val onboardingCompleted: Flow<Boolean> = context.merchantDataStore.data.map { prefs ->
        prefs[KEY_ONBOARDING_DONE] ?: false
    }

    companion object {
        private val KEY_ONBOARDING_DONE = booleanPreferencesKey("onboarding_completed")
    }
}
