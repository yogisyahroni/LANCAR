package com.tembus.customer.data.db

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory
import com.tembus.customer.data.model.Location


import com.tembus.customer.data.model.Order



import com.tembus.customer.data.model.Order

/**
 * Order Database
 * 
 * Room database for offline order queue storage and location tracking.
 * Handles order synchronization with backend when online.
 */
@Database(
    entities = [Order::class, Location::class],
    version = 3,
    exportSchema = false
)
abstract class OrderDatabase : RoomDatabase() {

    abstract fun orderDao(): OrderDao
    abstract fun locationDao(): LocationDao

    companion object {
        @Volatile
        private var INSTANCE: OrderDatabase? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_order_id` ON `orders` (`order_id`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_status` ON `orders` (`status`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_locations_order_id` ON `locations` (`order_id`)")
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `order_number` TEXT NOT NULL DEFAULT ''")
            }
        }

        fun getDatabase(context: Context): OrderDatabase {
            return INSTANCE ?: synchronized(this) {
                // 🔐 SECURITY: Implementation of SQLCipher SupportFactory for on-disk encryption
                // In production, the passkey should be derived from Android Keystore
                val passkey = android.provider.Settings.Secure.getString(
                    context.contentResolver,
                    android.provider.Settings.Secure.ANDROID_ID
                ).toByteArray()
                val factory = SupportOpenHelperFactory(passkey)
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    OrderDatabase::class.java,
                    "order_database"
                )
                    .openHelperFactory(factory)
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
 * Type Converters for Room
 * 
 * Converts complex types (Uri, String) to database-compatible types.
 */
class Converters {

    // Add converters if needed for custom types
    // Currently Order uses String for podImageUri which is compatible
}
