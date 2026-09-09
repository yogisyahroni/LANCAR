package com.tembus.customer.config

import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.data.config.model.ExperienceSection
import com.tembus.customer.ui.experience.collectRenderableSections
import com.tembus.customer.ui.experience.isDynamicComponentSupported
import com.tembus.customer.ui.experience.resolveDynamicServices
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DynamicHomeRendererTest {
    private val json = Json {}

    @Test
    fun rendererOnlyAcceptsCompiledComponentWhitelist() {
        assertTrue(isDynamicComponentSupported("service_grid"))
        assertTrue(isDynamicComponentSupported("notice"))
        assertFalse(isDynamicComponentSupported("custom_html"))
    }

    @Test
    fun unknownComponentIsSkippedAndReportedToTelemetrySink() {
        val events = mutableListOf<String>()
        val sections = collectRenderableSections(
            sections = listOf(
                ExperienceSection(id = "known", component = "notice", properties = buildJsonObject { put("title", "Info") }),
                ExperienceSection(id = "unknown", component = "custom_html", properties = buildJsonObject {}),
            ),
            onUnknownComponent = events::add,
        )

        assertEquals(listOf("notice"), sections.map { it.component })
        assertEquals(listOf("custom_html"), events)
    }

    @Test
    fun designTokensAreManifestMetadataAndNeverBecomeAHomeComposable() {
        val events = mutableListOf<String>()
        val sections = collectRenderableSections(
            sections = listOf(
                ExperienceSection(id = "theme", component = "design_tokens", properties = buildJsonObject { put("accent_preset", "campaign_blue") }),
                ExperienceSection(id = "notice", component = "notice", properties = buildJsonObject { put("title", "Info") }),
            ),
            onUnknownComponent = events::add,
        )

        assertEquals(listOf("notice"), sections.map { it.component })
        assertTrue(events.isEmpty())
    }

    @Test
    fun serviceCardsFollowRemoteOrderButRequireAuthoritativeEnabledService() {
        val properties = json.parseToJsonElement(
            """{"cards":[{"code":"food_delivery","subtitle":"Promo hari ini","badge":"Baru"},{"code":"disabled_service","subtitle":"Tidak boleh tampil"},{"code":"tembus_instant"}]}""",
        ).jsonObject
        val available = listOf(
            DeliveryServiceProduct(
                code = "tembus_instant",
                name = "Paket Instan",
                description = "Cepat",
                displayOrder = 2,
            ),
            DeliveryServiceProduct(
                code = "food_delivery",
                name = "Food",
                description = "Makanan",
                displayOrder = 1,
            ),
            DeliveryServiceProduct(
                code = "disabled_service",
                name = "Disabled",
                isEnabled = false,
                displayOrder = 0,
            ),
        )

        val resolved = resolveDynamicServices(properties, available)

        assertEquals(listOf("food_delivery", "tembus_instant"), resolved.map { it.service.code })
        assertEquals("Promo hari ini", resolved.first().subtitle)
        assertEquals("Baru", resolved.first().badge)
    }

    @Test
    fun serviceCodesRemainBackwardCompatibleWhenCardsAreAbsent() {
        val properties = buildJsonObject {
            put("service_codes", json.parseToJsonElement("[\"tembus_instant\",\"food_delivery\"]"))
        }
        val available = listOf(
            DeliveryServiceProduct(code = "food_delivery", name = "Food"),
            DeliveryServiceProduct(code = "tembus_instant", name = "Paket Instan"),
        )

        assertEquals(
            listOf("tembus_instant", "food_delivery"),
            resolveDynamicServices(properties, available).map { it.service.code },
        )
    }
}
