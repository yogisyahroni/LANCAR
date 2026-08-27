package com.tembus.courier.notification

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

internal object FcmTopicManager {
    private const val TAG = "FcmTopicManager"
    private const val TOPIC_COURIER_ALL = "courier_all"
    private const val TOPIC_COURIER_ONLINE = "courier_online"

    suspend fun sync(isOnline: Boolean) {
        val messaging = FirebaseMessaging.getInstance()
        messaging.subscribeToTopic(TOPIC_COURIER_ALL).await()
        Log.d(TAG, "subscribed topic=$TOPIC_COURIER_ALL")
        if (isOnline) {
            messaging.subscribeToTopic(TOPIC_COURIER_ONLINE).await()
            Log.d(TAG, "subscribed topic=$TOPIC_COURIER_ONLINE (online)")
        } else {
            messaging.unsubscribeFromTopic(TOPIC_COURIER_ONLINE).await()
            Log.d(TAG, "unsubscribed topic=$TOPIC_COURIER_ONLINE (offline)")
        }
    }

    suspend fun clear() {
        val messaging = FirebaseMessaging.getInstance()
        messaging.unsubscribeFromTopic(TOPIC_COURIER_ONLINE).await()
        messaging.unsubscribeFromTopic(TOPIC_COURIER_ALL).await()
        Log.d(TAG, "cleared courier topics")
    }
}
