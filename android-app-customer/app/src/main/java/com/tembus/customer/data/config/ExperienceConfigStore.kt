package com.tembus.customer.data.config

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val Context.experienceConfigDataStore by preferencesDataStore(name = "experience_config")

data class CachedExperienceManifest(
    val manifestJson: String,
    val scopeKey: String,
    val etag: String?,
    val revision: Int,
    val storedAtMillis: Long,
    val assetBundleKey: String?,
)

data class StoredTargetingAssignment(
    val userId: String,
    val cohort: String?,
    val experimentRef: String?,
)

@Singleton
class ExperienceConfigStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val httpClient: OkHttpClient,
) {
    private object Keys {
        val manifestJson = stringPreferencesKey("manifest_json")
        val scopeKey = stringPreferencesKey("scope_key")
        val etag = stringPreferencesKey("etag")
        val revision = intPreferencesKey("revision")
        val storedAtMillis = longPreferencesKey("stored_at_millis")
        val assetBundleKey = stringPreferencesKey("asset_bundle_key")
        val assignmentUserId = stringPreferencesKey("assignment_user_id")
        val assignmentCohort = stringPreferencesKey("assignment_cohort")
        val assignmentExperimentRef = stringPreferencesKey("assignment_experiment_ref")
    }

    suspend fun readCachedManifest(): CachedExperienceManifest? {
        val preferences = context.experienceConfigDataStore.data.first()
        val json = preferences[Keys.manifestJson] ?: return null
        val scopeKey = preferences[Keys.scopeKey] ?: return null
        val storedAt = preferences[Keys.storedAtMillis] ?: return null
        return CachedExperienceManifest(
            manifestJson = json,
            scopeKey = scopeKey,
            etag = preferences[Keys.etag],
            revision = preferences[Keys.revision] ?: 0,
            storedAtMillis = storedAt,
            assetBundleKey = preferences[Keys.assetBundleKey],
        )
    }

    /**
     * DataStore edit commits the complete envelope atomically. The repository
     * only calls this after parsing, scope validation and asset-reference
     * validation have succeeded, so a partial network response can never
     * replace the last-known-good revision.
     */
    suspend fun writeManifestAtomically(
        manifestJson: String,
        scopeKey: String,
        etag: String?,
        revision: Int,
        storedAtMillis: Long,
        assetBundleKey: String?,
    ) {
        context.experienceConfigDataStore.edit { preferences ->
            preferences[Keys.manifestJson] = manifestJson
            preferences[Keys.scopeKey] = scopeKey
            preferences[Keys.revision] = revision
            preferences[Keys.storedAtMillis] = storedAtMillis
            if (assetBundleKey.isNullOrBlank()) preferences.remove(Keys.assetBundleKey) else preferences[Keys.assetBundleKey] = assetBundleKey
            if (etag.isNullOrBlank()) preferences.remove(Keys.etag) else preferences[Keys.etag] = etag
        }
    }

    /**
     * Download all remote assets into an isolated staging directory. The
     * caller only publishes the manifest after this function returns a bundle
     * key, so a failed/partial asset download can never become LKG state.
     */
    suspend fun stageAssetsAtomically(
        manifestId: String,
        revision: Int,
        assets: List<com.tembus.customer.data.config.model.ExperienceAssetReference>,
    ): String? = withContext(Dispatchers.IO) {
        if (assets.isEmpty()) return@withContext "packaged"
        val root = File(context.filesDir, "experience-assets")
        if (!root.exists() && !root.mkdirs()) return@withContext null
        val bundleKey = "${manifestId.take(24)}-$revision"
        val committed = File(root, bundleKey)
        if (committed.isDirectory) return@withContext bundleKey
        val staging = File(root, ".staging-${UUID.randomUUID()}")
        if (!staging.mkdirs()) return@withContext null
        try {
            assets.forEach { asset ->
                if (asset.uri.startsWith("/assets/")) return@forEach
                val request = Request.Builder().url(asset.uri).get().build()
                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) throw IllegalStateException("asset_http_${response.code}")
                    val body = response.body ?: throw IllegalStateException("asset_body_missing")
                    if (body.contentLength() > MAX_ASSET_BYTES) throw IllegalStateException("asset_too_large")
                    val bytes = body.bytes()
                    if (bytes.size > MAX_ASSET_BYTES) throw IllegalStateException("asset_too_large")
                    val digest = MessageDigest.getInstance("SHA-256").digest(bytes).toHex()
                    if (!digest.equals(asset.checksum, ignoreCase = true)) throw IllegalStateException("asset_checksum_mismatch")
                    val partial = File(staging, "${asset.assetId}.partial")
                    val target = File(staging, asset.assetId)
                    partial.outputStream().use { it.write(bytes) }
                    if (!partial.renameTo(target)) throw IllegalStateException("asset_atomic_rename_failed")
                }
            }
            if (committed.exists()) committed.deleteRecursively()
            if (!staging.renameTo(committed)) throw IllegalStateException("asset_bundle_atomic_rename_failed")
            bundleKey
        } catch (_: Exception) {
            staging.deleteRecursively()
            null
        }
    }

    suspend fun touchManifest(storedAtMillis: Long) {
        context.experienceConfigDataStore.edit { preferences ->
            if (preferences[Keys.manifestJson] != null) preferences[Keys.storedAtMillis] = storedAtMillis
        }
    }

    fun isAssetBundleAvailable(bundleKey: String?): Boolean {
        if (bundleKey == "packaged") return true
        return !bundleKey.isNullOrBlank() && File(context.filesDir, "experience-assets/$bundleKey").isDirectory
    }

    suspend fun readTargetingAssignment(userId: String?): StoredTargetingAssignment? {
        val normalizedUserId = userId?.trim().orEmpty()
        if (normalizedUserId.isBlank()) return null
        val preferences = context.experienceConfigDataStore.data.first()
        if (preferences[Keys.assignmentUserId] != normalizedUserId) {
            // A persisted assignment from another account is never returned
            // and is removed once the new account identity is known.
            clearUserTargetingAssignment()
            return null
        }
        return StoredTargetingAssignment(
            userId = normalizedUserId,
            cohort = preferences[Keys.assignmentCohort],
            experimentRef = preferences[Keys.assignmentExperimentRef],
        )
    }

    suspend fun saveTargetingAssignment(
        userId: String,
        cohort: String?,
        experimentRef: String?,
    ) {
        val normalizedUserId = userId.trim()
        if (normalizedUserId.isBlank()) return
        context.experienceConfigDataStore.edit { preferences ->
            preferences[Keys.assignmentUserId] = normalizedUserId
            if (cohort.isNullOrBlank()) preferences.remove(Keys.assignmentCohort) else preferences[Keys.assignmentCohort] = cohort
            if (experimentRef.isNullOrBlank()) preferences.remove(Keys.assignmentExperimentRef) else preferences[Keys.assignmentExperimentRef] = experimentRef
        }
    }

    suspend fun clearUserTargetingAssignment() {
        context.experienceConfigDataStore.edit { preferences ->
            preferences.remove(Keys.assignmentUserId)
            preferences.remove(Keys.assignmentCohort)
            preferences.remove(Keys.assignmentExperimentRef)
        }
    }

    private fun ByteArray.toHex(): String = joinToString("") { byte -> "%02x".format(byte) }

    private companion object {
        const val MAX_ASSET_BYTES = 5 * 1024 * 1024
    }
}
