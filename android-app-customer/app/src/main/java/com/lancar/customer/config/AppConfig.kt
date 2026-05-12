package com.lancar.customer.config

/**
 * AppConfig contains centralized Feature Flags and Environment variables for local control.
 */
object AppConfig {
    /**
     * Toggle to switch authentication system from Phone number mode to Email mode.
     * When TRUE, the UI uses Email keyboard layout and provides instructions for Email input.
     */
    const val IS_EMAIL_AUTH_ENABLED = true
}
