package com.lancar.customer.ui.screens.auth

import app.cash.turbine.test
import com.lancar.customer.data.model.AuthData
import com.lancar.customer.data.model.AuthResponse
import com.lancar.customer.data.repository.AuthRepository
import com.lancar.customer.data.repository.NotificationRepository
import com.lancar.customer.data.session.AuthSessionManager
import io.mockk.*
import io.mockk.impl.annotations.RelaxedMockK
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.regex.Pattern

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @RelaxedMockK
    private lateinit var authRepository: AuthRepository

    @RelaxedMockK
    private lateinit var sessionManager: AuthSessionManager

    @RelaxedMockK
    private lateinit var notificationRepository: NotificationRepository

    private lateinit var viewModel: AuthViewModel

    @Before
    fun setUp() {
        MockKAnnotations.init(this)
        Dispatchers.setMain(testDispatcher)
        
        viewModel = AuthViewModel(authRepository, sessionManager, notificationRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        unmockkAll()
    }

    @Test
    fun `initial state should be Idle`() = runTest {
        assertEquals(AuthState.Idle, viewModel.authState.value)
    }

    @Test
    fun `setPhoneNumber updates phoneNumber state flow`() = runTest {
        val phone = "test@example.com"
        viewModel.setPhoneNumber(phone)
        assertEquals(phone, viewModel.phoneNumber.value)
    }

    @Test
    fun `requestOtp with valid email transitions to OtpSent on success`() = runTest {
        // Given
        val email = "tester@lancar.com"
        viewModel.setPhoneNumber(email)
        
        val mockResponse = AuthResponse(success = true, message = "OTP Sent", data = null)
        coEvery { authRepository.requestOtp(email) } returns Result.success(mockResponse)

        // When & Then using Turbine for flow capturing
        viewModel.authState.test {
            // Initially should be Idle (cached state)
            assertEquals(AuthState.Idle, awaitItem())
            
            viewModel.requestOtp()
            
            // Must transition to Loading then to OtpSent
            assertEquals(AuthState.Loading, awaitItem())
            assertEquals(AuthState.OtpSent, awaitItem())
        }
    }

    @Test
    fun `requestOtp with server error transitions to Error state`() = runTest {
        // Given
        val email = "fail@lancar.com"
        val errorMessage = "Server unreachable"
        viewModel.setPhoneNumber(email)
        coEvery { authRepository.requestOtp(email) } returns Result.failure(Exception(errorMessage))

        // When & Then
        viewModel.authState.test {
            assertEquals(AuthState.Idle, awaitItem())
            
            viewModel.requestOtp()
            
            assertEquals(AuthState.Loading, awaitItem())
            val state = awaitItem()
            assertTrue(state is AuthState.Error)
            assertEquals(errorMessage, (state as AuthState.Error).message)
        }
    }

    @Test
    fun `verifyOtp success saves session and transitions to Success`() = runTest {
        // Given
        val email = "success@lancar.com"
        val otp = "123456"
        viewModel.setPhoneNumber(email)
        
        val fakeUser = AuthData(token = "fake_jwt_token", customerId = "USER-99", name = "Test User")
        val mockResponse = AuthResponse(success = true, message = "Login OK", data = fakeUser)
        
        coEvery { authRepository.verifyOtp(email, otp) } returns Result.success(mockResponse)

        // When & Then
        viewModel.authState.test {
            assertEquals(AuthState.Idle, awaitItem())
            
            viewModel.verifyOtp(otp)
            
            assertEquals(AuthState.Loading, awaitItem())
            assertEquals(AuthState.Success, awaitItem())
            
            // Verify side effect: Session saved
            coVerify(exactly = 1) { 
                sessionManager.saveSession("fake_jwt_token", "USER-99", "Test User")
            }
        }
    }
}
