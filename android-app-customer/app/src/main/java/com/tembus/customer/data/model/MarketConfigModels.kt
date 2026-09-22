package com.tembus.customer.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class PublicMarketConfig(
    @SerialName("market_code") val marketCode: String = "",
    @SerialName("default_locale") val defaultLocale: String = "id-ID",
    @SerialName("legal_documents") val legalDocuments: List<MarketLegalDocument> = emptyList(),
)

@Serializable
data class MarketLegalDocument(
    @SerialName("document_type") val documentType: String = "",
    @SerialName("locale") val locale: String = "",
    @SerialName("version") val version: String = "",
    @SerialName("document_uri") val documentUri: String = "",
    @SerialName("effective_from") val effectiveFrom: String = "",
)
