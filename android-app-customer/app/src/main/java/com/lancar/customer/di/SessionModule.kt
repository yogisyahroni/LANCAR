package com.lancar.customer.di

import android.content.Context
import com.lancar.customer.data.session.AuthSessionManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object SessionModule {

    @Provides
    @Singleton
    fun provideAuthSessionManager(@ApplicationContext context: Context): AuthSessionManager {
        return AuthSessionManager(context)
    }
}
