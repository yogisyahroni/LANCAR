package com.tembus.customer.data.config

import android.content.Context
import android.graphics.BitmapFactory
import android.net.ConnectivityManager
import android.util.Log
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
        val remoteAssets = assets.filterNot { it.uri.startsWith("/assets/") }
        if (remoteAssets.isEmpty()) return@withContext "packaged"
        val root = File(context.filesDir, "experience-assets")
        if (!root.exists() && !root.mkdirs()) return@withContext null
        val protectedBundleKeys = setOfNotNull(
            context.experienceConfigDataStore.data.first()[Keys.assetBundleKey],
        )
        cleanupAssetCache(root, protectedBundleKeys)
        val preferFallback = preferFallbackForCurrentNetwork()
        val assetsById = assets.associateBy { it.assetId }
        val selectedAssets = remoteAssets.mapNotNull { asset ->
            val fallback = asset.fallbackAssetId?.let(assetsById::get)
            when {
                preferFallback && fallback != null -> fallback
                preferFallback -> null
                else -> asset
            }
        }.distinctBy { it.assetId }
        if (selectedAssets.isEmpty()) return@withContext "packaged"

        val bundleKey = "${manifestId.take(24)}-$revision-${if (preferFallback) "lite" else "full"}"
        val committed = File(root, bundleKey)
        if (committed.isDirectory) return@withContext bundleKey
        val staging = File(root, ".staging-${UUID.randomUUID()}")
        if (!staging.mkdirs()) return@withContext null
        try {
            remoteAssets.forEach { asset ->
                val fallback = asset.fallbackAssetId?.let(assetsById::get)
                val selected = if (preferFallback) fallback else asset
                if (selected == null) return@forEach
                try {
                    downloadAsset(selected, staging)
                } catch (primaryFailure: Exception) {
                    if (preferFallback || fallback == null) throw primaryFailure
                    downloadAsset(fallback, staging)
                }
            }
            File(staging, RETENTION_MARKER).writeText(
                retentionUntilFor(assets, System.currentTimeMillis()).toString(),
                Charsets.UTF_8,
            )
            if (committed.exists()) committed.deleteRecursively()
            if (!staging.renameTo(committed)) throw IllegalStateException("asset_bundle_atomic_rename_failed")
            committed.setLastModified(System.currentTimeMillis())
            bundleKey
        } catch (error: Exception) {
            Log.w(TAG, "Experience asset staging failed manifest=$manifestId revision=$revision reason=${error.javaClass.simpleName}")
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
        return bundleDirectory(bundleKey)?.isDirectory == true
    }

    /**
     * Returns a local-only asset path after verifying presence, size and the
     * manifest checksum. No network request is made by this method.
     */
    suspend fun resolveAssetPath(
        bundleKey: String?,
        asset: com.tembus.customer.data.config.model.ExperienceAssetReference,
        fallback: com.tembus.customer.data.config.model.ExperienceAssetReference? = null,
    ): String? = withContext(Dispatchers.IO) {
        if (isExpired(asset)) return@withContext null
        val preferFallback = preferFallbackForCurrentNetwork()
        val preferred = if (preferFallback) fallback else asset
        resolveAssetDirect(bundleKey, preferred)?.let { return@withContext it }
        if (preferred != fallback) resolveAssetDirect(bundleKey, fallback) else null
    }

    private fun resolveAssetDirect(
        bundleKey: String?,
        asset: com.tembus.customer.data.config.model.ExperienceAssetReference?,
    ): String? {
        if (asset == null || !isSafeAssetId(asset.assetId) || isExpired(asset)) return null
        if (asset.uri.startsWith("/assets/")) {
            val packagedPath = asset.uri.removePrefix("/assets/")
            if (packagedPath.isBlank() || packagedPath.contains("..") || packagedPath.contains("//")) return null
            return verifyAssetStream(
                open = { context.assets.open(packagedPath) },
                asset = asset,
            ).takeIf { it == true }?.let { "file:///android_asset/$packagedPath" }
        }

        val bundle = bundleDirectory(bundleKey) ?: return null
        val file = File(bundle, asset.assetId)
        if (!file.isFile) return null
        return verifyAssetFile(file, asset).takeIf { it }?.let { file.absolutePath }
    }

    private fun downloadAsset(
        asset: com.tembus.customer.data.config.model.ExperienceAssetReference,
        staging: File,
    ) {
        if (asset.uri.startsWith("/assets/")) return
        val request = Request.Builder().url(asset.uri).get().build()
        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) throw IllegalStateException("asset_http_${response.code}")
            val body = response.body ?: throw IllegalStateException("asset_body_missing")
            val maxBytes = asset.sizeLimitBytes.coerceIn(1L, MAX_ASSET_BYTES)
            if (body.contentLength() > maxBytes) throw IllegalStateException("asset_too_large")
            val contentType = body.contentType()?.toString()?.substringBefore(';')?.trim()?.lowercase()
            if (!ExperienceAssetDeliveryPolicy.contentTypeMatches(asset.kind, asset.contentType, contentType)) {
                throw IllegalStateException("asset_content_type_mismatch")
            }
            val partial = File(staging, "${asset.assetId}.partial")
            try {
                body.byteStream().use { input ->
                    partial.outputStream().use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var total = 0L
                        while (true) {
                            val count = input.read(buffer)
                            if (count < 0) break
                            total += count
                            if (total > maxBytes) throw IllegalStateException("asset_too_large")
                            output.write(buffer, 0, count)
                        }
                    }
                }
                if (!verifyAssetFile(partial, asset)) throw IllegalStateException("asset_integrity_mismatch")
                val target = File(staging, asset.assetId)
                if (!partial.renameTo(target)) throw IllegalStateException("asset_atomic_rename_failed")
            } finally {
                if (partial.exists()) partial.delete()
            }
        }
    }

    private fun bundleDirectory(bundleKey: String?): File? {
        if (bundleKey.isNullOrBlank() || !bundleKey.matches(SAFE_BUNDLE_KEY)) return null
        val root = File(context.filesDir, "experience-assets").canonicalFile
        val candidate = File(root, bundleKey).canonicalFile
        return candidate.takeIf { it.parentFile == root }
    }

    private fun verifyAssetStream(
        open: () -> java.io.InputStream,
        asset: com.tembus.customer.data.config.model.ExperienceAssetReference,
    ): Boolean? = runCatching {
        val digest = MessageDigest.getInstance("SHA-256")
        var total = 0L
        val maxBytes = asset.sizeLimitBytes.coerceIn(1L, MAX_ASSET_BYTES)
        open().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (!ExperienceAssetDeliveryPolicy.withinByteLimit(total, maxBytes)) return@runCatching false
                digest.update(buffer, 0, count)
            }
        }
        digest.digest().toHex().equals(asset.checksum, ignoreCase = true)
    }.getOrNull()

    private fun verifyAssetFile(
        file: File,
        asset: com.tembus.customer.data.config.model.ExperienceAssetReference,
    ): Boolean {
        if (!file.isFile || !ExperienceAssetDeliveryPolicy.withinByteLimit(file.length(), asset.sizeLimitBytes)) return false
        val verified = verifyAssetStream({ file.inputStream() }, asset) == true
        if (!verified || asset.width == null || asset.height == null || asset.kind == "video") return verified
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, options)
        if (options.outWidth <= 0 || options.outHeight <= 0) return false
        return ExperienceAssetDeliveryPolicy.dimensionsMatch(
            width = options.outWidth,
            height = options.outHeight,
            expectedWidth = asset.width,
            expectedHeight = asset.height,
            expectedAspectRatio = asset.aspectRatio,
        )
    }

    private fun preferFallbackForCurrentNetwork(): Boolean {
        val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        val dataSaverEnabled = connectivity.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
        return ExperienceAssetPrefetchPolicy.shouldPreferFallback(connectivity.isActiveNetworkMetered, dataSaverEnabled)
    }

    private fun isExpired(asset: com.tembus.customer.data.config.model.ExperienceAssetReference): Boolean =
        asset.expiresAt?.let { expiresAt -> runCatching { java.time.Instant.parse(expiresAt).toEpochMilli() <= System.currentTimeMillis() }.getOrDefault(true) } == true

    private fun cleanupAssetCache(root: File, protectedBundleKeys: Set<String>) {
        val now = System.currentTimeMillis()
        val entries = root.listFiles().orEmpty()
        entries.filter { it.isDirectory && it.name.startsWith(".staging-") }
            .filter { now - it.lastModified() > STAGING_RETENTION_MILLIS }
            .forEach { it.deleteRecursively() }

        val bundles = root.listFiles().orEmpty().filter { it.isDirectory && !it.name.startsWith(".") }
        bundles.filter { it.name !in protectedBundleKeys && now >= retentionUntilFor(it) }
            .forEach { it.deleteRecursively() }

        var totalBytes = bundles.filter { it.exists() }.sumOf(::directorySize)
        if (totalBytes <= MAX_ASSET_CACHE_BYTES) return
        bundles.filter { it.exists() && it.name !in protectedBundleKeys }
            .sortedBy(File::lastModified)
            .forEach { bundle ->
                if (totalBytes <= MAX_ASSET_CACHE_BYTES) return@forEach
                val size = directorySize(bundle)
                if (bundle.deleteRecursively()) totalBytes -= size
            }
    }

    private fun directorySize(directory: File): Long = directory.walkTopDown().filter(File::isFile).sumOf(File::length)

    private fun retentionUntilFor(
        assets: List<com.tembus.customer.data.config.model.ExperienceAssetReference>,
        nowMillis: Long,
    ): Long = assets.mapNotNull { asset ->
        asset.retentionUntil?.let { runCatching { java.time.Instant.parse(it).toEpochMilli() }.getOrNull() }
    }.maxOrNull() ?: (nowMillis + ASSET_RETENTION_MILLIS)

    private fun retentionUntilFor(bundle: File): Long =
        File(bundle, RETENTION_MARKER).takeIf(File::isFile)?.readText()?.trim()?.toLongOrNull()
            ?: (bundle.lastModified() + ASSET_RETENTION_MILLIS)

    private fun isSafeAssetId(value: String): Boolean = value.matches(SAFE_ASSET_ID)

    private companion object {
        const val TAG = "ExperienceAssetStore"
        val SAFE_BUNDLE_KEY = Regex("^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$")
        val SAFE_ASSET_ID = Regex("^[a-z0-9][a-z0-9._-]{0,127}$")
        const val MAX_ASSET_BYTES = ExperienceAssetDeliveryPolicy.MAX_ASSET_BYTES
        const val MAX_ASSET_CACHE_BYTES = 50L * 1024L * 1024L
        const val ASSET_RETENTION_MILLIS = 30L * 24L * 60L * 60L * 1000L
        const val STAGING_RETENTION_MILLIS = 24L * 60L * 60L * 1000L
        const val RETENTION_MARKER = ".retention_until"
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

}
