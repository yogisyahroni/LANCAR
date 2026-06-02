package com.tembus.customer.data.onboarding

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OnboardingPreferences @Inject constructor(
    @ApplicationContext context: Context
) {
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun isCompleted(): Boolean {
        return preferences.getBoolean(KEY_COMPLETED, false)
    }

    fun markCompleted() {
        preferences.edit()
            .putBoolean(KEY_COMPLETED, true)
            .apply()
    }

    private companion object {
        const val PREFS_NAME = "tembus_customer_onboarding"
        const val KEY_COMPLETED = "is_completed"
    }
}
