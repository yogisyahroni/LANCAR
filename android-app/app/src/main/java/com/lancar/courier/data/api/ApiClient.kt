package com.lancar.courier.data.api

import com.google.gson.GsonBuilder
import com.lancar.courier.data.session.AuthSessionManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * API Client singleton
 * 
 * Provides Retrofit instance configured for LANCAR backend API.
 * Uses base URL from BuildConfig or defaults to local development.
 */
object ApiClient {

    // 10.0.2.2 is the IP address for localhost when using Android Emulator
    private const val BASE_URL = "http://10.0.2.2:8080/"

    private val gson = GsonBuilder()
        .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
        .create()

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private var sessionManager: AuthSessionManager? = null

    /**
     * Initialize the API client with a session manager for authentication.
     */
    fun init(manager: AuthSessionManager) {
        this.sessionManager = manager
    }

    private val okHttpClient: OkHttpClient by lazy {
        val builder = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)

        sessionManager?.let {
            builder.addInterceptor(AuthInterceptor(it))
        }

        builder.build()
    }

    private val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    val apiService: LANCARApiService by lazy { 
        retrofit.create(LANCARApiService::class.java) 
    }
}
