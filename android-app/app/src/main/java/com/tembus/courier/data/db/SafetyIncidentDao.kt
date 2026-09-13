package com.tembus.courier.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.tembus.courier.data.model.SafetyIncidentDraft

@Dao
interface SafetyIncidentDao {
    @Query("SELECT * FROM safety_incident_drafts WHERE synced_at IS NULL AND attempts < 5 ORDER BY created_at ASC")
    suspend fun getPending(): List<SafetyIncidentDraft>

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun enqueue(draft: SafetyIncidentDraft): Long

    @Query("UPDATE safety_incident_drafts SET synced_at = :syncedAt, last_error = NULL WHERE local_id = :localId")
    suspend fun markSynced(localId: String, syncedAt: Long = System.currentTimeMillis())

    @Query("UPDATE safety_incident_drafts SET attempts = attempts + 1, last_error = :error WHERE local_id = :localId")
    suspend fun markAttempt(localId: String, error: String)

    @Query("SELECT COUNT(*) FROM safety_incident_drafts WHERE synced_at IS NULL")
    suspend fun getUnresolvedCount(): Int
}
