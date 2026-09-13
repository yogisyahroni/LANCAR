package com.tembus.courier.data.model

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Minimal courier safety report captured locally when the network is down.
 * The payload intentionally excludes photos and unnecessary counterparty data;
 * the server remains authoritative after the idempotent replay succeeds.
 */
@Entity(
    tableName = "safety_incident_drafts",
    indices = [
        Index(value = ["synced_at"]),
        Index(value = ["order_id"]),
    ],
)
data class SafetyIncidentDraft(
    @PrimaryKey
    @ColumnInfo(name = "local_id")
    val localId: String,
    @ColumnInfo(name = "order_id")
    val orderId: String?,
    @ColumnInfo(name = "event_type")
    val eventType: String,
    @ColumnInfo(name = "reason_code")
    val reasonCode: String?,
    val severity: String,
    val latitude: Double?,
    val longitude: Double?,
    val accuracy: Float?,
    val message: String?,
    @ColumnInfo(name = "idempotency_key")
    val idempotencyKey: String,
    @ColumnInfo(name = "created_at")
    val createdAt: Long,
    val attempts: Int = 0,
    @ColumnInfo(name = "last_error")
    val lastError: String? = null,
    @ColumnInfo(name = "synced_at")
    val syncedAt: Long? = null,
)
