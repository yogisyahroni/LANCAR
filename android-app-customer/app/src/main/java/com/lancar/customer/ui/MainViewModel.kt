package com.lancar.customer.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.messaging.FirebaseMessaging
import com.lancar.customer.data.repository.NotificationRepository
import com.lancar.customer.data.session.AuthSessionManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    private val sessionManager: AuthSessionManager,
    private val notificationRepository: NotificationRepository
) : ViewModel() {

    private val _isLoading = MutableStateFlow(true)
    val isLoading = _isLoading.asStateFlow()

    private val _startDestination = MutableStateFlow<String>("auth_graph")
    val startDestination = _startDestination.asStateFlow()

    init {
        checkAuth()
    }

    private fun checkAuth() {
        viewModelScope.launch {
            val token = sessionManager.getTokenOnce()
            if (!token.isNullOrEmpty()) {
                _startDestination.value = "dashboard"
                syncFcmToken()
            }
            _isLoading.value = false
        }
    }

    private fun syncFcmToken() {
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { fcmToken ->
                if (!fcmToken.isNullOrBlank()) {
                    viewModelScope.launch {
                        notificationRepository.registerDeviceToken(fcmToken)
                    }
                }
            }
    }

    fun logout() {
        viewModelScope.launch {
            sessionManager.clearSession()
            _startDestination.value = "auth_graph"
        }
    }
}
