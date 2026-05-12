package com.lancar.customer.data.repository

import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class FCMTokenRepository @Inject constructor() {
    fun updateToken(token: String, appVersion: String = "1.0") {
        // TODO: Call API to update FCM token
    }
}
