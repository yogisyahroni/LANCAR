package com.tembus.customer.data.db

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory
import com.tembus.customer.data.model.FoodOrderItem
import com.tembus.customer.data.model.Location
import com.tembus.customer.data.model.Order

/**
 * Order Database
 * 
 * Room database for offline order queue storage and location tracking.
 * Handles order synchronization with backend when online.
 */
@Database(
    entities = [Order::class, Location::class],
    version = 7,
    exportSchema = false
)
@TypeConverters(Converters::class)
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

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `eta_minutes` INTEGER DEFAULT NULL")
            }
        }

        // FOOD-BIKE-060: kolom merchant utk dialog rating merchant
        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `merchant_name` TEXT DEFAULT NULL")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `merchant_id` TEXT DEFAULT NULL")
            }
        }

        // FB-111: rincian item pesanan food (JSON string snapshot
        // food_order_items) — customer bisa lihat lagi isi pesanan sendiri.
        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `food_items` TEXT NOT NULL DEFAULT '[]'")
            }
        }

        // FB-121: catatan keseluruhan order (mis. "pisahin sambal semua").
        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `order_notes` TEXT DEFAULT NULL")
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
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7)
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

    private val json = kotlinx.serialization.json.Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    // FB-111: item food — List<FoodOrderItem> ↔ JSON string di Room.
    @TypeConverter
    fun foodItemsToString(items: List<FoodOrderItem>): String {
        return json.encodeToString(
            kotlinx.serialization.builtins.ListSerializer(FoodOrderItem.serializer()),
            items
        )
    }

    @TypeConverter
    fun stringToFoodItems(value: String?): List<FoodOrderItem> {
        if (value.isNullOrBlank()) return emptyList()
        return runCatching {
            json.decodeFromString(
                kotlinx.serialization.builtins.ListSerializer(FoodOrderItem.serializer()),
                value
            )
        }.getOrElse { emptyList() }
    }
}
