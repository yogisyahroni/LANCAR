package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class CustomerOrderServiceMetadata(
    @SerialName("parcel") val parcel: CustomerParcelFacts? = null,
    @SerialName("food") val food: CustomerFoodFacts? = null,
    @SerialName("roadside") val roadside: CustomerRoadsideFacts? = null,
    @SerialName("aggregator") val aggregator: CustomerAggregatorFacts? = null,
    @SerialName("towing") val towing: CustomerTowingFacts? = null,
)

@Serializable
data class CustomerParcelFacts(
    @SerialName("category") val category: String? = null,
    @SerialName("item_description") val itemDescription: String? = null,
    @SerialName("item_image_url") val itemImageUrl: String? = null,
    @SerialName("dimensions") val dimensions: CustomerParcelDimensions? = null,
    @SerialName("weight_kg") val weightKg: Double? = null,
    @SerialName("package_count") val packageCount: Double? = null,
)

@Serializable
data class CustomerParcelDimensions(
    @SerialName("length_cm") val lengthCm: Double? = null,
    @SerialName("width_cm") val widthCm: Double? = null,
    @SerialName("height_cm") val heightCm: Double? = null,
)

@Serializable
data class CustomerFoodFacts(
    @SerialName("merchant_id") val merchantId: String? = null,
    @SerialName("merchant_name") val merchantName: String? = null,
    @SerialName("item_count") val itemCount: Double? = null,
    @SerialName("prep_time_minutes") val prepTimeMinutes: Double? = null,
    @SerialName("contactless") val contactless: Boolean? = null,
)

@Serializable
data class CustomerRoadsideFacts(
    @SerialName("service_sub_type") val serviceSubType: String? = null,
    @SerialName("vehicle_details") val vehicleDetails: JsonObject? = null,
)

@Serializable
data class CustomerAggregatorFacts(
    @SerialName("provider") val provider: String? = null,
    @SerialName("service_type") val serviceType: String? = null,
    @SerialName("tariff_idr") val tariffIdr: Double? = null,
    @SerialName("net_cost_idr") val netCostIdr: Double? = null,
    @SerialName("awb_number") val awbNumber: String? = null,
)

@Serializable
data class CustomerTowingFacts(
    @SerialName("service_sub_type") val serviceSubType: String? = null,
    @SerialName("vehicle_details") val vehicleDetails: JsonObject? = null,
)

@Serializable
data class CustomerOrderContract(
    @SerialName("contract_version") val contractVersion: String = "",
    @SerialName("id") val id: String = "",
    @SerialName("customer") val customer: CustomerContractCustomer = CustomerContractCustomer(),
    @SerialName("service") val service: CustomerContractService = CustomerContractService(),
    @SerialName("order_state") val orderState: CustomerContractOrderState = CustomerContractOrderState(),
    @SerialName("money_state") val moneyState: CustomerContractMoneyState = CustomerContractMoneyState(),
    @SerialName("timestamps") val timestamps: CustomerContractTimestamps = CustomerContractTimestamps(),
    @SerialName("actor_ownership") val actorOwnership: CustomerContractActorOwnership = CustomerContractActorOwnership(),
    @SerialName("quote_id") val quoteId: String? = null,
    @SerialName("correlation_id") val correlationId: String? = null,
)

@Serializable
data class CustomerContractCustomer(
    @SerialName("id") val id: String? = null,
)

@Serializable
data class CustomerContractTimestamps(
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("updated_at") val updatedAt: String? = null,
)

@Serializable
data class CustomerContractActorOwnership(
    @SerialName("customer_id") val customerId: String? = null,
    @SerialName("merchant_id") val merchantId: String? = null,
    @SerialName("courier_id") val courierId: String? = null,
)

@Serializable
data class CustomerContractService(
    @SerialName("category") val category: String? = null,
    @SerialName("service_code") val serviceCode: String? = null,
    @SerialName("service_sub_type") val serviceSubType: String? = null,
    @SerialName("metadata") val metadata: CustomerOrderServiceMetadata = CustomerOrderServiceMetadata(),
    @SerialName("degraded") val degraded: Boolean = false,
)

@Serializable
data class CustomerContractOrderState(
    @SerialName("status") val status: String? = null,
    @SerialName("state_version") val stateVersion: Long = 1,
)

@Serializable
data class CustomerContractMoneyState(
    @SerialName("currency") val currency: String = "IDR",
    @SerialName("total_price_idr") val totalPriceIdr: Double? = null,
    @SerialName("payment_status") val paymentStatus: String? = null,
)
