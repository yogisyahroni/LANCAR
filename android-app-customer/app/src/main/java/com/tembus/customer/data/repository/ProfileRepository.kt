package com.tembus.customer.data.repository

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.api.withRequestReference
import com.tembus.customer.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import org.json.JSONObject
import retrofit2.Response
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val apiService: TEMBUSApiService
) {
    fun getProfile(): Flow<Result<ProfileResponse>> = flow {
        try {
            val response = apiService.getProfile()
            val data = response.body()?.data
            if (response.isSuccessful && response.body()?.success == true && data != null) {
                emit(Result.success(data))
            } else {
                emit(Result.failure(Exception(response.readErrorMessage("Gagal mengambil profil"))))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    fun updateProfile(request: UpdateProfileRequest): Flow<Result<ProfileResponse>> = flow {
        try {
            val response = apiService.updateProfile(request)
            val data = response.body()?.data
            if (response.isSuccessful && response.body()?.success == true && data != null) {
                emit(Result.success(data))
            } else {
                emit(Result.failure(Exception(response.readErrorMessage("Gagal mengupdate profil"))))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }

    // C8: Referral
    suspend fun getReferralInfo(): Result<ReferralInfo> {
        return try {
            val response = apiService.getReferralInfo()
            val data = response.body()?.data
            if (response.isSuccessful && response.body()?.success == true && data != null) {
                Result.success(data)
            } else {
                Result.failure(Exception(response.readErrorMessage("Gagal memuat referral")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun applyReferralCode(code: String): Result<String> {
        return try {
            val response = apiService.applyReferralCode(ApplyReferralRequest(code = code.trim().uppercase()))
            val body = response.body()
            if (response.isSuccessful && body?.success == true) {
                Result.success(body.message ?: "Kode referral berhasil diterapkan")
            } else {
                Result.failure(Exception(response.readErrorMessage(body?.message ?: "Gagal menerapkan kode referral")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // C9: Loyalty
    suspend fun getLoyaltyInfo(): Result<LoyaltyInfo> {
        return try {
            val response = apiService.getLoyaltyInfo()
            val data = response.body()?.data
            if (response.isSuccessful && response.body()?.success == true && data != null) {
                Result.success(data)
            } else {
                Result.failure(Exception(response.readErrorMessage("Gagal memuat loyalty")))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun <T> Response<T>.readErrorMessage(fallback: String): String {
        return try {
            val raw = errorBody()?.string()?.takeIf { it.isNotBlank() } ?: return fallback.withRequestReference(this)
            val parsedMessage = runCatching {
                JSONObject(raw).optString("message").takeIf { it.isNotBlank() }
            }.getOrNull()
            (parsedMessage ?: raw.take(240)).withRequestReference(this)
        } catch (_: Exception) {
            fallback.withRequestReference(this)
        }
    }
}
