package com.tembus.customer.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import kotlinx.serialization.Serializable

@Entity(
    tableName = "locations",
    indices = [
        Index(value = ["courier_id"]),
        Index(value = ["timestamp"]),
        Index(value = ["is_synced"])
    ]
)
@Serializable
data class Location(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "courier_id")
    val courierId: String,

    @ColumnInfo(name = "latitude")
    val latitude: Double,

    @ColumnInfo(name = "longitude")
    val longitude: Double,

    @ColumnInfo(name = "accuracy")
    val accuracy: Float = 0f,

    @ColumnInfo(name = "speed")
    val speed: Float = 0f,

    @ColumnInfo(name = "bearing")
    val bearing: Float = 0f,

    @ColumnInfo(name = "altitude")
    val altitude: Double = 0.0,

    @ColumnInfo(name = "timestamp")
    val timestamp: Long = System.currentTimeMillis(),

    @ColumnInfo(name = "is_synced")
    val isSynced: Boolean = false,

    @ColumnInfo(name = "sync_attempts")
    val syncAttempts: Int = 0,

    @ColumnInfo(name = "order_id")
    val orderId: String? = null,

    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis()
)
