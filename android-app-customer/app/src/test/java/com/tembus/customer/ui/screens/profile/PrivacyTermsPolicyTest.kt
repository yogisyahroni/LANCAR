package com.tembus.customer.ui.screens.profile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PrivacyTermsPolicyTest {
    @Test
    fun resolvesServerRelativePathAgainstApiOrigin() {
        assertEquals(
            "https://api.example.com/legal/privacy",
            resolveApprovedLegalUri("/legal/privacy", "https://api.example.com/api/v1/"),
        )
    }

    @Test
    fun rejectsProtocolRelativeAndUnsupportedUris() {
        assertNull(resolveApprovedLegalUri("//evil.example/legal", "https://api.example.com/api/v1/"))
        assertNull(resolveApprovedLegalUri("javascript:alert(1)", "https://api.example.com/api/v1/"))
        assertNull(resolveApprovedLegalUri("http://api.example.com/legal", "https://api.example.com/api/v1/"))
    }
}
