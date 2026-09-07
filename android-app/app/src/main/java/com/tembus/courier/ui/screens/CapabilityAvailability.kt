package com.tembus.courier.ui.screens

import com.tembus.courier.data.model.CourierServiceCapability

internal fun capabilityIsAvailable(item: CourierServiceCapability): Boolean =
    item.isEligible ?: (
        item.effectiveStatus?.takeIf { it.isNotBlank() } ?: item.status
    ).equals("enabled", ignoreCase = true)

internal fun capabilityStatusForDisplay(item: CourierServiceCapability): String =
    item.effectiveStatus?.takeIf { it.isNotBlank() } ?: item.status

internal fun capabilityAvailabilityReason(item: CourierServiceCapability): String =
    item.availabilityReason?.takeIf { it.isNotBlank() }
        ?: item.eligibilityReason?.takeIf { it.isNotBlank() }
        ?: when (capabilityStatusForDisplay(item).lowercase()) {
            "pending_review" -> "Menunggu review admin"
            "rejected" -> "Pengajuan capability ditolak"
            "paused" -> "Capability sedang dijeda"
            "suspended" -> "Capability sedang disuspend"
            "disabled" -> "Capability belum diaktifkan"
            "not_yet_effective" -> "Sertifikasi belum mulai berlaku"
            "expired" -> "Sertifikasi sudah kedaluwarsa"
            "documents_ineligible" -> "Dokumen courier belum memenuhi syarat"
            "market_unavailable" -> "Capability belum tersedia di market ini"
            else -> "Capability belum tersedia"
        }

internal fun capabilityRemediation(item: CourierServiceCapability): String? =
    item.remediationPath?.takeIf { it.isNotBlank() }
