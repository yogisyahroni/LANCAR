package com.tembus.courier.ui.screens.notification

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.api.TEMBUSApiService
import com.tembus.courier.data.model.AppNotification
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class NotificationViewModel @Inject constructor(
    private val apiService: TEMBUSApiService
) : ViewModel() {

    private val _notifications = MutableStateFlow<List<AppNotification>>(emptyList())
    val notifications: StateFlow<List<AppNotification>> = _notifications.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    
    private val _unreadCount = MutableStateFlow(0)
    val unreadCount: StateFlow<Int> = _unreadCount.asStateFlow()

    init {
        fetchNotifications()
        fetchUnreadCount()
    }

    fun fetchNotifications() {
        viewModelScope.launch {
            _isLoading.update { true }
            _error.update { null }
            try {
                val response = apiService.getNotifications(limit = 50)
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    _notifications.update { body.data ?: emptyList() }
                } else {
                    _error.update { body?.message ?: "Gagal memuat notifikasi" }
                }
            } catch (e: Exception) {
                _error.update { e.message ?: "Terjadi kesalahan koneksi" }
            } finally {
                _isLoading.update { false }
            }
        }
    }
    
    fun fetchUnreadCount() {
        viewModelScope.launch {
            try {
                val response = apiService.getUnreadNotificationCount()
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    _unreadCount.update { body.data?.total ?: 0 }
                }
            } catch (e: Exception) {
                // Silently fail for unread count
            }
        }
    }

    fun markAllAsRead() {
        viewModelScope.launch {
            try {
                val response = apiService.markAllNotificationsRead()
                if (response.isSuccessful && response.body()?.success == true) {
                    _notifications.update { current ->
                        current.map { it.copy(isRead = true) }
                    }
                    _unreadCount.update { 0 }
                }
            } catch (e: Exception) {
                // Ignore failure
            }
        }
    }
}
