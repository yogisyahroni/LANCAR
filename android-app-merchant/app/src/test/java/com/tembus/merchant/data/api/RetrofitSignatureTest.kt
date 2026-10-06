package com.tembus.merchant.data.api

import com.tembus.merchant.data.model.AuthResponse
import com.tembus.merchant.data.model.LoginRequest
import kotlin.coroutines.Continuation
import org.junit.Assert.assertEquals
import org.junit.Test
import retrofit2.Response
import retrofit2.http.POST
import java.lang.reflect.ParameterizedType
import java.lang.reflect.WildcardType

class RetrofitSignatureTest {

    @Test
    fun loginUsesMerchantPortalAuthRoute() {
        val method = TEMBUSApiService::class.java.getDeclaredMethod(
            "login",
            LoginRequest::class.java,
            Continuation::class.java
        )

        assertEquals(
            "api/v1/auth/merchant-portal/login/start",
            method.getAnnotation(POST::class.java)?.value
        )
    }

    @Test
    fun loginKeepsParameterizedSuspendResponseType() {
        val method = TEMBUSApiService::class.java.getDeclaredMethod(
            "login",
            LoginRequest::class.java,
            Continuation::class.java
        )
        val continuationType = method.genericParameterTypes.last() as? ParameterizedType
            ?: error("Retrofit continuation must retain its generic type")
        val continuationArgument = continuationType.actualTypeArguments.single()
        val responseType = when (continuationArgument) {
            is WildcardType -> continuationArgument.lowerBounds.singleOrNull()
                ?: continuationArgument.upperBounds.single()
            else -> continuationArgument
        }
        val parameterizedResponse = responseType as? ParameterizedType
            ?: error("Retrofit response must retain its generic type")

        assertEquals(Response::class.java, parameterizedResponse.rawType)
        assertEquals(AuthResponse::class.java, parameterizedResponse.actualTypeArguments.single())
    }
}
