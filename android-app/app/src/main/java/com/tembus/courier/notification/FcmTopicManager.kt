package com.tembus.courier.notification

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

internal object FcmTopicManager {
    private const val TAG = "FcmTopicManager"
    private const val TOPIC_COURIER_ALL = "courier_all"
    private const val TOPIC_COURIER_ONLINE = "courier_online"
    private var subscribedZoneTopic: String? = null

    suspend fun sync(isOnline: Boolean, zoneId: String? = null) {
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

        val normalizedZoneId = zoneId?.trim()?.takeIf { it.isNotEmpty() }
        val nextZoneTopic = normalizedZoneId?.let { "courier_zone_$it" }
        if (subscribedZoneTopic != null && subscribedZoneTopic != nextZoneTopic) {
            messaging.unsubscribeFromTopic(subscribedZoneTopic!!).await()
            Log.d(TAG, "unsubscribed topic=${subscribedZoneTopic!!}")
        }
        if (nextZoneTopic != null) {
            messaging.subscribeToTopic(nextZoneTopic).await()
            Log.d(TAG, "subscribed topic=$nextZoneTopic")
        }
        subscribedZoneTopic = nextZoneTopic
    }

    suspend fun clear() {
        val messaging = FirebaseMessaging.getInstance()
        messaging.unsubscribeFromTopic(TOPIC_COURIER_ONLINE).await()
        messaging.unsubscribeFromTopic(TOPIC_COURIER_ALL).await()
        subscribedZoneTopic?.let { messaging.unsubscribeFromTopic(it).await() }
        subscribedZoneTopic = null
        Log.d(TAG, "cleared courier topics")
    }
}
