package com.lancar.customer.di

import android.content.Context
import androidx.room.Room
import com.lancar.customer.data.db.LocationDao
import com.lancar.customer.data.db.OrderDao
import com.lancar.customer.data.db.OrderDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): OrderDatabase {
        return Room.databaseBuilder(
            context,
            OrderDatabase::class.java,
            "order_database"
        )
        .fallbackToDestructiveMigration()
        .build()
    }

    @Provides
    @Singleton
    fun provideOrderDao(database: OrderDatabase): OrderDao {
        return database.orderDao()
    }

    @Provides
    @Singleton
    fun provideLocationDao(database: OrderDatabase): LocationDao {
        return database.locationDao()
    }
}
