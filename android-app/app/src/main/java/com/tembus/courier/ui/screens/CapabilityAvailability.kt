package com.tembus.courier.ui.screens

import com.tembus.courier.data.model.CourierServiceCapability

internal fun capabilityIsAvailable(item: CourierServiceCapability): Boolean =
    item.isEligible ?: (
        item.effectiveStatus?.takeIf { it.isNotBlank() } ?: item.status
    ).equals("enabled", ignoreCase = true)

/** Admin/certification availability, deliberately excluding the courier's own opt-in. */
internal fun capabilityIsAdminAvailable(item: CourierServiceCapability): Boolean =
    (item.effectiveStatus?.takeIf { it.isNotBlank() } ?: item.status)
        .equals("enabled", ignoreCase = true)

internal fun capabilityStatusForDisplay(item: CourierServiceCapability): String =
    if (item.isEligible == false && item.status.equals("enabled", ignoreCase = true)) {
        item.effectiveStatus?.takeIf { it.isNotBlank() && !it.equals("enabled", ignoreCase = true) }
            ?: "not_available"
    } else {
        item.effectiveStatus?.takeIf { it.isNotBlank() } ?: item.status
    }

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
            "vehicle_ineligible" -> "Tidak tersedia untuk kendaraan terdaftar"
            "equipment_incomplete" -> "Perlengkapan Tambal Ban belum lengkap"
            "pricing_incomplete" -> "Harga jasa Tambal Ban belum aktif"
            "not_available" -> "Layanan belum tersedia untuk akun ini"
            else -> "Capability belum tersedia"
        }

internal fun capabilityRemediation(item: CourierServiceCapability): String? =
    item.remediationPath?.takeIf { it.isNotBlank() }
