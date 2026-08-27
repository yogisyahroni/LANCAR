package com.tembus.courier.notification

import com.tembus.courier.TEMBUSApplication
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

    @Test
    fun `accepts only http image urls for rich broadcast notification`() {
        assertEquals("https://cdn.example.test/banner.png", notificationImageUrl(mapOf("image_url" to "https://cdn.example.test/banner.png")))
        assertEquals("http://cdn.example.test/banner.png", notificationImageUrl(mapOf("imageUrl" to "http://cdn.example.test/banner.png")))
        assertNull(notificationImageUrl(mapOf("image_url" to "javascript:alert(1)")))
        assertNull(notificationImageUrl(emptyMap()))
    }

    @Test
    fun `routes broadcast priority to broadcast notification channels`() {
        assertEquals(TEMBUSApplication.CHANNEL_BROADCASTS, notificationChannelId(mapOf("type" to "broadcast")))
        assertEquals(TEMBUSApplication.CHANNEL_BROADCASTS, notificationChannelId(mapOf("type" to "admin_broadcast", "priority" to "normal")))
        assertEquals(TEMBUSApplication.CHANNEL_BROADCASTS_URGENT, notificationChannelId(mapOf("type" to "broadcast", "priority" to "high")))
        assertEquals(TEMBUSApplication.CHANNEL_BROADCASTS_URGENT, notificationChannelId(mapOf("type" to "admin_broadcast", "priority" to "urgent")))
        assertEquals(TEMBUSApplication.CHANNEL_ORDERS, notificationChannelId(mapOf("type" to "order_assignment")))
    }
}
