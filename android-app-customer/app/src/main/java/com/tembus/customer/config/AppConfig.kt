package com.tembus.customer.config

/**
 * AppConfig contains centralized Feature Flags and Environment variables for local control.
 */
object AppConfig {
    /**
     * Toggle to switch authentication system from Phone number mode to Email mode.
     * When TRUE, the UI uses Email keyboard layout and provides instructions for Email input.
     */
    const val IS_EMAIL_AUTH_ENABLED = true

    /**
     * Google OAuth server client ID (Web Client ID from Google Cloud Console).
     * This is the *server-side* OAuth client ID used for ID token verification.
     * It is safe to include in the APK — it is not a secret.
     *
     * Steps to obtain:
     *  1. Google Cloud Console → APIs & Services → Credentials
     *  2. Create or select "Web application" OAuth client
     *  3. Copy the Client ID here
     *
     * NOTE: Also create an Android OAuth client for the same project (used by Credential Manager).
     * The Android client does NOT need to be listed here; it's registered via the package name + SHA-1.
     */
    const val GOOGLE_SERVER_CLIENT_ID = com.tembus.customer.BuildConfig.GOOGLE_SERVER_CLIENT_ID

    /**
     * Feature flag: enable Google Sign-In button.
     * Flip to false to hide the button while the backend is not yet ready.
     */
    const val IS_GOOGLE_AUTH_ENABLED = true
}
