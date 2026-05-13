package com.lancar.customer.di

import android.content.Context
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.lancar.customer.BuildConfig
import com.lancar.customer.data.api.AuthInterceptor
import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.api.TokenRefreshInterceptor
import com.lancar.customer.data.session.AuthSessionManager
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

        if (!BuildConfig.DEBUG) {
            // =========================================================================
            // 🛡️ ENTERPRISE SECURITY: DYNAMIC SSL PINNING WITH BACKUP STRATEGY
            // =========================================================================
            // Do NOT use hardcoded strings like "api.lancar.com". Use the actual host 
            // from BuildConfig to support different environments (Staging vs Prod).
            val hostName = try {
                java.net.URL(BuildConfig.BASE_URL).host
            } catch (e: Exception) {
                "api.lancar.com" // Fallback only if URL parsing fails
            }

            // CRITICAL ACTION REQUIRED BEFORE PRODUCTION:
            // Run this command to get the actual SHA-256 pin for your domain:
            // openssl s_client -servername api.lancar.com -connect api.lancar.com:443 | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64
            
            // Note: ALWAYS provide a backup pin (e.g., your next certificate's public key)
            // If you only have one pin and the certificate expires/is revoked, THE APP WILL BRICK.
            val PRODUCTION_SHA256_PIN_PRIMARY = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
            val PRODUCTION_SHA256_PIN_BACKUP = "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="

            val certificatePinner = CertificatePinner.Builder()
                .add(hostName, PRODUCTION_SHA256_PIN_PRIMARY)
                .add(hostName, PRODUCTION_SHA256_PIN_BACKUP)
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
    fun provideApiService(retrofit: Retrofit): LANCARApiService {
        return retrofit.create(LANCARApiService::class.java)
    }
}
