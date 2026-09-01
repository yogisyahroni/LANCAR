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

    private fun beforePhotoKey(orderId: String, serviceType: String): String {
        return "before_photo_${serviceType}_$orderId"
    }

    private fun proofKey(orderId: String, serviceType: String, proofType: String): String {
        return "proof_${proofType}_${serviceType}_$orderId"
    }

    private companion object {
        const val PREFS_NAME = "service_report_proof_drafts"
    }
}
