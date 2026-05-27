package com.tembus.courier.data.db

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import net.sqlcipher.database.SupportFactory
import com.tembus.courier.data.model.Location

import com.tembus.courier.data.model.Order

/**
 * Order Database
 * 
 * Room database for offline order queue storage and location tracking.
 * Handles order synchronization with backend when online.
 */
@Database(
    entities = [Order::class, Location::class],
    version = 10,
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

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `model` TEXT NOT NULL DEFAULT 'P2P'")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `leg_number` INTEGER NOT NULL DEFAULT 1")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `workflow_role` TEXT NOT NULL DEFAULT 'on_demand'")
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `courier_payout_estimate_idr` INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `customer_price_idr` INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `platform_commission_idr` INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `service_code` TEXT")
            }
        }

        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `dispatch_id` TEXT")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `offer_expires_at` INTEGER")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `offer_ttl_seconds` INTEGER")
            }
        }

        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `pickup_latitude` REAL")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `pickup_longitude` REAL")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `drop_latitude` REAL")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `drop_longitude` REAL")
            }
        }

        val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `service_name` TEXT")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `service_category` TEXT")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `service_family` TEXT")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `service_route_model` TEXT")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `service_max_eta_minutes` INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `item_description` TEXT")
            }
        }

        val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(database: SupportSQLiteDatabase) {
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `pickup_scan_verified` INTEGER NOT NULL DEFAULT 0")
                database.execSQL("ALTER TABLE `orders` ADD COLUMN `pickup_photo_verified` INTEGER NOT NULL DEFAULT 0")
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
                    .addMigrations(MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8, MIGRATION_8_9, MIGRATION_9_10)
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
