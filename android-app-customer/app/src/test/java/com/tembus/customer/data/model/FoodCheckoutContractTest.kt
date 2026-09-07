package com.tembus.customer.data.model

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FoodCheckoutContractTest {

    @Test
    fun `checkout options are serialized with the server contract`() {
        val request = CreateFoodOrderRequest(
            merchantId = "merchant-1",
            items = listOf(FoodOrderItemRequest(menuItemId = "menu-1", quantity = 1)),
            dropoffAddress = "Jl. Test",
            dropoffLat = -6.2,
            dropoffLng = 106.8,
            orderNotes = "Pisahkan sambal",
            contactless = true,
            cutlery = "no",
            deliveryNote = "Taruh di meja satpam",
            giftMode = true,
            receiverPrivacy = "contactless",
            groupOrderId = "00000000-0000-0000-0000-000000000010"
        )

        val json = Json.encodeToString(request)

        assertTrue(json.contains("\"cutlery\":\"no\""))
        assertTrue(json.contains("\"delivery_note\":\"Taruh di meja satpam\""))
        assertTrue(json.contains("\"gift_mode\":true"))
        assertTrue(json.contains("\"receiver_privacy\":\"contactless\""))
        assertEquals(true, Json.decodeFromString<CreateFoodOrderRequest>(json).contactless)
        assertEquals("00000000-0000-0000-0000-000000000010", Json.decodeFromString<CreateFoodOrderRequest>(json).groupOrderId)
    }

    @Test
    fun `group response preserves deadline members cart and split allocations`() {
        val group = FoodGroupOrder(
            id = "group-1",
            merchantId = "merchant-1",
            creatorId = "customer-1",
            status = "closed",
            deadline = "2026-09-07T12:30:00Z",
            split = true,
            members = listOf(FoodGroupMember("customer-1", "creator", "active")),
            cart = listOf(FoodGroupCartItem("item-1", "group-1", "customer-1", "menu-1", 2)),
            allocations = listOf(FoodGroupAllocation("customer-1", 25000, "pending"))
        )
        val decoded = Json.decodeFromString<FoodGroupOrder>(Json.encodeToString(group))
        assertEquals("2026-09-07T12:30:00Z", decoded.deadline)
        assertEquals(2, decoded.cart.single().quantity)
        assertEquals(25000, decoded.allocations.single().amountIdr)
    }

    @Test
    fun `membership entitlement preserves server subsidy cap`() {
        val entitlement = FoodMembershipEntitlement(
            id = "ent-1", userId = "customer-1", planId = "plan-1", status = "active",
            currentPeriodStart = "2026-09-01T00:00:00Z", currentPeriodEnd = "2026-10-01T00:00:00Z",
            freeDeliveryUsedIdr = 3000, freeDeliveryRemainingIdr = 97000
        )
        val decoded = Json.decodeFromString<FoodMembershipEntitlement>(Json.encodeToString(entitlement))
        assertEquals("active", decoded.status)
        assertEquals(97000, decoded.freeDeliveryRemainingIdr)
    }
}
