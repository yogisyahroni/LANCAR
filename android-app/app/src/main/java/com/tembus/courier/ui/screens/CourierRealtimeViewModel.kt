package com.tembus.courier.ui.screens

import androidx.lifecycle.ViewModel
import com.tembus.courier.util.SocketManager
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

/** Owns the dashboard-scoped authenticated realtime connection. */
@HiltViewModel
class CourierRealtimeViewModel @Inject constructor(
    private val socketManager: SocketManager,
) : ViewModel() {
    init {
        socketManager.connectForMainScreen()
    }

    override fun onCleared() {
        socketManager.releaseMainScreenConnection()
        super.onCleared()
    }
}
