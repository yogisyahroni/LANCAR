package com.tembus.merchant.data.api

import com.tembus.merchant.BuildConfig
import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.session.AuthSessionManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * ApiClient — Retrofit singleton. Base URL dari BuildConfig.BASE_URL (gateway Tembus).
 * Debug: logging HTTP aktif; release: off.
 *
 * ADR-004: client utama punya AuthInterceptor + TokenAuthenticator; service refresh
 * memakai client polos (tanpa AuthInterceptor/Authenticator) supaya tidak loop.
 */
object ApiClient {

    fun createService(
        sessionManager: AuthSessionManager,
        deviceIdentityProvider: DeviceIdentityProvider
    ): TEMBUSApiService {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        // Service khusus refresh — tanpa AuthInterceptor & Authenticator.
        val refreshClient = buildBaseClient(logging).build()
        val refreshService = buildRetrofit(refreshClient).create(TEMBUSApiService::class.java)

        val client = buildBaseClient(logging)
            .addInterceptor(AuthInterceptor(sessionManager))
            .authenticator(TokenAuthenticator(sessionManager, deviceIdentityProvider, refreshService))
            .build()

        return buildRetrofit(client).create(TEMBUSApiService::class.java)
    }

    private fun buildBaseClient(logging: HttpLoggingInterceptor): OkHttpClient.Builder =
        OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)

    private fun buildRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
}
