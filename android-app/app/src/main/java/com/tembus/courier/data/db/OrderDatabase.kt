package com.tembus.courier.data.db

import android.content.Context
import androidx.room.*
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import net.zetetic.database.sqlcipher.SupportOpenHelperFactory
import com.tembus.courier.data.model.CourierOrderPackage
import com.tembus.courier.data.model.Location
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.TambalBanReport
import com.tembus.courier.data.model.TowingReport
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Order Database
 * 
 * Room database for offline order queue storage and location tracking.
 * Handles order synchronization with backend when online.
 */
@Database(
    entities = [Order::class, Location::class],
    version = 16,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class OrderDatabase : RoomDatabase() {

    abstract fun orderDao(): OrderDao
    abstract fun locationDao(): LocationDao

    companion object {
        @Volatile
        private var INSTANCE: OrderDatabase? = null

        private fun addOrderColumnIfMissing(db: SupportSQLiteDatabase, columnName: String, alterSql: String) {
            var exists = false
            db.query("PRAGMA table_info(`orders`)").use { cursor ->
                val nameIndex = cursor.getColumnIndex("name")
                while (cursor.moveToNext() && !exists) {
                    exists = cursor.getString(nameIndex) == columnName
                }
            }
            if (!exists) {
                db.execSQL(alterSql)
            }
        }

        private fun addVersion11Columns(db: SupportSQLiteDatabase) {
            addOrderColumnIfMissing(db, "pod_proof_type", "ALTER TABLE `orders` ADD COLUMN `pod_proof_type` TEXT")
            addOrderColumnIfMissing(db, "proof_synced_at", "ALTER TABLE `orders` ADD COLUMN `proof_synced_at` INTEGER")
            addOrderColumnIfMissing(db, "pickup_evidence_updated_at", "ALTER TABLE `orders` ADD COLUMN `pickup_evidence_updated_at` INTEGER")
        }

        private fun addVersion12Columns(db: SupportSQLiteDatabase) {
            addOrderColumnIfMissing(db, "package_count", "ALTER TABLE `orders` ADD COLUMN `package_count` INTEGER NOT NULL DEFAULT 1")
            addOrderColumnIfMissing(db, "service_max_packages_per_order", "ALTER TABLE `orders` ADD COLUMN `service_max_packages_per_order` INTEGER NOT NULL DEFAULT 1")
            addOrderColumnIfMissing(db, "service_max_active_orders_on_demand", "ALTER TABLE `orders` ADD COLUMN `service_max_active_orders_on_demand` INTEGER NOT NULL DEFAULT 1")
            addOrderColumnIfMissing(db, "service_face_verification_required", "ALTER TABLE `orders` ADD COLUMN `service_face_verification_required` INTEGER NOT NULL DEFAULT 1")
            addOrderColumnIfMissing(db, "service_proof_geofence_radius_m", "ALTER TABLE `orders` ADD COLUMN `service_proof_geofence_radius_m` INTEGER NOT NULL DEFAULT 10")
            addOrderColumnIfMissing(db, "service_failed_delivery_policy", "ALTER TABLE `orders` ADD COLUMN `service_failed_delivery_policy` TEXT NOT NULL DEFAULT 'must_deliver'")
        }

        private fun addVersion13Columns(db: SupportSQLiteDatabase) {
            addOrderColumnIfMissing(db, "packages", "ALTER TABLE `orders` ADD COLUMN `packages` TEXT NOT NULL DEFAULT '[]'")
            addOrderColumnIfMissing(db, "service_proof_min_accuracy_m", "ALTER TABLE `orders` ADD COLUMN `service_proof_min_accuracy_m` INTEGER NOT NULL DEFAULT 50")
        }

        /**
         * Version 14: Anti-Fake GPS telemetry columns on locations table.
         * Stores risk assessment data from FakeGpsDetector for each GPS sample.
         */
        private fun addLocationColumnIfMissing(db: SupportSQLiteDatabase, columnName: String, alterSql: String) {
            var exists = false
            db.query("PRAGMA table_info(`locations`)").use { cursor ->
                val nameIndex = cursor.getColumnIndex("name")
                while (cursor.moveToNext() && !exists) {
                    exists = cursor.getString(nameIndex) == columnName
                }
            }
            if (!exists) {
                db.execSQL(alterSql)
            }
        }

        private fun addVersion14LocationColumns(db: SupportSQLiteDatabase) {
            addLocationColumnIfMissing(db, "risk_score", "ALTER TABLE `locations` ADD COLUMN `risk_score` REAL NOT NULL DEFAULT 0")
            addLocationColumnIfMissing(db, "risk_level", "ALTER TABLE `locations` ADD COLUMN `risk_level` TEXT NOT NULL DEFAULT 'VALID'")
            addLocationColumnIfMissing(db, "developer_options", "ALTER TABLE `locations` ADD COLUMN `developer_options` INTEGER NOT NULL DEFAULT 0")
            addLocationColumnIfMissing(db, "fake_gps_apps", "ALTER TABLE `locations` ADD COLUMN `fake_gps_apps` TEXT NOT NULL DEFAULT ''")
            addLocationColumnIfMissing(db, "sensor_integrity", "ALTER TABLE `locations` ADD COLUMN `sensor_integrity` INTEGER NOT NULL DEFAULT 1")
        }

        private fun addVersion15Columns(db: SupportSQLiteDatabase) {
            addOrderColumnIfMissing(db, "tambal_ban_report", "ALTER TABLE `orders` ADD COLUMN `tambal_ban_report` TEXT")
            addOrderColumnIfMissing(db, "towing_report", "ALTER TABLE `orders` ADD COLUMN `towing_report` TEXT")
        }

        /**
         * Version 16: FB-077 driver tips — tip_amount_idr dari customer.
         */
        private fun addVersion16Columns(db: SupportSQLiteDatabase) {
            addOrderColumnIfMissing(db, "tip_amount_idr", "ALTER TABLE `orders` ADD COLUMN `tip_amount_idr` INTEGER NOT NULL DEFAULT 0")
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_order_id` ON `orders` (`order_id`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_status` ON `orders` (`status`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_needsSync` ON `orders` (`needsSync`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_needsScanSync` ON `orders` (`needsScanSync`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_orders_needsPodSync` ON `orders` (`needsPodSync`)")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `length` REAL")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `width` REAL")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `height` REAL")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `weight` REAL")
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `model` TEXT NOT NULL DEFAULT 'P2P'")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `leg_number` INTEGER NOT NULL DEFAULT 1")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `workflow_role` TEXT NOT NULL DEFAULT 'on_demand'")
            }
        }

        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `courier_payout_estimate_idr` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `customer_price_idr` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `platform_commission_idr` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `service_code` TEXT")
            }
        }

        val MIGRATION_6_7 = object : Migration(6, 7) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `dispatch_id` TEXT")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `offer_expires_at` INTEGER")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `offer_ttl_seconds` INTEGER")
            }
        }

        val MIGRATION_7_8 = object : Migration(7, 8) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `pickup_latitude` REAL")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `pickup_longitude` REAL")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `drop_latitude` REAL")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `drop_longitude` REAL")
            }
        }

        val MIGRATION_8_9 = object : Migration(8, 9) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `service_name` TEXT")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `service_category` TEXT")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `service_family` TEXT")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `service_route_model` TEXT")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `service_max_eta_minutes` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `item_description` TEXT")
            }
        }

        val MIGRATION_9_10 = object : Migration(9, 10) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `pickup_scan_verified` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `orders` ADD COLUMN `pickup_photo_verified` INTEGER NOT NULL DEFAULT 0")
            }
        }

        val MIGRATION_10_11 = object : Migration(10, 11) {
            override fun migrate(db: SupportSQLiteDatabase) {
                addVersion11Columns(db)
            }
        }

        val MIGRATION_11_12 = object : Migration(11, 12) {
            override fun migrate(db: SupportSQLiteDatabase) {
                addVersion12Columns(db)
            }
        }

        val MIGRATION_12_13 = object : Migration(12, 13) {
            override fun migrate(db: SupportSQLiteDatabase) {
                addVersion13Columns(db)
            }
        }

        val MIGRATION_13_14 = object : Migration(13, 14) {
            override fun migrate(db: SupportSQLiteDatabase) {
                addVersion14LocationColumns(db)
            }
        }

        val MIGRATION_14_15 = object : Migration(14, 15) {
            override fun migrate(db: SupportSQLiteDatabase) {
                addVersion15Columns(db)
            }
        }

        val MIGRATION_15_16 = object : Migration(15, 16) {
            override fun migrate(db: SupportSQLiteDatabase) {
                addVersion16Columns(db)
            }
        }

        val MIGRATION_10_13 = object : Migration(10, 13) {
            override fun migrate(db: SupportSQLiteDatabase) {
                addVersion11Columns(db)
                addVersion12Columns(db)
                addVersion13Columns(db)
            }
        }

        val MIGRATION_11_13 = object : Migration(11, 13) {
            override fun migrate(db: SupportSQLiteDatabase) {
                addVersion12Columns(db)
                addVersion13Columns(db)
            }
        }

        val ALL_MIGRATIONS = arrayOf(
            MIGRATION_2_3,
            MIGRATION_3_4,
            MIGRATION_4_5,
            MIGRATION_5_6,
            MIGRATION_6_7,
            MIGRATION_7_8,
            MIGRATION_8_9,
            MIGRATION_9_10,
            MIGRATION_10_11,
            MIGRATION_11_12,
            MIGRATION_12_13,
            MIGRATION_13_14,
            MIGRATION_14_15,
            MIGRATION_15_16,
            MIGRATION_10_13,
            MIGRATION_11_13
        )

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
                    .addMigrations(*ALL_MIGRATIONS)
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
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    @TypeConverter
    fun packagesToString(packages: List<CourierOrderPackage>): String {
        return json.encodeToString(ListSerializer(CourierOrderPackage.serializer()), packages)
    }

    @TypeConverter
    fun stringToPackages(value: String?): List<CourierOrderPackage> {
        if (value.isNullOrBlank()) return emptyList()
        return runCatching {
            json.decodeFromString(ListSerializer(CourierOrderPackage.serializer()), value)
        }.getOrElse { emptyList() }
    }

    @TypeConverter
    fun tambalBanReportToString(report: TambalBanReport?): String? {
        if (report == null) return null
        return json.encodeToString(TambalBanReport.serializer(), report)
    }

    @TypeConverter
    fun stringToTambalBanReport(value: String?): TambalBanReport? {
        if (value.isNullOrBlank()) return null
        return runCatching {
            json.decodeFromString(TambalBanReport.serializer(), value)
        }.getOrNull()
    }

    @TypeConverter
    fun towingReportToString(report: TowingReport?): String? {
        if (report == null) return null
        return json.encodeToString(TowingReport.serializer(), report)
    }

    @TypeConverter
    fun stringToTowingReport(value: String?): TowingReport? {
        if (value.isNullOrBlank()) return null
        return runCatching {
            json.decodeFromString(TowingReport.serializer(), value)
        }.getOrNull()
    }
}
