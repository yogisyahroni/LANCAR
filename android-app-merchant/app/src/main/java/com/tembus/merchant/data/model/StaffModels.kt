package com.tembus.merchant.data.model

import com.google.gson.annotations.SerializedName

// ── M1: Staff Management (CORPORATE ONLY) ──────────────────────────
// Model menyesuaikan backend merchant-service /api/v1/merchant/{id}/staff.

/** Undangan staff — body POST /merchant/{id}/staff. */
data class InviteStaffRequest(
    @SerializedName("email") val email: String? = null,
    @SerializedName("phone") val phone: String? = null,
    @SerializedName("role") val role: String, // manager | kasir | kitchen
    @SerializedName("message") val message: String? = null
)

/** Accept undangan — body POST /merchant/staff/accept. */
data class AcceptStaffInviteRequest(
    @SerializedName("invite_token") val inviteToken: String
)

/** Update role/status staff — body PATCH /merchant/{id}/staff/{staffId}. */
data class UpdateStaffRequest(
    @SerializedName("role") val role: String? = null,
    @SerializedName("status") val status: String? = null // active | revoked
)

/** Satu staff (response list, tanpa invite_token). */
data class MerchantStaff(
    @SerializedName("id") val id: String = "",
    @SerializedName("merchant_id") val merchantId: String = "",
    @SerializedName("user_id") val userId: String? = null,
    @SerializedName("role") val role: String = "kasir",
    @SerializedName("status") val status: String = "pending",
    @SerializedName("permissions") val permissions: Int = 0,
    @SerializedName("staff_name") val staffName: String? = null,
    @SerializedName("staff_email") val staffEmail: String? = null,
    @SerializedName("invited_at") val invitedAt: String? = null
) {
    val isPending: Boolean get() = status == "pending"
    val isActive: Boolean get() = status == "active"
    val isRevoked: Boolean get() = status == "revoked"

    // Helper permission bitmask (sama dengan backend).
    fun hasPermission(bit: Int): Boolean = isActive && (permissions and bit) != 0
    val canManageStaff: Boolean get() = hasPermission(PERM_MANAGE_STAFF)

    companion object {
        const val PERM_VIEW_STORE = 1 shl 0
        const val PERM_MANAGE_MENU = 1 shl 1
        const val PERM_ACCEPT_ORDER = 1 shl 2
        const val PERM_UPDATE_PREP = 1 shl 3
        const val PERM_CHAT_CUSTOMER = 1 shl 4
        const val PERM_MANAGE_STAFF = 1 shl 5
        const val PERM_VIEW_REPORTS = 1 shl 6
        const val PERM_MANAGE_PROMO = 1 shl 7
    }
}

/** Wrapper list staff: {success, data:[...]}. */
data class StaffListResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("data") val data: List<MerchantStaff> = emptyList()
)

/** Response invite: {success, staff_id, role, status, message}. */
data class InviteStaffResponse(
    @SerializedName("success") val success: Boolean = false,
    @SerializedName("staff_id") val staffId: String = "",
    @SerializedName("role") val role: String = "",
    @SerializedName("status") val status: String = "",
    @SerializedName("message") val message: String? = null
)
