package com.tembus.customer.di

import android.content.Context
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.api.AuthInterceptor
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.api.TokenRefreshInterceptor
import com.tembus.customer.data.session.AuthSessionManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.CertificatePinner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    private val certificatePinPattern = Regex("^sha256/[A-Za-z0-9+/]{43}=$")

    private fun isValidCertificatePin(pin: String): Boolean {
        return certificatePinPattern.matches(pin.trim())
    }

    private fun buildCertificatePinner(): CertificatePinner {
        val hostName = runCatching {
            java.net.URL(BuildConfig.BASE_URL).host.orEmpty()
        }.getOrDefault("")

        require(hostName.isNotBlank()) {
            "BASE_URL host is required when API certificate pinning is enabled."
        }

        val primaryPin = BuildConfig.API_CERT_SHA256_PIN_PRIMARY.trim()
        val backupPin = BuildConfig.API_CERT_SHA256_PIN_BACKUP.trim()

        require(isValidCertificatePin(primaryPin)) {
            "API_CERT_SHA256_PIN_PRIMARY must be a valid sha256/<base64> pin."
        }
        require(isValidCertificatePin(backupPin)) {
            "API_CERT_SHA256_PIN_BACKUP must be a valid sha256/<base64> backup pin."
        }
        require(backupPin != primaryPin) {
            "API_CERT_SHA256_PIN_BACKUP must be different from the primary pin."
        }

        return CertificatePinner.Builder()
            .add(hostName, primaryPin)
            .add(hostName, backupPin)
            .build()
    }

    @Provides
    @Singleton
    fun provideJson(): Json {
        return Json {
            ignoreUnknownKeys = true
            isLenient = true
            encodeDefaults = true
            prettyPrint = true
            coerceInputValues = true
        }
    }

    @Provides
    @Singleton
    fun provideLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY else HttpLoggingInterceptor.Level.NONE
        }
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        loggingInterceptor: HttpLoggingInterceptor,
        sessionManager: AuthSessionManager,
        tokenRefreshInterceptor: TokenRefreshInterceptor
    ): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .addInterceptor(AuthInterceptor(sessionManager))
            .addInterceptor(tokenRefreshInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)

        if (!BuildConfig.DEBUG && BuildConfig.API_CERT_PINNING_REQUIRED) {
            builder.certificatePinner(buildCertificatePinner())
        }

        return builder.build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        json: Json
    ): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }

    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): TEMBUSApiService {
        return retrofit.create(TEMBUSApiService::class.java)
    }
}
