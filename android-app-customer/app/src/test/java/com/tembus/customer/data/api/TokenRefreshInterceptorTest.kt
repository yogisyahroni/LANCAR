package com.tembus.customer.data.api

import com.tembus.customer.data.device.DeviceIdentityProvider
import com.tembus.customer.data.session.AuthSessionManager
import com.tembus.customer.data.session.SessionInvalidationReason
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import okhttp3.Interceptor
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Test

class TokenRefreshInterceptorTest {

    private fun interceptorWithNoStoredRefresh(
        sessionManager: AuthSessionManager = mockk(relaxed = true),
    ): TokenRefreshInterceptor {
        every { sessionManager.getRefreshTokenSync() } returns null
        val deviceIdentityProvider = mockk<DeviceIdentityProvider>(relaxed = true)
        return TokenRefreshInterceptor(sessionManager, deviceIdentityProvider)
    }

    @Test
    fun `clears customer session when authorized request receives unauthorized response`() {
        val sessionManager = mockk<AuthSessionManager>(relaxed = true)
        val request = Request.Builder()
            .url("https://api.tembus.test/api/v1/customer/orders")
            .header("Authorization", "Bearer expired-token")
            .build()
        val response = Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(401)
            .message("Unauthorized")
            .body("""{"message":"jwt expired"}""".toResponseBody(null))
            .build()
        val chain = mockk<Interceptor.Chain>()
        every { chain.request() } returns request
        every { chain.proceed(request) } returns response

        interceptorWithNoStoredRefresh(sessionManager).intercept(chain)

        coVerify(exactly = 1) {
            sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
        }
    }

    @Test
    fun `clears customer session when authorized request receives 419 response`() {
        val sessionManager = mockk<AuthSessionManager>(relaxed = true)
        val request = Request.Builder()
            .url("https://api.tembus.test/api/v1/customer/orders")
            .header("Authorization", "Bearer expired-token")
            .build()
        val response = Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(419)
            .message("Expired")
            .body("""{"message":"token expired"}""".toResponseBody(null))
            .build()
        val chain = mockk<Interceptor.Chain>()
        every { chain.request() } returns request
        every { chain.proceed(request) } returns response

        interceptorWithNoStoredRefresh(sessionManager).intercept(chain)

        coVerify(exactly = 1) {
            sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
        }
    }

    @Test
    fun `does not clear customer session when public auth request receives unauthorized response`() {
        val request = Request.Builder()
            .url("https://api.tembus.test/api/v1/auth/customer/login/start")
            .build()
        val response = Response.Builder()
            .request(request)
            .protocol(Protocol.HTTP_1_1)
            .code(401)
            .message("Unauthorized")
            .body("""{"message":"invalid credentials"}""".toResponseBody(null))
            .build()
        val chain = mockk<Interceptor.Chain>()
        every { chain.request() } returns request
        every { chain.proceed(request) } returns response

        val publicSessionManager = mockk<AuthSessionManager>(relaxed = true)
        interceptorWithNoStoredRefresh(publicSessionManager).intercept(chain)

        coVerify(exactly = 0) {
            publicSessionManager.clearSession(any())
        }
    }
}
