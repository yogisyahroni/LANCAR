package com.tembus.customer.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.tembus.customer.data.onboarding.OnboardingPreferences
import com.tembus.customer.data.model.CallSignalEvent
import com.tembus.customer.data.model.NotificationRealtimeEvent
import com.tembus.customer.data.repository.NotificationRepository
import com.tembus.customer.data.session.AuthSessionManager
import com.tembus.customer.data.session.SessionInvalidationReason
import com.tembus.customer.ui.navigation.Screen
import com.tembus.customer.util.SocketManager
import com.tembus.customer.webrtc.CallInviteStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    private val sessionManager: AuthSessionManager,
    private val notificationRepository: NotificationRepository,
    private val onboardingPreferences: OnboardingPreferences,
    private val socketManager: SocketManager,
    private val callInviteStore: CallInviteStore
) : ViewModel() {

    private val _isLoading = MutableStateFlow(true)
    val isLoading = _isLoading.asStateFlow()

    private val _startDestination = MutableStateFlow(Screen.AuthGraph.route)
    val startDestination = _startDestination.asStateFlow()
    val sessionInvalidationReason = sessionManager.sessionInvalidationReason
    private val _incomingCallInvites = MutableSharedFlow<CallSignalEvent>(extraBufferCapacity = 1)
    val incomingCallInvites = _incomingCallInvites.asSharedFlow()
    private val _foregroundNotifications = MutableSharedFlow<NotificationRealtimeEvent>(extraBufferCapacity = 1)
    val foregroundNotifications = _foregroundNotifications.asSharedFlow()
    private var authenticatedDestination = Screen.AuthGraph.route

    init {
        checkAuth()
        observeAuthSession()
        observeIncomingCalls()
        observeForegroundNotifications()
    }

    private fun checkAuth() {
        viewModelScope.launch {
            authenticatedDestination = resolveAuthenticatedDestination()
            _startDestination.value = if (onboardingPreferences.isCompleted()) {
                authenticatedDestination
            } else {
                Screen.Onboarding.route
            }
            _isLoading.value = false
        }
    }

    private suspend fun resolveAuthenticatedDestination(): String {
        val token = sessionManager.getTokenOnce()
        if (!token.isNullOrEmpty() && sessionManager.isCurrentTokenExpired()) {
            sessionManager.clearSession(SessionInvalidationReason.TOKEN_EXPIRED)
            return Screen.AuthGraph.route
        }

        return if (!token.isNullOrEmpty()) {
            if (onboardingPreferences.isCompleted()) {
                syncFcmToken()
            }
            socketManager.connect()
            Screen.Dashboard.route
        } else {
            Screen.AuthGraph.route
        }
    }

    private fun syncFcmToken() {
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { fcmToken ->
                    if (!fcmToken.isNullOrBlank()) {
                        viewModelScope.launch {
                            notificationRepository.registerDeviceToken(fcmToken)
                        }
                    }
                }
        } catch (_: RuntimeException) {
            // FCM is optional until Firebase credentials are configured for this app.
        }
    }

    private fun observeAuthSession() {
        viewModelScope.launch {
            sessionManager.isLoggedIn.collectLatest { loggedIn ->
                authenticatedDestination = if (loggedIn) Screen.Dashboard.route else Screen.AuthGraph.route
                if (loggedIn) {
                    socketManager.connect()
                } else {
                    socketManager.disconnect()
                }
                if (onboardingPreferences.isCompleted()) {
                    _startDestination.value = authenticatedDestination
                }
            }
        }
    }

    fun completeOnboarding(): String {
        onboardingPreferences.markCompleted()
        _startDestination.value = authenticatedDestination
        if (authenticatedDestination == Screen.Dashboard.route) {
            syncFcmToken()
        }
        return authenticatedDestination
    }

    fun logout() {
        viewModelScope.launch {
            sessionManager.clearSession()
            authenticatedDestination = Screen.AuthGraph.route
            _startDestination.value = Screen.AuthGraph.route
        }
    }

    fun consumeSessionInvalidationNotice() {
        sessionManager.consumeSessionInvalidationReason()
    }

    private fun observeIncomingCalls() {
        viewModelScope.launch {
            socketManager.callSignals.collect { signal ->
                if (signal.event != "call:incoming" || signal.callToken.isNullOrBlank()) return@collect
                callInviteStore.put(signal)
                _incomingCallInvites.emit(signal)
            }
        }
    }

    private fun observeForegroundNotifications() {
        viewModelScope.launch {
            socketManager.notificationEvents.collect { event ->
                val category = event.category.lowercase()
                val priority = event.priority.lowercase()
                val shouldShow = category == "message" ||
                    (category == "activity" && priority in setOf("high", "urgent"))
                if (shouldShow) {
                    _foregroundNotifications.emit(event)
                }
            }
        }
    }
}
