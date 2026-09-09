package com.tembus.customer.data.config

import android.content.Context
import com.tembus.customer.BuildConfig
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.config.model.ExperienceConfigSource
import com.tembus.customer.data.config.model.ExperienceManifest
import com.tembus.customer.data.config.model.ExperienceManifestValidator
import com.tembus.customer.data.config.model.ExperienceAssetReference
import com.tembus.customer.data.localization.LocaleManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ExperienceConfigRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val api: ExperienceConfigApi,
    private val store: ExperienceConfigStore,
    private val localeManager: LocaleManager,
    private val experienceBannerAnalytics: ExperienceBannerAnalytics,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = false
        coerceInputValues = true
    }

    private val scopePreferences by lazy {
        context.getSharedPreferences(SCOPE_PREFERENCES, Context.MODE_PRIVATE)
    }

    private val telemetryScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

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
            ExperienceConfigSnapshot(
                manifest = manifest,
                source = ExperienceConfigSource.LAST_KNOWN_GOOD,
                loadedAtMillis = cached.storedAtMillis,
                scope = scope,
                assetBundleKey = cached.assetBundleKey,
            )
        } else {
            ExperienceConfigSnapshot(
                manifest = ExperienceManifestValidator.packagedDefault(scope),
                source = ExperienceConfigSource.PACKAGED_DEFAULT,
                loadedAtMillis = System.currentTimeMillis(),
                scope = scope,
                assetBundleKey = "packaged",
            )
        }
    }

    suspend fun refresh(
        scope: ExperienceConfigScope,
        forceNetwork: Boolean = false,
    ): ExperienceConfigSnapshot {
        val cached = store.readCachedManifest()
        val cachedManifest = cachedManifestFor(cached, scope)
        val cachedSnapshot = if (cachedManifest != null && cached != null) {
            ExperienceConfigSnapshot(
                manifest = cachedManifest,
                source = ExperienceConfigSource.LAST_KNOWN_GOOD,
                loadedAtMillis = cached.storedAtMillis,
                scope = scope,
                assetBundleKey = cached.assetBundleKey,
            )
        } else {
            ExperienceConfigSnapshot(
                manifest = ExperienceManifestValidator.packagedDefault(scope),
                source = ExperienceConfigSource.PACKAGED_DEFAULT,
                loadedAtMillis = System.currentTimeMillis(),
                scope = scope,
                assetBundleKey = "packaged",
            )
        }

        if (!forceNetwork && cachedManifest != null && cached != null && isFresh(cachedManifest, cached.storedAtMillis)) {
            reportTelemetry(
                type = ExperienceBannerEventType.MANIFEST_CACHE_HIT,
                snapshot = cachedSnapshot,
                scope = scope,
                cacheHit = true,
            )
            return cachedSnapshot
        }

        val fetchStartedAt = System.nanoTime()
        val result = runCatching {
            withTimeout(NETWORK_TIMEOUT_MILLIS) {
                api.fetch(scope, cached?.takeIf { it.scopeKey == scope.cacheKey && cachedManifest != null }?.etag)
            }
        }.getOrElse { ExperienceConfigFetchResult.Failed(it.javaClass.simpleName) }
        val fetchLatencyMs = ((System.nanoTime() - fetchStartedAt) / 1_000_000L).coerceAtLeast(0L)

        return when (result) {
            is ExperienceConfigFetchResult.NotModified -> {
                reportTelemetry(
                    type = ExperienceBannerEventType.MANIFEST_FETCH_SUCCESS,
                    snapshot = cachedSnapshot,
                    scope = scope,
                    latencyMs = fetchLatencyMs,
                    cacheHit = true,
                )
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
                    reportTelemetry(
                        type = ExperienceBannerEventType.MANIFEST_FETCH_FAILURE,
                        snapshot = cachedSnapshot,
                        scope = scope,
                        latencyMs = fetchLatencyMs,
                        errorCode = "manifest_validation_failed",
                    )
                    reportTelemetry(
                        type = ExperienceBannerEventType.MANIFEST_PARSE_FAILURE,
                        snapshot = cachedSnapshot,
                        scope = scope,
                        latencyMs = fetchLatencyMs,
                        errorCode = "manifest_validation_failed",
                    )
                    reportTelemetry(
                        type = ExperienceBannerEventType.MANIFEST_SCHEMA_FALLBACK,
                        snapshot = cachedSnapshot,
                        scope = scope,
                        latencyMs = fetchLatencyMs,
                        errorCode = "manifest_validation_failed",
                    )
                    cachedSnapshot
                } else {
                    val assetBundleKey = runCatching {
                        withTimeout(NETWORK_TIMEOUT_MILLIS) {
                            store.stageAssetsAtomically(
                                manifestId = sanitized.manifestId,
                                revision = sanitized.revision,
                                assets = ExperienceAssetPrefetchPolicy.eligibleAssets(sanitized),
                            )
                        }
                    }.getOrNull()
                    if (assetBundleKey == null) {
                        reportTelemetry(
                            type = ExperienceBannerEventType.MANIFEST_FETCH_FAILURE,
                            snapshot = cachedSnapshot,
                            scope = scope,
                            latencyMs = fetchLatencyMs,
                            errorCode = "asset_stage_failed",
                        )
                        reportTelemetry(
                            type = ExperienceBannerEventType.ASSET_BROKEN,
                            snapshot = cachedSnapshot,
                            scope = scope,
                            latencyMs = fetchLatencyMs,
                            errorCode = "asset_stage_failed",
                        )
                        reportTelemetry(
                            type = ExperienceBannerEventType.MANIFEST_SCHEMA_FALLBACK,
                            snapshot = cachedSnapshot,
                            scope = scope,
                            latencyMs = fetchLatencyMs,
                            errorCode = "asset_stage_failed",
                        )
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
                        val snapshot = ExperienceConfigSnapshot(
                            manifest = sanitized,
                            source = ExperienceConfigSource.NETWORK,
                            loadedAtMillis = storedAt,
                            scope = scope,
                            assetBundleKey = assetBundleKey,
                        )
                        reportTelemetry(
                            type = ExperienceBannerEventType.MANIFEST_FETCH_SUCCESS,
                            snapshot = snapshot,
                            scope = scope,
                            latencyMs = fetchLatencyMs,
                            cacheHit = false,
                        )
                        snapshot
                    }
                }
            }
            is ExperienceConfigFetchResult.Failed -> {
                reportTelemetry(
                    type = ExperienceBannerEventType.MANIFEST_FETCH_FAILURE,
                    snapshot = cachedSnapshot,
                    scope = scope,
                    latencyMs = fetchLatencyMs,
                    errorCode = result.reason,
                )
                if (result.reason.startsWith("manifest_", ignoreCase = true)
                    || result.reason.contains("parse", ignoreCase = true)
                    || result.reason.contains("checksum", ignoreCase = true)
                    || result.reason.contains("etag", ignoreCase = true)
                ) {
                    reportTelemetry(
                        type = ExperienceBannerEventType.MANIFEST_PARSE_FAILURE,
                        snapshot = cachedSnapshot,
                        scope = scope,
                        latencyMs = fetchLatencyMs,
                        errorCode = result.reason,
                    )
                }
                if (cachedManifest == null) {
                    reportTelemetry(
                        type = ExperienceBannerEventType.MANIFEST_SCHEMA_FALLBACK,
                        snapshot = cachedSnapshot,
                        scope = scope,
                        latencyMs = fetchLatencyMs,
                        errorCode = result.reason,
                    )
                }
                if (!result.reason.startsWith("manifest_", ignoreCase = true)
                    || result.reason.matches(Regex("manifest_http_5\\d\\d"))
                ) {
                    reportTelemetry(
                        type = ExperienceBannerEventType.NETWORK_REGRESSION,
                        snapshot = cachedSnapshot,
                        scope = scope,
                        latencyMs = fetchLatencyMs,
                        errorCode = result.reason,
                    )
                }
                cachedSnapshot
            }
        }
    }

    private fun reportTelemetry(
        type: ExperienceBannerEventType,
        snapshot: ExperienceConfigSnapshot,
        scope: ExperienceConfigScope,
        latencyMs: Long? = null,
        cacheHit: Boolean? = null,
        errorCode: String? = null,
    ) {
        telemetryScope.launch {
            experienceBannerAnalytics.record(
                ExperienceBannerEvent(
                    type = type,
                    component = "manifest",
                    campaignId = "runtime",
                    sectionId = "runtime",
                    manifestRevision = snapshot.manifest.revision.coerceAtLeast(0),
                    marketCode = scope.marketCode,
                    manifestId = snapshot.manifest.manifestId.takeIf { it.isNotBlank() && it != "packaged-default" },
                    latencyMs = latencyMs,
                    cacheHit = cacheHit,
                    errorCode = errorCode,
                ),
            )
        }
    }

    suspend fun clearUserTargetingAssignment() {
        store.clearUserTargetingAssignment()
    }

    suspend fun saveUserTargetingAssignment(userId: String, cohort: String?, experimentRef: String?) {
        store.saveTargetingAssignment(userId, cohort, experimentRef)
    }

    suspend fun resolveAssetPath(
        snapshot: ExperienceConfigSnapshot,
        assetId: String,
    ): String? {
        val reference = snapshot.manifest.assetReferences.firstOrNull { it.assetId == assetId }
            ?: return null
        val fallback = reference.fallbackAssetId?.let { fallbackId ->
            snapshot.manifest.assetReferences.firstOrNull { it.assetId == fallbackId }
        }
        return store.resolveAssetPath(snapshot.assetBundleKey, reference, fallback)
    }

    fun setMarketCode(marketCode: String) {
        val normalized = marketCode.trim().lowercase()
        if (normalized.isBlank() || !normalized.matches(Regex("^[a-z0-9][a-z0-9_-]{1,31}$"))) return
        scopePreferences.edit().putString(KEY_MARKET_CODE, normalized).apply()
    }

    private fun decodeAndValidate(rawJson: String, scope: ExperienceConfigScope): ExperienceManifest? =
        runCatching {
            if (rawJson.toByteArray(Charsets.UTF_8).size > ExperienceManifestValidator.MAX_MANIFEST_BYTES) return@runCatching null
            val manifest = json.decodeFromString(ExperienceManifest.serializer(), rawJson)
            ExperienceManifestValidator.sanitize(manifest, scope)
        }.getOrNull()

    private fun cachedManifestFor(
        cached: CachedExperienceManifest?,
        scope: ExperienceConfigScope,
    ): ExperienceManifest? {
        if (cached == null || cached.scopeKey != scope.cacheKey) return null
        if (!store.isAssetBundleAvailable(cached.assetBundleKey)) return null
        val manifest = decodeAndValidate(cached.manifestJson, scope) ?: return null
        if (cached.revision != manifest.revision) return null
        val cachedEtag = cached.etag?.trim()?.removePrefix("W/")?.trim()
        if (cachedEtag != null && (cachedEtag.length < 2 || cachedEtag.first() != '"' || cachedEtag.last() != '"')) return null
        if (cachedEtag != null && cachedEtag.substring(1, cachedEtag.length - 1).lowercase() != manifest.checksum.lowercase()) return null
        return manifest
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
