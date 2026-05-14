package com.lancar.courier.data.db

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import net.sqlcipher.database.SupportFactory
import com.lancar.courier.data.model.Location

import com.lancar.courier.data.model.Order

/**
 * Order Database
 * 
 * Room database for offline order queue storage and location tracking.
 * Handles order synchronization with backend when online.
 */
@Database(
    entities = [Order::class, Location::class],
    version = 4,
    exportSchema = false
)
abstract class OrderDatabase : RoomDatabase() {

    abstract fun orderDao(): OrderDao
    abstract fun locationDao(): LocationDao

    companion object {
        @Volatile
        private var INSTANCE: OrderDatabase? = null

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_order_id` ON `orders` (`order_id`)")
                database.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_status` ON `orders` (`status`)")
                database.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_needsSync` ON `orders` (`needsSync`)")
                database.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_needsScanSync` ON `orders` (`needsScanSync`)")
                database.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_needsPodSync` ON `orders` (`needsPodSync`)")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `length` REAL")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `width` REAL")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `height` REAL")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `weight` REAL")
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
                val factory = SupportFactory(passkey)

                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    OrderDatabase::class.java,
                    "order_database"
                )
                    .openHelperFactory(factory)
                    .addMigrations(MIGRATION_2_3, MIGRATION_3_4)
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
