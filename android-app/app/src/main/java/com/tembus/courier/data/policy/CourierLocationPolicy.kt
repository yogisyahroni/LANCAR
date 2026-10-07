package com.tembus.courier.data.policy

/**
 * Keeps location collection proportional to the courier's operational stage.
 * The backend still owns the authoritative courier heartbeat; this policy only
 * controls how often the device samples and uploads a meaningful position.
 */
enum class CourierLocationStage {
    IDLE_ON_DUTY,
    PENDING_OFFER,
    GOING_TO_PICKUP,
    AT_PICKUP,
    IN_TRANSIT,
    AT_DROPOFF
}

data class CourierLocationProfile(
    val intervalMillis: Long,
    val fastestIntervalMillis: Long,
    val minDistanceMeters: Float,
    val highAccuracy: Boolean
)

private val pendingOfferStatuses = setOf("pending_offer", "offer", "offered")
private val goingToPickupStatuses = setOf(
    "accepted",
    "assigned",
    "going_to_pickup",
    "pickup_pending",
    "service_started",
    "loading"
)
private val atPickupStatuses = setOf("arrived_pickup", "arrived_at_pickup")
private val inTransitStatuses = setOf("picked_up", "in_transit", "in_progress", "unloading")
private val atDropoffStatuses = setOf("arrived_dropoff", "arrived_at_dropoff")

fun resolveCourierLocationStage(statuses: Iterable<String>): CourierLocationStage {
    val normalized = statuses.map { it.trim().lowercase() }.toSet()
    return when {
        normalized.any { it in inTransitStatuses } -> CourierLocationStage.IN_TRANSIT
        normalized.any { it in goingToPickupStatuses } -> CourierLocationStage.GOING_TO_PICKUP
        normalized.any { it in atPickupStatuses } -> CourierLocationStage.AT_PICKUP
        normalized.any { it in atDropoffStatuses } -> CourierLocationStage.AT_DROPOFF
        normalized.any { it in pendingOfferStatuses } -> CourierLocationStage.PENDING_OFFER
        else -> CourierLocationStage.IDLE_ON_DUTY
    }
}

fun courierLocationProfile(stage: CourierLocationStage): CourierLocationProfile = when (stage) {
    CourierLocationStage.IDLE_ON_DUTY,
    CourierLocationStage.PENDING_OFFER -> CourierLocationProfile(
        intervalMillis = 60_000L,
        fastestIntervalMillis = 30_000L,
        minDistanceMeters = 100f,
        highAccuracy = false
    )

    CourierLocationStage.GOING_TO_PICKUP,
    CourierLocationStage.IN_TRANSIT -> CourierLocationProfile(
        intervalMillis = 30_000L,
        fastestIntervalMillis = 15_000L,
        minDistanceMeters = 30f,
        highAccuracy = true
    )

    CourierLocationStage.AT_PICKUP -> CourierLocationProfile(
        intervalMillis = 60_000L,
        fastestIntervalMillis = 30_000L,
        minDistanceMeters = 75f,
        highAccuracy = false
    )

    CourierLocationStage.AT_DROPOFF -> CourierLocationProfile(
        intervalMillis = 45_000L,
        fastestIntervalMillis = 20_000L,
        minDistanceMeters = 50f,
        highAccuracy = true
    )
}
