package com.lancar.courier.data.db

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
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
    version = 3,
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

        fun getDatabase(context: Context): OrderDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    OrderDatabase::class.java,
                    "order_database"
                )
                    .addMigrations(MIGRATION_2_3)
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
