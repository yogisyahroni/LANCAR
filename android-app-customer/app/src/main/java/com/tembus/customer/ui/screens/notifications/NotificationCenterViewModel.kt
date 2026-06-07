package com.tembus.customer.ui.screens.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.NotificationData
import com.tembus.customer.data.model.NotificationUnreadCount
import com.tembus.customer.data.repository.NotificationRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NotificationCenterUiState(
    val isLoading: Boolean = true,
    val selectedCategory: String? = null,
    val notifications: List<NotificationData> = emptyList(),
    val unreadCount: NotificationUnreadCount = NotificationUnreadCount(),
    val error: String? = null
)

@HiltViewModel
class NotificationCenterViewModel @Inject constructor(
    private val notificationRepository: NotificationRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(NotificationCenterUiState())
    val uiState: StateFlow<NotificationCenterUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun selectCategory(category: String?) {
        _uiState.update { it.copy(selectedCategory = category, isLoading = true, error = null) }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val category = _uiState.value.selectedCategory
            _uiState.update { it.copy(isLoading = true, error = null) }

            val notificationsResult = notificationRepository.getNotifications(category)
            val unreadResult = notificationRepository.getUnreadCount()

            _uiState.update { current ->
                current.copy(
                    isLoading = false,
                    notifications = notificationsResult.getOrElse { current.notifications },
                    unreadCount = unreadResult.getOrElse { current.unreadCount },
                    error = notificationsResult.exceptionOrNull()?.message ?: unreadResult.exceptionOrNull()?.message
                )
            }
        }
    }

    fun markRead(notification: NotificationData) {
        if (notification.isRead) return
        viewModelScope.launch {
            _uiState.update { current ->
                current.copy(
                    notifications = current.notifications.map {
                        if (it.id == notification.id) it.copy(isRead = true) else it
                    }
                )
            }
            notificationRepository.markRead(notification.id)
            notificationRepository.getUnreadCount().onSuccess { count ->
                _uiState.update { it.copy(unreadCount = count) }
            }
        }
    }

    fun markAllRead() {
        viewModelScope.launch {
            val category = _uiState.value.selectedCategory
            notificationRepository.markAllRead(category).onSuccess {
                _uiState.update { current ->
                    current.copy(notifications = current.notifications.map { it.copy(isRead = true) })
                }
                notificationRepository.getUnreadCount().onSuccess { count ->
                    _uiState.update { it.copy(unreadCount = count) }
                }
            }.onFailure { error ->
                _uiState.update { it.copy(error = error.message) }
            }
        }
    }

    fun archive(notification: NotificationData) {
        viewModelScope.launch {
            _uiState.update { current ->
                current.copy(notifications = current.notifications.filterNot { it.id == notification.id })
            }
            notificationRepository.archive(notification.id)
            notificationRepository.getUnreadCount().onSuccess { count ->
                _uiState.update { it.copy(unreadCount = count) }
            }
        }
    }
}
