from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"marker not found in {path}: {old[:160]!r}")
    p.write_text(text.replace(old, new, 1))


# 1) Backend: enforce Tambal Ban lifecycle before the transactional transition.
replace_once(
    'backend/order-service/internal/service/order_read.go',
    '''\tif before == nil {\n\t\treturn domain.ErrNotFound\n\t}\n\n\ttransitionRepo := s.orderRepo.(domain.OrderTransitionRepository)\n''',
    '''\tif before == nil {\n\t\treturn domain.ErrNotFound\n\t}\n\n\tif err := domain.ValidateTambalBanLifecycle(\n\t\tbefore.ServiceSubType,\n\t\tbefore.ServiceCode,\n\t\tbefore.Status,\n\t\trequest.TargetStatus,\n\t\trequest.Actor,\n\t); err != nil {\n\t\treturn err\n\t}\n\n\t// Tambal Ban cannot become delivered from a courier action until the\n\t// immutable before/after proof and completed service report exist. This is\n\t// checked before the status transaction so a missing report never produces\n\t// a terminal order that only looks complete in the UI.\n\tif domain.IsTambalBanService(before.ServiceSubType, before.ServiceCode) &&\n\t\trequest.Actor == domain.OrderActorCourier && request.TargetStatus == domain.StatusDelivered {\n\t\tif s.reportSvc == nil {\n\t\t\treturn fmt.Errorf("tambal ban completion requires service report")\n\t\t}\n\t\treport, reportErr := s.reportSvc.GetTambalBanReport(ctx, request.OrderID)\n\t\tif reportErr != nil || report == nil || report.CompletedAt == nil ||\n\t\t\treport.TirePhotoBeforeURL == nil || strings.TrimSpace(*report.TirePhotoBeforeURL) == "" ||\n\t\t\treport.TirePhotoAfterURL == nil || strings.TrimSpace(*report.TirePhotoAfterURL) == "" {\n\t\t\treturn fmt.Errorf("tambal ban completion proof is incomplete")\n\t\t}\n\t}\n\n\ttransitionRepo := s.orderRepo.(domain.OrderTransitionRepository)\n'''
)

# 2) Courier: canonical transport contract for the local human-facing stages.
Path('android-app/app/src/main/java/com/tembus/courier/domain/RoadsideStatusContract.kt').write_text('''package com.tembus.courier.domain

import com.tembus.courier.data.model.Order

internal fun isTambalBanOrder(order: Order): Boolean {
    val code = order.serviceCode.orEmpty().trim().lowercase()
    val name = order.serviceName.orEmpty().trim().lowercase()
    return code.startsWith("tambal_ban") || name.contains("tambal ban")
}

internal fun canonicalTambalBanStatus(localStatus: String): String = when (localStatus.trim().lowercase()) {
    "arriving", "navigating" -> "accepted"
    "arrived" -> "pickup_arrived"
    "verifying", "inspecting" -> "picking_up"
    "in_progress", "working" -> "picked_up"
    "service_complete", "completed_service", "report_submitted" -> "delivering"
    "completed", "done", "selesai" -> "delivered"
    else -> localStatus.trim().lowercase()
}
''')

# 3) Courier repository: Tambal Ban transitions are online/server-first.
p = Path('android-app/app/src/main/java/com/tembus/courier/data/repository/OrderRepository.kt')
text = p.read_text()
import_marker = 'import com.tembus.courier.data.model.*\n'
if import_marker not in text:
    raise SystemExit('courier wildcard model import marker missing')
if 'import com.tembus.courier.domain.canonicalTambalBanStatus' not in text:
    text = text.replace(
        import_marker,
        import_marker + 'import com.tembus.courier.domain.canonicalTambalBanStatus\nimport com.tembus.courier.domain.isTambalBanOrder\n',
        1,
    )
old = '''    /**\n     * Update order status locally\n     */\n    suspend fun updateOrderStatus(orderId: String, status: String) = withContext(Dispatchers.IO) {\n        orderDao.updateStatus(orderId, status)\n    }\n'''
new = '''    /**\n     * Update order status. Tambal Ban is server-first because its on-site\n     * lifecycle is safety/consent sensitive; other flows keep the existing\n     * offline-first behavior.\n     */\n    suspend fun updateOrderStatus(orderId: String, status: String) = withContext(Dispatchers.IO) {\n        val current = orderDao.getOrderById(orderId)\n        if (current != null && isTambalBanOrder(current)) {\n            val canonicalStatus = canonicalTambalBanStatus(status)\n            val response = apiService.updateStatus(\n                idempotencyKey = statusIdempotencyKey(orderId, canonicalStatus),\n                request = StatusUpdateRequest(\n                    orderId = orderId,\n                    status = canonicalStatus,\n                    notes = current.deliveryNotes,\n                    length = current.length,\n                    width = current.width,\n                    height = current.height,\n                    weight = current.weight\n                )\n            )\n            if (!response.isSuccessful || response.body()?.success != true) {\n                if (response.code() == 409) {\n                    orderDao.markSyncConflict(orderId, conflictMessage(response))\n                }\n                throw IllegalStateException(\n                    response.body()?.message ?: "Tahap layanan belum diterima server. Periksa koneksi lalu coba lagi."\n                )\n            }\n            orderDao.updateStatus(orderId, status)\n            orderDao.markAsSynced(listOf(orderId))\n            return@withContext\n        }\n        orderDao.updateStatus(orderId, status)\n    }\n'''
if old not in text:
    raise SystemExit('updateOrderStatus marker missing')
text = text.replace(old, new, 1)

# Existing pending Tambal Ban rows from an older app build are normalized before sync.
old = '''            for (order in pendingOrders) {\n                val request = StatusUpdateRequest(\n                    orderId = order.orderId,\n                    status = order.status,\n'''
new = '''            for (order in pendingOrders) {\n                val outboundStatus = if (isTambalBanOrder(order)) canonicalTambalBanStatus(order.status) else order.status\n                val request = StatusUpdateRequest(\n                    orderId = order.orderId,\n                    status = outboundStatus,\n'''
if old not in text:
    raise SystemExit('pending status sync marker missing')
text = text.replace(old, new, 1)
text = text.replace(
    'idempotencyKey = statusIdempotencyKey(order.orderId, order.status),\n                    request = request',
    'idempotencyKey = statusIdempotencyKey(order.orderId, outboundStatus),\n                    request = request',
    1,
)
p.write_text(text)

# 4) Courier resolver accepts canonical server states after refresh.
p = Path('android-app/app/src/main/java/com/tembus/courier/domain/TambalBanFlow.kt')
text = p.read_text()
text = text.replace(
    '    private val completedStatuses = setOf("completed", "done", "selesai")',
    '    private val completedStatuses = setOf("completed", "done", "selesai", "delivered")',
    1,
)
text = text.replace(
    '            status == "arriving" || status == "navigating" -> TambalBanStage.NAVIGATING_TO_LOCATION\n',
    '            status == "arriving" || status == "navigating" || status == "accepted" -> TambalBanStage.NAVIGATING_TO_LOCATION\n',
    1,
)
text = text.replace(
    '            status == "arrived" && !faceVerified -> TambalBanStage.ARRIVED_AT_LOCATION\n',
    '            status in setOf("arrived", "pickup_arrived") && !faceVerified -> TambalBanStage.ARRIVED_AT_LOCATION\n',
    1,
)
text = text.replace(
    '            status == "arrived" && faceVerified && !inspectionDone -> TambalBanStage.VERIFY_IDENTITY\n',
    '            status in setOf("arrived", "pickup_arrived") && faceVerified && !inspectionDone -> TambalBanStage.VERIFY_IDENTITY\n',
    1,
)
text = text.replace(
    '            status == "verifying" -> TambalBanStage.VERIFY_IDENTITY\n',
    '            status == "verifying" || status == "picking_up" -> TambalBanStage.VERIFY_IDENTITY\n',
    1,
)
text = text.replace(
    '            status == "in_progress" || status == "working" -> TambalBanStage.SERVICE_IN_PROGRESS\n',
    '            status == "in_progress" || status == "working" || status == "picked_up" -> TambalBanStage.SERVICE_IN_PROGRESS\n',
    1,
)
text = text.replace(
    '            status == "service_complete" || status == "completed_service" -> TambalBanStage.SERVICE_COMPLETE\n',
    '            status == "service_complete" || status == "completed_service" || status == "delivering" || status == "report_submitted" -> TambalBanStage.SERVICE_COMPLETE\n',
    1,
)
p.write_text(text)

# 5) Customer-facing roadside stage labels are service-specific and human readable.
p = Path('android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderActionPolicy.kt')
text = p.read_text()
old = '''    fun statusLabel(status: String): String = when (normalize(status)) {\n        "scheduled" -> "Terjadwal"\n        "pending_merchant" -> "Menunggu Merchant"\n        "preparing" -> "Disiapkan"\n        "searching" -> "Mencari Kurir"\n        "accepted" -> "Kurir Menuju Pickup"\n        "picked_up", "delivering" -> "Sedang Diantar"\n        "delivered", "completed" -> "Selesai"\n        "cancelled", "canceled" -> "Dibatalkan"\n        "failed", "payment_failed" -> "Tidak berhasil"\n        else -> "Status sedang diperbarui"\n    }\n'''
new = '''    fun statusLabel(status: String, serviceSubType: String? = null): String {\n        val subtype = serviceSubType.orEmpty().trim().lowercase()\n        if (subtype.startsWith("tambal_ban")) {\n            return when (normalize(status)) {\n                "searching", "assigned" -> "Mencari Teknisi"\n                "accepted" -> "Teknisi Menuju Lokasi"\n                "pickup_arrived" -> "Teknisi Tiba di Lokasi"\n                "picking_up" -> "Verifikasi & Inspeksi Ban"\n                "picked_up" -> "Ban Sedang Diperbaiki"\n                "delivering" -> "Perbaikan Selesai · Menunggu Bukti Akhir"\n                "delivered", "completed" -> "Layanan Selesai"\n                "cancelled", "canceled" -> "Layanan Dibatalkan"\n                "failed", "failed_delivery" -> "Layanan Perlu Tindak Lanjut"\n                else -> "Status layanan sedang diperbarui"\n            }\n        }\n        return when (normalize(status)) {\n            "scheduled" -> "Terjadwal"\n            "pending_merchant" -> "Menunggu Merchant"\n            "preparing" -> "Disiapkan"\n            "searching" -> "Mencari Kurir"\n            "accepted" -> "Kurir Menuju Pickup"\n            "pickup_arrived" -> "Kurir Tiba di Pickup"\n            "picking_up" -> "Proses Penjemputan"\n            "picked_up", "delivering" -> "Sedang Diantar"\n            "delivered", "completed" -> "Selesai"\n            "cancelled", "canceled" -> "Dibatalkan"\n            "failed", "payment_failed" -> "Tidak berhasil"\n            else -> "Status sedang diperbarui"\n        }\n    }\n'''
if old not in text:
    raise SystemExit('customer status label marker missing')
p.write_text(text.replace(old, new, 1))

replace_once(
    'android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt',
    'Text(statusDisplayText(order.status), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)',
    'Text(statusDisplayText(order.status, order.serviceSubType), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 18.sp)',
)
replace_once(
    'android-app-customer/app/src/main/java/com/tembus/customer/ui/screens/detail/OrderDetailScreen.kt',
    '''private fun statusDisplayText(status: String): String {\n    return OrderActionPolicy.statusLabel(status)\n}\n''',
    '''private fun statusDisplayText(status: String, serviceSubType: String?): String {\n    return OrderActionPolicy.statusLabel(status, serviceSubType)\n}\n''',
)
