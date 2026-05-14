package com.lancar.customer.data.db

import android.content.Context
import androidx.room.*
import net.sqlcipher.database.SupportFactory
import com.lancar.customer.data.model.Location


import com.lancar.customer.data.model.Order

/**
 * Order Database
 * 
 * Room database for offline order queue storage and location tracking.
 * Handles order synchronization with backend when online.
 */
@Database(
    entities = [Order::class, Location::class],
    version = 2,
    exportSchema = false
)
abstract class OrderDatabase : RoomDatabase() {

    abstract fun orderDao(): OrderDao
    abstract fun locationDao(): LocationDao

    companion object {
        @Volatile
        private var INSTANCE: OrderDatabase? = null

        fun getDatabase(context: Context): OrderDatabase {
            return INSTANCE ?: synchronized(this) {
                // 🔐 SECURITY: Implementation of SQLCipher SupportFactory for on-disk encryption
                // In production, the passkey should be derived from Android Keystore
                val passkey = android.provider.Settings.Secure.getString(
                    context.contentResolver,
                    android.provider.Settings.Secure.ANDROID_ID
                ).toByteArray()
                val factory = SupportFactory(passkey)
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    OrderDatabase::class.java,
                    "order_database"
                )
                    .openHelperFactory(factory)
                    .fallbackToDestructiveMigration()
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}

/**
 * Type Converters for Room
 * 
 * Converts complex types (Uri, String) to database-compatible types.
 */
class Converters {

    // Add converters if needed for custom types
    // Currently Order uses String for podImageUri which is compatible
}
