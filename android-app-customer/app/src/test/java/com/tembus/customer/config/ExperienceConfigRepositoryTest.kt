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
            etag = "\"old-etag\"",
        )
        every { store.isAssetBundleAvailable(any()) } returns true
        coEvery { store.stageAssetsAtomically(any(), any(), any()) } returns "packaged"
        coEvery { store.writeManifestAtomically(any(), any(), any(), any(), any(), any()) } just runs
        val api = mockk<ExperienceConfigApi>()
        coEvery { api.fetch(scope, "\"old-etag\"") } returns
            ExperienceConfigFetchResult.Updated(newManifest, "\"new-etag\"")
        val repository = repository(api, store)

        val snapshot = repository.refresh(scope)

        assertEquals(ExperienceConfigSource.NETWORK, snapshot.source)
        assertEquals("new-manifest", snapshot.manifest.manifestId)
        coVerify(exactly = 1) { api.fetch(scope, "\"old-etag\"") }
        coVerify(exactly = 1) { store.stageAssetsAtomically("new-manifest", 2, any()) }
        coVerify(exactly = 1) { store.writeManifestAtomically(any(), scope.cacheKey, "\"new-etag\"", 2, any(), "packaged") }
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
