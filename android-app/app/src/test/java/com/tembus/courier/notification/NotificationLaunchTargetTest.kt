package com.tembus.courier.notification

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationLaunchTargetTest {
    @Test
    fun `admin broadcast opens inbox only`() {
        val target = notificationLaunchTarget(
            mapOf(
                "type" to "admin_broadcast",
                "order_id" to "ORD-1",
            )
        )

        assertTrue(target.openInbox)
        assertNull(target.chatOrderId)
        assertNull(target.selectedOrderId)
    }

    @Test
    fun `chat notification opens chat order`() {
        val target = notificationLaunchTarget(
            mapOf(
                "type" to "chat_message",
                "order_id" to "ORD-2",
            )
        )

        assertEquals("ORD-2", target.chatOrderId)
        assertNull(target.selectedOrderId)
    }

    @Test
    fun `order notification opens order detail`() {
        val target = notificationLaunchTarget(mapOf("type" to "order_status_update", "orderId" to "ORD-3"))

        assertEquals("ORD-3", target.selectedOrderId)
        assertNull(target.chatOrderId)
    }
}
