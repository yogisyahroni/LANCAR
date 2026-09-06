package com.tembus.courier.data.repository

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ServiceReportProofDraftStore @Inject constructor(
    @ApplicationContext context: Context
) {
    private val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveBeforePhotoUrl(orderId: String, serviceType: String, url: String) {
        preferences.edit().putString(beforePhotoKey(orderId, serviceType), url).apply()
    }

    fun getBeforePhotoUrl(orderId: String, serviceType: String): String? {
        return preferences.getString(beforePhotoKey(orderId, serviceType), null)
            ?.takeIf { it.isNotBlank() }
    }

    fun clearBeforePhotoUrl(orderId: String, serviceType: String) {
        preferences.edit().remove(beforePhotoKey(orderId, serviceType)).apply()
    }

    fun saveProofUrl(orderId: String, serviceType: String, proofType: String, url: String) {
        preferences.edit().putString(proofKey(orderId, serviceType, proofType), url).apply()
    }

    fun getProofUrl(orderId: String, serviceType: String, proofType: String): String? {
        return preferences.getString(proofKey(orderId, serviceType, proofType), null)
            ?.takeIf { it.isNotBlank() }
    }

    fun clearProofUrl(orderId: String, serviceType: String, proofType: String) {
        preferences.edit().remove(proofKey(orderId, serviceType, proofType)).apply()
    }

    fun saveServiceStartedAtMillis(orderId: String, serviceType: String, value: Long) {
        preferences.edit().putLong(startedAtKey(orderId, serviceType), value).apply()
    }

    fun getServiceStartedAtMillis(orderId: String, serviceType: String): Long? {
        val key = startedAtKey(orderId, serviceType)
        if (!preferences.contains(key)) return null
        return preferences.getLong(key, 0L).takeIf { it > 0L }
    }

    fun saveTireDamageType(orderId: String, value: String) {
        val normalized = value.trim()
        if (normalized.isBlank()) {
            preferences.edit().remove(tireDamageKey(orderId)).apply()
        } else {
            preferences.edit().putString(tireDamageKey(orderId), normalized).apply()
        }
    }

    fun getTireDamageType(orderId: String): String? {
        return preferences.getString(tireDamageKey(orderId), null)?.takeIf { it.isNotBlank() }
    }

    fun saveMaterialsUsed(orderId: String, values: List<String>) {
        val normalized = values.map(String::trim).filter(String::isNotBlank).distinct().toSet()
        preferences.edit().putStringSet(materialsKey(orderId), normalized).apply()
    }

    fun getMaterialsUsed(orderId: String): List<String> {
        return preferences.getStringSet(materialsKey(orderId), emptySet()).orEmpty().toList().sorted()
    }

    fun clearTambalBanStructuredDraft(orderId: String) {
        preferences.edit()
            .remove(startedAtKey(orderId, "tambal_ban"))
            .remove(tireDamageKey(orderId))
            .remove(materialsKey(orderId))
            .apply()
    }

    private fun beforePhotoKey(orderId: String, serviceType: String): String {
        return "before_photo_${serviceType}_$orderId"
    }

    private fun proofKey(orderId: String, serviceType: String, proofType: String): String {
        return "proof_${proofType}_${serviceType}_$orderId"
    }

    private fun startedAtKey(orderId: String, serviceType: String): String {
        return "started_at_${serviceType}_$orderId"
    }

    private fun tireDamageKey(orderId: String): String {
        return "tire_damage_$orderId"
    }

    private fun materialsKey(orderId: String): String {
        return "materials_tambal_ban_$orderId"
    }

    private companion object {
        const val PREFS_NAME = "service_report_proof_drafts"
    }
}
