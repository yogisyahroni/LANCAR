package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.api.withRequestReference
import com.tembus.customer.data.model.MarketLegalDocument
import com.tembus.customer.data.config.model.ExperienceManifestValidator
import org.json.JSONObject
import javax.inject.Inject
import javax.inject.Singleton
import retrofit2.Response

@Singleton
class MarketConfigRepository @Inject constructor(
    private val apiService: TEMBUSApiService,
) {
    suspend fun getApprovedLegalDocuments(): Result<List<MarketLegalDocument>> = try {
        val response = apiService.getPublicMarketConfig(
            marketCode = ExperienceManifestValidator.DEFAULT_MARKET_CODE,
        )
        val body = response.body()
        if (response.isSuccessful && body?.success == true && body.data != null) {
            Result.success(body.data.legalDocuments)
        } else {
            Result.failure(Exception(response.readErrorMessage("Kebijakan legal belum dapat dimuat")))
        }
    } catch (error: Exception) {
        Result.failure(error)
    }

    private fun <T> Response<T>.readErrorMessage(fallback: String): String {
        return try {
            val raw = errorBody()?.string()?.takeIf { it.isNotBlank() } ?: return fallback.withRequestReference(this)
            val message = runCatching { JSONObject(raw).optString("message").takeIf { it.isNotBlank() } }.getOrNull()
            (message ?: raw.take(240)).withRequestReference(this)
        } catch (_: Exception) {
            fallback.withRequestReference(this)
        }
    }
}
