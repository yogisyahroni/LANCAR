package com.lancar.courier.di

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.lancar.courier.BuildConfig
import com.lancar.courier.data.api.AuthInterceptor
import com.lancar.courier.data.api.LANCARApiService
import com.lancar.courier.data.api.TokenExpiryInterceptor
import com.lancar.courier.data.session.AuthSessionManager
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

    @Provides
    @Singleton
    fun provideJson(): Json {
        return Json {
            ignoreUnknownKeys = true
            coerceInputValues = true
            isLenient = true
            prettyPrint = false
        }
    }

    @Provides
    @Singleton
    fun provideHttpLoggingInterceptor(): HttpLoggingInterceptor {
        return HttpLoggingInterceptor().apply {
            // 🔒 Security Enhancement: Leak zero payloads in production logcat logs
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        loggingInterceptor: HttpLoggingInterceptor,
        sessionManager: AuthSessionManager
    ): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .addInterceptor(AuthInterceptor(sessionManager))
            // 🛡️ Auto-logout on Token Expiration (HTTP 401)
            .addInterceptor(TokenExpiryInterceptor(sessionManager))
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)

        if (!BuildConfig.DEBUG) {
            // ══════════════════════════════════════════════════════════════════
            // SSL CERTIFICATE PINNING — PRODUCTION HARDENING
            // ══════════════════════════════════════════════════════════════════
            // HOW TO GET THE REAL PIN (Run before every production release):
            //
            //   openssl s_client -connect <YOUR_BACKEND_DOMAIN>:443 -servername <YOUR_BACKEND_DOMAIN> \
            //     | openssl x509 -pubkey -noout \
            //     | openssl pkey -pubin -outform der \
            //     | openssl dgst -sha256 -binary \
            //     | openssl enc -base64
            //
            // Replace PRODUCTION_SHA256_PIN_PRIMARY below with the output.
            // Add PRODUCTION_SHA256_PIN_BACKUP for certificate rotation resilience.
            //
            // ⚠️ IMPORTANT: If the pin is wrong, ALL production HTTPS requests will FAIL.
            // Test the pin thoroughly in a staging environment before releasing.
            // ══════════════════════════════════════════════════════════════════

            // Extract hostname dynamically from BASE_URL to avoid hardcoding mismatches
            val productionHostname = try {
                java.net.URL(BuildConfig.BASE_URL).host.ifEmpty { "api.lancar.id" }
            } catch (e: Exception) {
                "api.lancar.id" // Fallback to production domain
            }

            // TODO: Replace these placeholder pins with real certificate SHA-256 hashes
            // before production release. See OpenSSL command above.
            val PRODUCTION_SHA256_PIN_PRIMARY = "sha256/REPLACE_WITH_REAL_PRIMARY_CERT_SHA256_HASH="
            val PRODUCTION_SHA256_PIN_BACKUP  = "sha256/REPLACE_WITH_REAL_BACKUP_CERT_SHA256_HASH="

            val certificatePinner = CertificatePinner.Builder()
                .add(productionHostname, PRODUCTION_SHA256_PIN_PRIMARY)
                .add(productionHostname, PRODUCTION_SHA256_PIN_BACKUP)  // For cert rotation
                .build()
            builder.certificatePinner(certificatePinner)
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
    fun provideLANCARApiService(retrofit: Retrofit): LANCARApiService {
        return retrofit.create(LANCARApiService::class.java)
    }
}
