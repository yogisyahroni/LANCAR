package com.tembus.customer.data.config

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

private val Context.startupCampaignDataStore by preferencesDataStore(name = "startup_campaign")

data class StartupCampaignRecord(
    val userId: String,
    val campaignId: String,
    val impressions: Int,
    val lastImpressionAtMillis: Long,
    val dismissed: Boolean,
)

/** Persists only campaign delivery state; campaign content remains server-owned. */
@Singleton
class StartupCampaignStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private object Keys {
        val userId = stringPreferencesKey("user_id")
        val campaignId = stringPreferencesKey("campaign_id")
        val impressions = intPreferencesKey("impressions")
        val lastImpressionAtMillis = longPreferencesKey("last_impression_at_millis")
        val dismissed = booleanPreferencesKey("dismissed")
    }

    suspend fun read(userId: String): StartupCampaignRecord? {
        val normalizedUserId = userId.trim()
        if (normalizedUserId.isBlank()) return null
        val preferences = context.startupCampaignDataStore.data.first()
        val storedUserId = preferences[Keys.userId]
        val campaignId = preferences[Keys.campaignId]
        if (storedUserId != normalizedUserId || campaignId.isNullOrBlank()) return null
        return StartupCampaignRecord(
            userId = normalizedUserId,
            campaignId = campaignId,
            impressions = (preferences[Keys.impressions] ?: 0).coerceAtLeast(0),
            lastImpressionAtMillis = (preferences[Keys.lastImpressionAtMillis] ?: 0L).coerceAtLeast(0L),
            dismissed = preferences[Keys.dismissed] ?: false,
        )
    }

    suspend fun recordImpression(userId: String, campaignId: String, nowMillis: Long) {
        val normalizedUserId = userId.trim()
        val normalizedCampaignId = campaignId.trim()
        if (normalizedUserId.isBlank() || normalizedCampaignId.isBlank()) return
        context.startupCampaignDataStore.edit { preferences ->
            val sameCampaign = preferences[Keys.userId] == normalizedUserId &&
                preferences[Keys.campaignId] == normalizedCampaignId
            preferences[Keys.userId] = normalizedUserId
            preferences[Keys.campaignId] = normalizedCampaignId
            preferences[Keys.impressions] = if (sameCampaign) {
                (preferences[Keys.impressions] ?: 0).coerceAtLeast(0).plus(1)
            } else {
                1
            }
            preferences[Keys.lastImpressionAtMillis] = nowMillis.coerceAtLeast(0L)
            if (!sameCampaign) preferences[Keys.dismissed] = false
        }
    }

    suspend fun dismiss(userId: String, campaignId: String) {
        val normalizedUserId = userId.trim()
        val normalizedCampaignId = campaignId.trim()
        if (normalizedUserId.isBlank() || normalizedCampaignId.isBlank()) return
        context.startupCampaignDataStore.edit { preferences ->
            val sameCampaign = preferences[Keys.userId] == normalizedUserId &&
                preferences[Keys.campaignId] == normalizedCampaignId
            preferences[Keys.userId] = normalizedUserId
            preferences[Keys.campaignId] = normalizedCampaignId
            if (!sameCampaign) preferences[Keys.impressions] = 0
            preferences[Keys.dismissed] = true
        }
    }

    suspend fun clear() {
        context.startupCampaignDataStore.edit { it.clear() }
    }
}
