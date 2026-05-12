package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepository @Inject constructor(
    private val apiService: LANCARApiService
) {
    fun getProfile(): Flow<Result<ProfileResponse>> = flow {
        try {
            val response = apiService.getProfile()
            val data = response.body()?.data
            if (response.isSuccessful && response.body()?.success == true && data != null) {
                emit(Result.success(data))
            } else {
                emit(Result.failure(Exception("Gagal mengambil profil")))
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
                emit(Result.failure(Exception("Gagal mengupdate profil")))
            }
        } catch (e: Exception) {
            emit(Result.failure(e))
        }
    }
}
