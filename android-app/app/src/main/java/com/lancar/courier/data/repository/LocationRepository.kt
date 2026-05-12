package com.lancar.courier.data.repository

import android.content.Context
import com.lancar.courier.data.api.LANCARApiService
import com.lancar.courier.data.db.LocationDao
import com.lancar.courier.data.model.Location
import com.lancar.courier.data.model.LocationData
import com.lancar.courier.data.model.LocationRequest
import java.util.Date
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

/**
 * Location Repository
 *
 * Manages GPS location data storage and synchronization with backend.
 * Handles both local persistence and remote API calls.
 */
@Singleton
class LocationRepository @Inject constructor(
    private val locationDao: LocationDao,
    private val apiService: LANCARApiService
) {

    /**
     * Get all unsynced locations as Flow
     */
    fun getUnsyncedCount(): Flow<Int> = locationDao.getUnsyncedCount()

    /**
     * Get latest location for a courier as Flow
     */
    fun getLatestLocationFlow(courierId: String): Flow<Location?> =
        locationDao.getLatestLocationFlow(courierId)

    /**
     * Insert a new location into local database
     */
    suspend fun insertLocation(location: Location): Long {
        return locationDao.insertLocation(location)
    }

    /**
     * Insert multiple locations
     */
    suspend fun insertLocations(locations: List<Location>) {
        locationDao.insertLocations(locations)
    }

    /**
     * Get unsynced locations for sync
     */
    suspend fun getUnsyncedLocations(limit: Int = 100): List<Location> {
        return locationDao.getUnsyncedLocations(limit)
    }

    /**
     * Mark locations as synced after successful API call
     */
    suspend fun markLocationsAsSynced(ids: List<Long>) {
        locationDao.markAsSynced(ids)
    }

    /**
     * Get latest location from database
     */
    suspend fun getLatestLocation(courierId: String): Location? {
        return locationDao.getLatestLocation(courierId)
    }

    /**
     * Sync pending locations to backend
     * Returns list of synced location IDs
     */
    suspend fun syncLocations(authToken: String, courierId: String, deviceId: String): Result<List<Long>> {
        return try {
            val unsynced = locationDao.getUnsyncedLocations(100)

            if (unsynced.isEmpty()) {
                return Result.success(emptyList())
            }

            val locationDataList = unsynced.map { location ->
                LocationData(
                    latitude = location.latitude,
                    longitude = location.longitude,
                    accuracy = location.accuracy,
                    speed = location.speed,
                    bearing = location.bearing,
                    altitude = location.altitude,
                    timestamp = location.timestamp,
                    batteryLevel = location.batteryLevel,
                    networkType = location.networkType,
                    orderId = location.orderId
                )
            }

            val request = LocationRequest(
                courierId = courierId,
                locations = locationDataList,
                deviceId = deviceId
            )

            val response = apiService.syncLocations(request)
            if (response.isSuccessful && response.body()?.success == true) {
                val syncedIds = unsynced.map { it.id }
                locationDao.markAsSynced(syncedIds)
                Result.success(syncedIds)
            } else {
                Result.failure(Exception("Location sync failed: ${response.message()}"))
            }
        } catch (e: Exception) {
            // Increment sync attempts for failed locations
            val unsynced = locationDao.getUnsyncedLocations(100)
            locationDao.incrementSyncAttempts(unsynced.map { it.id })
            Result.failure(e)
        }
    }

    /**
     * Clean up old synced locations (keep 7 days)
     */
    suspend fun cleanupOldLocations() {
        val sevenDaysAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000)
        locationDao.deleteOldLocations(sevenDaysAgo)
    }

    /**
     * Delete all locations for a courier (on logout)
     */
    suspend fun deleteAllLocations(courierId: String) {
        locationDao.deleteAllForCourier(courierId)
    }

    /**
     * Get location history for a date range
     */
    suspend fun getLocationHistory(
        courierId: String,
        startTime: Long,
        endTime: Long
    ): List<Location> {
        return locationDao.getLocationsInRange(courierId, startTime, endTime)
    }

    /**
     * Get today's location history
     */
    suspend fun getTodayLocations(courierId: String): List<Location> {
        val todayStart = System.currentTimeMillis() - (System.currentTimeMillis() % (24 * 60 * 60 * 1000))
        return locationDao.getTodayLocations(courierId, todayStart)
    }
}