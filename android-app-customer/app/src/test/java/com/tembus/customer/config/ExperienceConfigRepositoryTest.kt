package com.tembus.customer.config

import android.content.Context
import com.tembus.customer.data.config.CachedExperienceManifest
import com.tembus.customer.data.config.ExperienceConfigApi
import com.tembus.customer.data.config.ExperienceConfigFetchResult
import com.tembus.customer.data.config.ExperienceConfigRepository
import com.tembus.customer.data.config.ExperienceConfigStore
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceConfigSource
import com.tembus.customer.data.config.model.ExperienceManifest
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.runs
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class ExperienceConfigRepositoryTest {
    private val scope = ExperienceConfigScope(
        marketCode = "id-jk",
        locale = "id-ID",
        appVersion = "1.5.0",
    )

    @Test
    fun freshLkgSkipsNetworkRefresh() = runTest {
        val manifest = manifest(ttlSeconds = 300)
        val store = mockk<ExperienceConfigStore>()
        coEvery { store.readCachedManifest() } returns cached(manifest, storedAtMillis = System.currentTimeMillis())
        every { store.isAssetBundleAvailable("packaged") } returns true
        val api = mockk<ExperienceConfigApi>()
        val repository = repository(api, store)

        val snapshot = repository.refresh(scope)

        assertEquals(ExperienceConfigSource.LAST_KNOWN_GOOD, snapshot.source)
        assertEquals(manifest.manifestId, snapshot.manifest.manifestId)
        coVerify(exactly = 0) { api.fetch(any(), any()) }
    }

    @Test
    fun expiredLkgSendsEtagAndPublishesNetworkRevisionAfterStaging() = runTest {
        val oldManifest = manifest(manifestId = "old-manifest", revision = 1, ttlSeconds = 1)
        val newManifest = manifest(manifestId = "new-manifest", revision = 2, ttlSeconds = 300)
        val store = mockk<ExperienceConfigStore>()
        coEvery { store.readCachedManifest() } returns cached(
            oldManifest,
            storedAtMillis = System.currentTimeMillis() - 10_000,
            etag = "\"${oldManifest.checksum}\"",
        )
        every { store.isAssetBundleAvailable(any()) } returns true
        coEvery { store.stageAssetsAtomically(any(), any(), any()) } returns "packaged"
        coEvery { store.writeManifestAtomically(any(), any(), any(), any(), any(), any()) } just runs
        val api = mockk<ExperienceConfigApi>()
        coEvery { api.fetch(scope, "\"${oldManifest.checksum}\"") } returns
            ExperienceConfigFetchResult.Updated(newManifest, "\"${newManifest.checksum}\"")
        val repository = repository(api, store)

        val snapshot = repository.refresh(scope)

        assertEquals(ExperienceConfigSource.NETWORK, snapshot.source)
        assertEquals("new-manifest", snapshot.manifest.manifestId)
        coVerify(exactly = 1) { api.fetch(scope, "\"${oldManifest.checksum}\"") }
        coVerify(exactly = 1) { store.stageAssetsAtomically("new-manifest", 2, any()) }
        coVerify(exactly = 1) { store.writeManifestAtomically(any(), scope.cacheKey, "\"${newManifest.checksum}\"", 2, any(), "packaged") }
    }

    @Test
    fun failedAssetStageKeepsPreviousLkgAndDoesNotWriteNewManifest() = runTest {
        val oldManifest = manifest(manifestId = "old-manifest", revision = 1, ttlSeconds = 1)
        val newManifest = manifest(
            manifestId = "new-manifest",
            revision = 2,
            ttlSeconds = 300,
            assetReferences = listOf(
                com.tembus.customer.data.config.model.ExperienceAssetReference(
                    assetId = "hero-image",
                    uri = "https://cdn.example.test/hero.webp",
                    kind = "image",
                    checksum = "b".repeat(64),
                ),
            ),
        )
        val store = mockk<ExperienceConfigStore>()
        coEvery { store.readCachedManifest() } returns cached(
            oldManifest,
            storedAtMillis = System.currentTimeMillis() - 10_000,
        )
        every { store.isAssetBundleAvailable(any()) } returns true
        coEvery { store.stageAssetsAtomically(any(), any(), any()) } returns null
        val api = mockk<ExperienceConfigApi>()
        coEvery { api.fetch(any(), any()) } returns ExperienceConfigFetchResult.Updated(newManifest, null)
        val repository = repository(api, store)

        val snapshot = repository.refresh(scope)

        assertEquals(ExperienceConfigSource.LAST_KNOWN_GOOD, snapshot.source)
        assertEquals("old-manifest", snapshot.manifest.manifestId)
        coVerify(exactly = 0) { store.writeManifestAtomically(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun audienceChangeDoesNotReuseAnotherCohortsCachedManifest() = runTest {
        val betaScope = scope.copy(cohort = "beta")
        val controlScope = scope.copy(cohort = "control")
        val betaManifest = manifest(manifestId = "beta-manifest", revision = 1, ttlSeconds = 300)
        val store = mockk<ExperienceConfigStore>()
        coEvery { store.readCachedManifest() } returns cached(
            betaManifest,
            storedAtMillis = System.currentTimeMillis(),
        ).copy(scopeKey = betaScope.cacheKey)
        every { store.isAssetBundleAvailable(any()) } returns true
        val api = mockk<ExperienceConfigApi>()
        coEvery { api.fetch(controlScope, null) } returns ExperienceConfigFetchResult.Failed("offline")
        val repository = repository(api, store)

        val snapshot = repository.refresh(controlScope)

        assertEquals(ExperienceConfigSource.PACKAGED_DEFAULT, snapshot.source)
        coVerify(exactly = 1) { api.fetch(controlScope, null) }
    }

    @Test
    fun corruptedCachedEtagFallsBackToPackagedDefault() = runTest {
        val cachedManifest = manifest(ttlSeconds = 1)
        val store = mockk<ExperienceConfigStore>()
        coEvery { store.readCachedManifest() } returns cached(cachedManifest, System.currentTimeMillis(), "\"${"b".repeat(64)}\"")
        every { store.isAssetBundleAvailable(any()) } returns true
        val api = mockk<ExperienceConfigApi>()
        coEvery { api.fetch(scope, null) } returns ExperienceConfigFetchResult.Failed("offline")
        val repository = repository(api, store)

        val snapshot = repository.refresh(scope)

        assertEquals(ExperienceConfigSource.PACKAGED_DEFAULT, snapshot.source)
        coVerify(exactly = 1) { api.fetch(scope, null) }
    }

    private fun repository(
        api: ExperienceConfigApi,
        store: ExperienceConfigStore,
    ) = ExperienceConfigRepository(
        context = mockk<Context>(relaxed = true),
        api = api,
        store = store,
        localeManager = mockk(relaxed = true),
    )

    private fun cached(
        manifest: ExperienceManifest,
        storedAtMillis: Long,
        etag: String? = null,
    ) = CachedExperienceManifest(
        manifestJson = Json.encodeToString(ExperienceManifest.serializer(), manifest),
        scopeKey = scope.cacheKey,
        etag = etag,
        revision = manifest.revision,
        storedAtMillis = storedAtMillis,
        assetBundleKey = "packaged",
    )

    private fun manifest(
        manifestId: String = "manifest-1",
        revision: Int = 1,
        ttlSeconds: Int = 300,
        assetReferences: List<com.tembus.customer.data.config.model.ExperienceAssetReference> = emptyList(),
    ) = ExperienceManifest(
        manifestId = manifestId,
        schemaVersion = 1,
        revision = revision,
        marketCode = scope.marketCode,
        locale = scope.locale,
        surface = scope.surface,
        minAppVersion = "1.0.0",
        startsAt = Instant.now().minusSeconds(60).toString(),
        ttlSeconds = ttlSeconds,
        cachePolicy = "private",
        assetReferences = assetReferences,
        checksum = "a".repeat(64),
    )
}
