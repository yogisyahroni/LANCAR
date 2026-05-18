package com.lancar.customer.data.repository

import com.lancar.customer.data.api.LANCARApiService
import com.lancar.customer.data.model.AuthResponse
import io.mockk.coEvery
import io.mockk.impl.annotations.RelaxedMockK
import io.mockk.junit4.MockKRule
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import retrofit2.Response

class AuthRepositoryTest {

    @get:Rule
    val mockkRule = MockKRule(this)

    @RelaxedMockK
    private lateinit var apiService: LANCARApiService

    private lateinit var repository: AuthRepository

    @Before
    fun setUp() {
        repository = AuthRepository(apiService)
    }

    @Test
    fun `requestOtp failure propagates exception as Result failure`() = runTest {
        // Given
        val email = "error@lancar.com"
        coEvery { apiService.requestOtp(any()) } throws RuntimeException("Network connection lost")
        coEvery { apiService.requestOtpV1(any()) } throws RuntimeException("Fallback endpoint unavailable")

        // When
        val result = repository.requestOtp(email)

        // Then
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("Network connection lost") == true)
    }

    @Test
    fun `requestOtp falls back to v1 endpoint when legacy route is missing`() = runTest {
        // Given
        val email = "fallback@lancar.com"
        coEvery { apiService.requestOtp(any()) } returns Response.error(404, "Not Found".toResponseBody(null))
        coEvery { apiService.requestOtpV1(any()) } returns Response.success(AuthResponse(message = "OTP sent"))

        // When
        val result = repository.requestOtp(email)

        // Then
        assertTrue(result.isSuccess)
    }

    @Test
    fun `requestOtp handles unsuccessful HTTP response codes`() = runTest {
        // Given
        val email = "server-broken@lancar.com"
        val rawResponse = Response.error<AuthResponse>(500, "Internal Error".toResponseBody(null))
        coEvery { apiService.requestOtp(any()) } returns rawResponse

        // When
        val result = repository.requestOtp(email)

        // Then
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message?.contains("500") == true)
    }

    @Test
    fun `verifyOtp handles invalid payload where success field is false`() = runTest {
        // Given
        val mockFailResponse = AuthResponse(success = false, message = "Token Expired", data = null)
        coEvery { apiService.login(any()) } returns Response.success(mockFailResponse)

        // When
        val result = repository.verifyOtp("email", "otp")

        // Then
        assertTrue(result.isFailure)
        assertTrue(result.exceptionOrNull()?.message == "Token Expired")
    }
}
