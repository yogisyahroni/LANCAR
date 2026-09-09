package com.tembus.customer.data.config

import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.config.model.ExperienceConfigScope
import com.tembus.customer.data.config.model.ExperienceManifest
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

sealed interface ExperienceConfigFetchResult {
    data class Updated(val manifest: ExperienceManifest, val etag: String?) : ExperienceConfigFetchResult
    data class NotModified(val etag: String?) : ExperienceConfigFetchResult
    data class Failed(val reason: String) : ExperienceConfigFetchResult
}

interface ExperienceConfigApi {
    suspend fun fetch(
        scope: ExperienceConfigScope,
        ifNoneMatch: String?,
    ): ExperienceConfigFetchResult
}

class RetrofitExperienceConfigApi @Inject constructor(
    private val apiService: TEMBUSApiService,
) : ExperienceConfigApi {
    override suspend fun fetch(
        scope: ExperienceConfigScope,
        ifNoneMatch: String?,
    ): ExperienceConfigFetchResult = withContext(Dispatchers.IO) {
        runCatching {
            apiService.getExperienceManifest(
                marketCode = scope.marketCode,
                locale = scope.locale,
                surface = scope.surface,
                appVersion = scope.appVersion,
                cohort = scope.cohort,
                experimentRef = scope.experimentRef,
                ifNoneMatch = ifNoneMatch,
            )
        }.fold(
            onSuccess = { response ->
                when {
                    response.code() == 304 -> ExperienceConfigFetchResult.NotModified(response.headers()["ETag"])
                    response.isSuccessful -> {
                        val data = response.body()?.data
                        if (data == null) {
                            ExperienceConfigFetchResult.Failed("manifest_response_missing_data")
                        } else {
                            ExperienceConfigFetchResult.Updated(data, response.headers()["ETag"])
                        }
                    }
                    else -> ExperienceConfigFetchResult.Failed("manifest_http_${response.code()}")
                }
            },
            onFailure = { error ->
                ExperienceConfigFetchResult.Failed(error.javaClass.simpleName)
            },
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ExperienceConfigApiModule {
    @Binds
    @Singleton
    abstract fun bindExperienceConfigApi(
        implementation: RetrofitExperienceConfigApi,
    ): ExperienceConfigApi
}
