package com.tembus.customer.config

import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceManifest
import com.tembus.customer.data.config.model.ExperienceManifestValidator
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class ExperienceConfigManagerTest {
    private val scope = ExperienceConfigScope(
        marketCode = "id-jk",
        locale = "id-ID",
        appVersion = "1.5.0",
    )

    @Test
    fun validManifestIsScopedAndUnknownPresentationPropertiesAreDropped() {
        val sanitized = ExperienceManifestValidator.sanitize(
            manifest = manifest(
                sections = listOf(
                    section(
                        component = "hero_banner",
                        properties = buildJsonObject {
                            put("title", "Welcome")
                            put("unknown_property", "must not reach renderer")
                            put("payment", "must never be configurable")
                        },
                    ),
                ),
            ),
            scope = scope,
            nowMillis = Instant.now().toEpochMilli(),
        )

        assertNotNull(sanitized)
        val properties = requireNotNull(sanitized).sections.single().properties
        assertEquals("Welcome", properties["title"]?.toString()?.trim('"'))
        assertTrue("unknown_property" !in properties)
        assertTrue("payment" !in properties)
    }

    @Test
    fun unsupportedSchemaAndUnknownOnlyComponentsFallBack() {
        assertNull(
            ExperienceManifestValidator.sanitize(
                manifest(schemaVersion = 99),
                scope,
                Instant.now().toEpochMilli(),
            ),
        )
        assertNull(
            ExperienceManifestValidator.sanitize(
                manifest(sections = listOf(section(component = "arbitrary_webview"))),
                scope,
                Instant.now().toEpochMilli(),
            ),
        )
    }

    @Test
    fun marketLocaleSurfaceAndVersionScopeAreEnforced() {
        assertNull(ExperienceManifestValidator.sanitize(manifest(marketCode = "id-bdg"), scope))
        assertNull(ExperienceManifestValidator.sanitize(manifest(locale = "en-US"), scope))
        assertNull(ExperienceManifestValidator.sanitize(manifest(surface = "merchant_android"), scope))
        assertNull(ExperienceManifestValidator.sanitize(manifest(minAppVersion = "2.0.0"), scope))
        assertNotNull(ExperienceManifestValidator.sanitize(manifest(maxAppVersion = "1.5.0"), scope))
    }

    @Test
    fun versionComparisonAndPackagedDefaultAreDeterministic() {
        assertTrue(ExperienceManifestValidator.compareVersions("1.10.0", "1.2.0") > 0)
        assertTrue(ExperienceManifestValidator.compareVersions("1.0.0", "1.0.1") < 0)
        val fallback = ExperienceManifestValidator.packagedDefault(scope)
        assertEquals("packaged-default", fallback.manifestId)
        assertEquals(0, fallback.revision)
        assertTrue(fallback.sections.isEmpty())
    }

    private fun manifest(
        schemaVersion: Int = 1,
        marketCode: String = "id-jk",
        locale: String = "id-ID",
        surface: String = "customer_android",
        minAppVersion: String = "1.0.0",
        maxAppVersion: String? = null,
        sections: List<com.tembus.customer.data.config.model.ExperienceSection> = listOf(section()),
    ) = ExperienceManifest(
        manifestId = "11111111-1111-4111-8111-111111111111",
        schemaVersion = schemaVersion,
        revision = 1,
        marketCode = marketCode,
        locale = locale,
        surface = surface,
        minAppVersion = minAppVersion,
        maxAppVersion = maxAppVersion,
        startsAt = Instant.now().minusSeconds(60).toString(),
        ttlSeconds = 300,
        cachePolicy = "private",
        sections = sections,
        checksum = "a".repeat(64),
    )

    private fun section(
        component: String = "hero_banner",
        properties: kotlinx.serialization.json.JsonObject = buildJsonObject { put("title", "Welcome") },
    ) = com.tembus.customer.data.config.model.ExperienceSection(
        id = "hero",
        component = component,
        properties = properties,
    )
}
