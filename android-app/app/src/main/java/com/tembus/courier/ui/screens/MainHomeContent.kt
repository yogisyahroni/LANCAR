package com.tembus.courier.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.tembus.courier.data.model.CourierActiveRoutePlan
import com.tembus.courier.data.model.CourierCapabilityProfile
import com.tembus.courier.data.model.CourierHotspot
import com.tembus.courier.data.model.CourierRoutePreview
import com.tembus.courier.data.model.CourierServiceProduct
import com.tembus.courier.data.model.MapsProviderConfig
import com.tembus.courier.data.model.Order

// Extracted from MainScreen.kt (god-file refactor): home tab content.
@Composable
internal fun HomeContent(
    courierName: String,
    courierRole: String,
    totalOrders: Int,
    pendingCount: Int,
    deliveredCount: Int,
    todayEarningsIdr: Int,
    orders: List<Order>,
    offers: List<Order>,
    services: List<CourierServiceProduct>,
    capabilityProfile: CourierCapabilityProfile?,
    courierVehicleType: String,
    routePreviews: Map<String, CourierRoutePreview>,
    activeRoutePlan: CourierActiveRoutePlan?,
    hotspots: List<CourierHotspot>,
    mapsProviderConfig: MapsProviderConfig,
    isOnline: Boolean,
    onOnlineToggle: (Boolean) -> Unit,
    onCapturePod: (Order) -> Unit,
    onOpenDelivery: (Order) -> Unit,
    onViewOrders: () -> Unit,
    onScanPackage: () -> Unit
) {
    val activeOrder = orders.firstOrNull { it.status == "in_transit" || it.status == "picked_up" }
    val roleLabel = courierRoleLabel(courierRole)
    val roleHint = courierRoleHint(courierRole)
    val pendingLabel = courierPendingLabel(courierRole)
    val completedLabel = courierCompletedLabel(courierRole)
    val taskTitle = courierCurrentTaskTitle(courierRole)
    val emptyTitle = courierEmptyTaskTitle(courierRole)
    val emptyHint = if (isOnline) {
        "Cek daftar order atau tunggu tugas berikutnya."
    } else {
        "Aktifkan untuk bekerja atau cek daftar order."
    }

    // ponytail: single on_demand mode — retired regular/HomeContent branch 2026-08.
    OnDemandHomeHubEnterprise(
        courierName = courierName,
        totalOrders = totalOrders,
        pendingCount = pendingCount,
        deliveredCount = deliveredCount,
        todayEarningsIdr = todayEarningsIdr,
        orders = orders,
        offers = offers,
        services = services,
        capabilityProfile = capabilityProfile,
        courierVehicleType = courierVehicleType,
        routePreviews = routePreviews,
        activeRoutePlan = activeRoutePlan,
        hotspots = hotspots,
        mapsProviderConfig = mapsProviderConfig,
        isOnline = isOnline,
        onOnlineToggle = onOnlineToggle,
        onOpenDelivery = onOpenDelivery,
        onViewOrders = onViewOrders
    )
}
