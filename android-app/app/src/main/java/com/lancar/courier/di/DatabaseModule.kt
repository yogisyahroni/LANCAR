package com.lancar.courier.di

import android.content.Context
import androidx.room.Room
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.lancar.courier.data.db.LocationDao
import com.lancar.courier.data.db.OrderDao
import com.lancar.courier.data.db.OrderDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import net.sqlcipher.database.SQLiteDatabase
import net.sqlcipher.database.SupportFactory
import java.io.File
import java.util.UUID
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    private fun getOrCreateDatabasePassphrase(context: Context): ByteArray {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        val prefs = EncryptedSharedPreferences.create(
            context,
            "tembus_secure_db_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

        // 🛡️ CRASH PREVENTION: Wipe existing plaintext test database on first upgrade to encrypted build
        val dbFile = context.getDatabasePath("order_database")
        val isFirstCrypt = !prefs.getBoolean("is_db_encrypted", false)
        if (isFirstCrypt) {
            if (dbFile.exists()) {
                dbFile.delete()
                context.getDatabasePath("order_database-shm").delete()
                context.getDatabasePath("order_database-wal").delete()
            }
            prefs.edit().putBoolean("is_db_encrypted", true).apply()
        }

        var passphraseStr = prefs.getString("db_passphrase", null)
        if (passphraseStr == null) {
            passphraseStr = UUID.randomUUID().toString()
            prefs.edit().putString("db_passphrase", passphraseStr).apply()
        }
        
        return SQLiteDatabase.getBytes(passphraseStr.toCharArray())
    }

    @Provides
    @Singleton
    fun provideOrderDatabase(
        @ApplicationContext context: Context
    ): OrderDatabase {
        val passphrase = getOrCreateDatabasePassphrase(context)
        val factory = SupportFactory(passphrase)

        return Room.databaseBuilder(
            context,
            OrderDatabase::class.java,
            "order_database"
        )
            .openHelperFactory(factory) // 🔒 Enforce on-disk AES-256 SQLCipher Encryption
            .addMigrations(
                OrderDatabase.MIGRATION_2_3,
                OrderDatabase.MIGRATION_3_4,
                OrderDatabase.MIGRATION_4_5,
                OrderDatabase.MIGRATION_5_6,
                OrderDatabase.MIGRATION_6_7,
                OrderDatabase.MIGRATION_7_8,
                OrderDatabase.MIGRATION_8_9,
                OrderDatabase.MIGRATION_9_10
            )
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
