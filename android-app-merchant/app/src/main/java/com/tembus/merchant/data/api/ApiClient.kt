package com.tembus.merchant.data.api

import com.tembus.merchant.BuildConfig
import com.tembus.merchant.data.device.DeviceIdentityProvider
import com.tembus.merchant.data.session.AuthSessionManager
import com.tembus.merchant.util.MobileTelemetry
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
        deviceIdentityProvider: DeviceIdentityProvider,
        requestReferenceStore: NetworkRequestReferenceStore,
        mobileTelemetry: MobileTelemetry,
    ): TEMBUSApiService {
        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        // Service khusus refresh — tanpa AuthInterceptor & Authenticator.
        val refreshClient = buildBaseClient(logging, requestReferenceStore, mobileTelemetry).build()
        val refreshService = buildRetrofit(refreshClient).create(TEMBUSApiService::class.java)

        val client = buildBaseClient(logging, requestReferenceStore, mobileTelemetry)
            .addInterceptor(AuthInterceptor(sessionManager))
            .authenticator(TokenAuthenticator(sessionManager, deviceIdentityProvider, refreshService))
            .build()

        return buildRetrofit(client).create(TEMBUSApiService::class.java)
    }

    private fun buildBaseClient(
        logging: HttpLoggingInterceptor,
        requestReferenceStore: NetworkRequestReferenceStore,
        mobileTelemetry: MobileTelemetry,
    ): OkHttpClient.Builder =
        OkHttpClient.Builder()
            .addInterceptor(RequestCorrelationInterceptor(requestReferenceStore, mobileTelemetry))
            .addInterceptor(SafeGetRetryInterceptor())
            .addInterceptor(logging)
            .retryOnConnectionFailure(false)
            .callTimeout(NetworkReliabilityPolicy.CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .connectTimeout(NetworkReliabilityPolicy.CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(NetworkReliabilityPolicy.READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(NetworkReliabilityPolicy.WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)

    private fun buildRetrofit(client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
}
