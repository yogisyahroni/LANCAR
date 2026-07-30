package com.tembus.courier.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CourierRegistrationRequest(
    @SerialName("full_name") val fullName: String,
    @SerialName("nik") val nik: String = "",
    @SerialName("phone_number") val phoneNumber: String,
    val email: String = "",
    val password: String,
    @SerialName("vehicle_type") val vehicleType: String = "matic",
    @SerialName("vehicle_plate") val vehiclePlate: String,
    @SerialName("vehicle_brand") val vehicleBrand: String,
    @SerialName("vehicle_model") val vehicleModel: String,
    @SerialName("vehicle_year") val vehicleYear: Int,
    @SerialName("vehicle_cc") val vehicleCc: Int,
    @SerialName("vehicle_category") val vehicleCategory: String,
    @SerialName("engine_type") val engineType: String = "4_tak",
    @SerialName("sim_active") val simActive: Boolean = true,
    @SerialName("skpd_tax_active") val skpdTaxActive: Boolean = true,
    @SerialName("bank_code") val bankCode: String,
    @SerialName("bank_account_number") val bankAccountNumber: String,
    @SerialName("bank_account_name") val bankAccountName: String,
    val documents: Map<String, String>,
    @SerialName("agreed_to_terms") val agreedToTerms: Boolean = true
)

@Serializable
data class CourierRegistrationData(
    @SerialName("courier_id") val courierId: String = "",
    val status: String = "pending",
    @SerialName("checklist_passed") val checklistPassed: Boolean = false
)

@Serializable
data class CourierDocumentUploadData(
    @SerialName("doc_type") val docType: String,
    @SerialName("file_url") val fileUrl: String,
    @SerialName("original_file_name") val originalFileName: String = "",
    @SerialName("mime_type") val mimeType: String = "",
    @SerialName("file_size_bytes") val fileSizeBytes: Long = 0
)
