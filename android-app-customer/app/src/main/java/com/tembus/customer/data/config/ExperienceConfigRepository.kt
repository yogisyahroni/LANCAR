package com.tembus.customer.data.config

import android.content.Context
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.config.model.ExperienceConfigSource
import com.tembus.customer.data.config.model.ExperienceManifest
import com.tembus.customer.data.config.model.ExperienceManifestValidator
import com.tembus.customer.data.localization.LocaleManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ExperienceConfigRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: ExperienceConfigApi,
    private val store: ExperienceConfigStore,
    private val localeManager: LocaleManager,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = false
        coerceInputValues = true
    }

    private val scopePreferences by lazy {
        context.getSharedPreferences(SCOPE_PREFERENCES, Context.MODE_PRIVATE)
    }

    suspend fun currentScope(userId: String? = null): ExperienceConfigScope {
        val languageCode = localeManager.getLanguageCode()
        val locale = localeManager.fromCode(languageCode).languageTag
        val assignment = store.readTargetingAssignment(userId)
        return ExperienceConfigScope(
            marketCode = scopePreferences.getString(KEY_MARKET_CODE, ExperienceManifestValidator.DEFAULT_MARKET_CODE)
                ?.trim()?.lowercase().takeUnless { it.isNullOrBlank() }
                ?: ExperienceManifestValidator.DEFAULT_MARKET_CODE,
            locale = locale,
            appVersion = BuildConfig.VERSION_NAME,
            cohort = assignment?.cohort,
            experimentRef = assignment?.experimentRef,
        )
    }

    suspend fun loadLastKnownGood(scope: ExperienceConfigScope): ExperienceConfigSnapshot {
        val cached = store.readCachedManifest()
        val manifest = cachedManifestFor(cached, scope)
        return if (manifest != null && cached != null) {
            ExperienceConfigSnapshot(manifest, ExperienceConfigSource.LAST_KNOWN_GOOD, cached.storedAtMillis)
        } else {
            ExperienceConfigSnapshot(
                manifest = ExperienceManifestValidator.packagedDefault(scope),
                source = ExperienceConfigSource.PACKAGED_DEFAULT,
                loadedAtMillis = System.currentTimeMillis(),
            )
        }
    }

    suspend fun refresh(scope: ExperienceConfigScope): ExperienceConfigSnapshot {
        val cached = store.readCachedManifest()
        val cachedManifest = cachedManifestFor(cached, scope)
        val cachedSnapshot = if (cachedManifest != null && cached != null) {
            ExperienceConfigSnapshot(cachedManifest, ExperienceConfigSource.LAST_KNOWN_GOOD, cached.storedAtMillis)
        } else {
            ExperienceConfigSnapshot(
                ExperienceManifestValidator.packagedDefault(scope),
                ExperienceConfigSource.PACKAGED_DEFAULT,
                System.currentTimeMillis(),
            )
        }

        if (cachedManifest != null && cached != null && isFresh(cachedManifest, cached.storedAtMillis)) {
            return cachedSnapshot
        }

        val result = runCatching {
            withTimeout(NETWORK_TIMEOUT_MILLIS) {
                api.fetch(scope, cached?.takeIf { it.scopeKey == scope.cacheKey }?.etag)
            }
        }.getOrElse { ExperienceConfigFetchResult.Failed(it.javaClass.simpleName) }

        return when (result) {
            is ExperienceConfigFetchResult.NotModified -> {
                if (cachedManifest != null && cached != null) {
                    store.touchManifest(System.currentTimeMillis())
                    cachedSnapshot.copy(loadedAtMillis = System.currentTimeMillis())
                } else {
                    cachedSnapshot
                }
            }
            is ExperienceConfigFetchResult.Updated -> {
                val sanitized = ExperienceManifestValidator.sanitize(result.manifest, scope)
                if (sanitized == null) {
                    cachedSnapshot
                } else {
                    val assetBundleKey = runCatching {
                        withTimeout(NETWORK_TIMEOUT_MILLIS) {
                            store.stageAssetsAtomically(
                                manifestId = sanitized.manifestId,
                                revision = sanitized.revision,
                                assets = sanitized.assetReferences,
                            )
                        }
                    }.getOrNull()
                    if (assetBundleKey == null) {
                        cachedSnapshot
                    } else {
                        val storedAt = System.currentTimeMillis()
                        val etag = result.etag?.takeIf { it.isNotBlank() } ?: "\"${sanitized.checksum}\""
                        store.writeManifestAtomically(
                            manifestJson = json.encodeToString(ExperienceManifest.serializer(), sanitized),
                            scopeKey = scope.cacheKey,
                            etag = etag,
                            revision = sanitized.revision,
                            storedAtMillis = storedAt,
                            assetBundleKey = assetBundleKey,
                        )
                        ExperienceConfigSnapshot(sanitized, ExperienceConfigSource.NETWORK, storedAt)
                    }
                }
            }
            is ExperienceConfigFetchResult.Failed -> cachedSnapshot
        }
    }

    suspend fun clearUserTargetingAssignment() {
        store.clearUserTargetingAssignment()
    }

    suspend fun saveUserTargetingAssignment(userId: String, cohort: String?, experimentRef: String?) {
        store.saveTargetingAssignment(userId, cohort, experimentRef)
    }

    fun setMarketCode(marketCode: String) {
        val normalized = marketCode.trim().lowercase()
        if (normalized.isBlank() || !normalized.matches(Regex("^[a-z0-9][a-z0-9_-]{1,31}$"))) return
        scopePreferences.edit().putString(KEY_MARKET_CODE, normalized).apply()
    }

    private fun decodeAndValidate(rawJson: String, scope: ExperienceConfigScope): ExperienceManifest? =
        runCatching {
            val manifest = json.decodeFromString(ExperienceManifest.serializer(), rawJson)
            ExperienceManifestValidator.sanitize(manifest, scope)
        }.getOrNull()

    private fun cachedManifestFor(
        cached: CachedExperienceManifest?,
        scope: ExperienceConfigScope,
    ): ExperienceManifest? {
        if (cached == null || cached.scopeKey != scope.cacheKey) return null
        if (!store.isAssetBundleAvailable(cached.assetBundleKey)) return null
        return decodeAndValidate(cached.manifestJson, scope)
    }

    private fun isFresh(manifest: ExperienceManifest, storedAtMillis: Long): Boolean {
        val ttlMillis = manifest.ttlSeconds.coerceIn(0, MAX_TTL_SECONDS) * 1_000L
        return ttlMillis > 0 && System.currentTimeMillis() - storedAtMillis < ttlMillis
    }

    companion object {
        private const val SCOPE_PREFERENCES = "experience_scope"
        private const val KEY_MARKET_CODE = "market_code"
        private const val NETWORK_TIMEOUT_MILLIS = 10_000L
        private const val MAX_TTL_SECONDS = 86_400
    }
}
