package com.lancar.courier.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import com.lancar.courier.data.model.Location
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for Location entity
 * 
 * Provides CRUD operations for GPS location data with sync support.
 */
@Dao
interface LocationDao {
    
    /**
     * Insert a new location
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLocation(location: Location): Long
    
    /**
     * Insert multiple locations
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLocations(locations: List<Location>)
    
    /**
     * Update location sync status
     */
    @Update
    suspend fun updateLocation(location: Location)
    
    /**
     * Get all unsynced locations for a courier
     */
    @Query("SELECT * FROM locations WHERE is_synced = 0 ORDER BY timestamp ASC LIMIT :limit")
    suspend fun getUnsyncedLocations(limit: Int = 100): List<Location>
    
    /**
     * Get count of unsynced locations
     */
    @Query("SELECT COUNT(*) FROM locations WHERE is_synced = 0")
    fun getUnsyncedCount(): Flow<Int>
    
    /**
     * Mark locations as synced
     */
    @Query("UPDATE locations SET is_synced = 1 WHERE id IN (:ids)")
    suspend fun markAsSynced(ids: List<Long>)
    
    /**
     * Get latest location for a courier
     */
    @Query("SELECT * FROM locations WHERE courier_id = :courierId ORDER BY timestamp DESC LIMIT 1")
    suspend fun getLatestLocation(courierId: String): Location?
    
    /**
     * Get latest location as Flow for UI updates
     */
    @Query("SELECT * FROM locations WHERE courier_id = :courierId ORDER BY timestamp DESC LIMIT 1")
    fun getLatestLocationFlow(courierId: String): Flow<Location?>
    
    /**
     * Get locations within a time range
     */
    @Query("SELECT * FROM locations WHERE courier_id = :courierId AND timestamp BETWEEN :startTime AND :endTime ORDER BY timestamp ASC")
    suspend fun getLocationsInRange(courierId: String, startTime: Long, endTime: Long): List<Location>
    
    /**
     * Get locations for today
     */
    @Query("SELECT * FROM locations WHERE courier_id = :courierId AND timestamp >= :todayStart ORDER BY timestamp ASC")
    suspend fun getTodayLocations(courierId: String, todayStart: Long): List<Location>
    
    /**
     * Delete old locations (cleanup)
     * Keep locations for 7 days
     */
    @Query("DELETE FROM locations WHERE timestamp < :cutoffTime AND is_synced = 1")
    suspend fun deleteOldLocations(cutoffTime: Long)
    
    /**
     * Delete all locations for a courier
     */
    @Query("DELETE FROM locations WHERE courier_id = :courierId")
    suspend fun deleteAllForCourier(courierId: String)
    
    /**
     * Increment sync attempts for locations
     */
    @Query("UPDATE locations SET sync_attempts = sync_attempts + 1 WHERE id IN (:ids)")
    suspend fun incrementSyncAttempts(ids: List<Long>)
    
    /**
     * Reset sync attempts after successful sync
     */
    @Query("UPDATE locations SET sync_attempts = 0 WHERE id IN (:ids)")
    suspend fun resetSyncAttempts(ids: List<Long>)
    
    /**
     * Get locations that have failed to sync too many times
     */
    @Query("SELECT * FROM locations WHERE sync_attempts >= :maxAttempts")
    suspend fun getFailedLocations(maxAttempts: Int = 5): List<Location>
}
