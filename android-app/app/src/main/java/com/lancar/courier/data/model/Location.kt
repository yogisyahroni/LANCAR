package com.lancar.courier.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Location Entity for real-time GPS tracking
 * 
 * Stores GPS coordinates with timestamps for courier location tracking.
 * Used for real-time tracking and historical location data.
 */
@Entity(tableName = "locations")
data class Location(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    
    @SerializedName("latitude")
    val latitude: Double,
    
    @SerializedName("longitude")
    val longitude: Double,
    
    @SerializedName("accuracy")
    val accuracy: Float,
    
    @SerializedName("speed")
    val speed: Float,
    
    @SerializedName("bearing")
    val bearing: Float,
    
    @SerializedName("altitude")
    val altitude: Double,
    
    @SerializedName("timestamp")
    val timestamp: Long,
    
    @SerializedName("courier_id")
    val courierId: String,
    
    @SerializedName("device_id")
    val deviceId: String,
    
    @SerializedName("battery_level")
    val batteryLevel: Int,
    
    @SerializedName("network_type")
    val networkType: String,
    
    @SerializedName("is_synced")
    val isSynced: Boolean = false,
    
    @SerializedName("sync_attempts")
    val syncAttempts: Int = 0
) {
    /**
     * Get formatted timestamp for display
     */
    fun getFormattedTime(): String {
        val dateTime = LocalDateTime.ofInstant(
            Instant.ofEpochMilli(timestamp),
            ZoneId.systemDefault()
        )
        return dateTime.format(DateTimeFormatter.ofPattern("HH:mm:ss"))
    }
    
    /**
     * Get formatted date for display
     */
    fun getFormattedDate(): String {
        val dateTime = LocalDateTime.ofInstant(
            Instant.ofEpochMilli(timestamp),
            ZoneId.systemDefault()
        )
        return dateTime.format(DateTimeFormatter.ofPattern("yyyy-MM-dd"))
    }
    
    /**
     * Check if location is recent (within last 5 minutes)
     */
    fun isRecent(): Boolean {
        val currentTime = System.currentTimeMillis()
        return (currentTime - timestamp) < 5 * 60 * 1000
    }
}

/**
 * Location Request for sending to backend
 */
data class LocationRequest(
    @SerializedName("courier_id")
    val courierId: String,
    
    @SerializedName("locations")
    val locations: List<LocationData>,
    
    @SerializedName("device_id")
    val deviceId: String,
    
    @SerializedName("timestamp")
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * Location Data for API transmission
 */
data class LocationData(
    @SerializedName("latitude")
    val latitude: Double,
    
    @SerializedName("longitude")
    val longitude: Double,
    
    @SerializedName("accuracy")
    val accuracy: Float,
    
    @SerializedName("speed")
    val speed: Float,
    
    @SerializedName("bearing")
    val bearing: Float,
    
    @SerializedName("altitude")
    val altitude: Double,
    
    @SerializedName("timestamp")
    val timestamp: Long,
    
    @SerializedName("battery_level")
    val batteryLevel: Int,
    
    @SerializedName("network_type")
    val networkType: String
)

/**
 * Location Response from backend
 */
data class LocationResponse(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("message")
    val message: String?,
    
    @SerializedName("synced_count")
    val syncedCount: Int
)
