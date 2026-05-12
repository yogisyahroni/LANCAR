package com.lancar.courier.di

import android.content.Context
import androidx.room.Room
import com.lancar.courier.data.db.LocationDao
import com.lancar.courier.data.db.OrderDao
import com.lancar.courier.data.db.OrderDatabase
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
    fun provideOrderDatabase(
        @ApplicationContext context: Context
    ): OrderDatabase {
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
