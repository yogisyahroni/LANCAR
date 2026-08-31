package com.tembus.courier.ui.screens

import android.Manifest
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.ActivityResultLauncher
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.tembus.courier.R
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.data.security.LocalDeviceSecuritySettings
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.domain.CourierProofTypes
import com.tembus.courier.domain.CourierRouteReducer
import com.tembus.courier.domain.CourierRouteScreen
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.service.LocationTrackerService
import com.tembus.courier.ui.screens.order.OrderViewModel
import com.tembus.courier.util.SecurityUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.io.File

/**
 * Helper actions and effect handlers extracted from MainScreen.kt on 2026-08-30.
 * Handles duty toggle, safety events, and location permission flows.
 *
 * Reduces MainScreen.kt orchestrator to under 400 lines.
 */

@Composable
fun rememberMainScreenActions(
    context: Context = LocalContext.current,
    scope: CoroutineScope = androidx.compose.runtime.rememberCoroutineScope(),
    snackbarHostState: SnackbarHostState,
    orderViewModel: OrderViewModel,
    authSessionManager: AuthSessionManager,
    localSecuritySettings: LocalDeviceSecuritySettings,
    onOnlineToggleRequested: (Boolean, Boolean) -> Unit,
    onRouteStateChange: (com.tembus.courier.domain.CourierRouteState) -> Unit,
    onSelectedOrderChange: (Order?) -> Unit,
    onTabChange: (Int) -> Unit,
    showForegroundLocationPermissionDialogState: androidx.compose.runtime.MutableState<Boolean>,
    showBackgroundLocationPermissionDialogState: androidx.compose.runtime.MutableState<Boolean>,
): MainScreenActions {
    val foregroundLocationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
            hasForegroundLocationPermission(context)
        if (granted) {
            onOnlineToggleRequested(true, false)
        } else {
            showForegroundLocationPermissionDialogState.value = true
        }
    }

    val backgroundLocationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        scope.launch {
            snackbarHostState.showSnackbar(
                if (granted || hasBackgroundLocationPermission(context)) {
                    "Tracking background aktif untuk pekerjaan berjalan."
                } else {
                    "Tracking tetap berjalan saat aplikasi terbuka. Aktifkan background location dari pengaturan untuk mode operasional penuh."
                }
            )
        }
    }

    return remember(context, snackbarHostState, orderViewModel, authSessionManager) {
        MainScreenActions(
            context = context,
            scope = scope,
            snackbarHostState = snackbarHostState,
            orderViewModel = orderViewModel,
            authSessionManager = authSessionManager,
            localSecuritySettings = localSecuritySettings,
            onOnlineToggleRequested = onOnlineToggleRequested,
            onRouteStateChange = onRouteStateChange,
            onSelectedOrderChange = onSelectedOrderChange,
            onTabChange = onTabChange,
            foregroundLocationPermissionLauncher = foregroundLocationPermissionLauncher,
            backgroundLocationPermissionLauncher = backgroundLocationPermissionLauncher,
            showForegroundLocationPermissionDialogState = showForegroundLocationPermissionDialogState,
            showBackgroundLocationPermissionDialogState = showBackgroundLocationPermissionDialogState,
        )
    }
}

/**
 * Holds actions and effect handlers for MainScreen.
 * Extracted to reduce MainScreen.kt orchestrator complexity.
 */
class MainScreenActions(
    val context: Context,
    val scope: CoroutineScope,
    val snackbarHostState: SnackbarHostState,
    val orderViewModel: OrderViewModel,
    val authSessionManager: AuthSessionManager,
    val localSecuritySettings: LocalDeviceSecuritySettings,
    val onOnlineToggleRequested: (Boolean, Boolean) -> Unit,
    val onRouteStateChange: (com.tembus.courier.domain.CourierRouteState) -> Unit,
    val onSelectedOrderChange: (Order?) -> Unit,
    val onTabChange: (Int) -> Unit,
    val foregroundLocationPermissionLauncher: androidx.activity.result.ActivityResultLauncher<Array<String>>,
    val backgroundLocationPermissionLauncher: androidx.activity.result.ActivityResultLauncher<String>,
    val showForegroundLocationPermissionDialogState: androidx.compose.runtime.MutableState<Boolean>,
    val showBackgroundLocationPermissionDialogState: androidx.compose.runtime.MutableState<Boolean>,
) {
    suspend fun sendSafetyEvent(
        order: Order?,
        eventType: String,
        severity: String,
        message: String,
        photoFile: File? = null
    ) {
        val location = getLastKnownDutyLocation(context)
        val result = orderViewModel.createSafetyEvent(
            orderId = order?.orderId,
            eventType = eventType,
            severity = severity,
            latitude = location?.latitude,
            longitude = location?.longitude,
            accuracy = location?.accuracy,
            message = message,
            photoFile = photoFile
        )
        snackbarHostState.showSnackbar(
            result.getOrElse { it.message ?: "Laporan belum terkirim. Coba lagi." }
        )
    }

    suspend fun performDutyToggle(online: Boolean, pendingOnlineAfterForegroundPermission: Boolean) {
        if (!online) {
            val hasActiveJobs = orderViewModel.allOrders.value.any {
                it.status != "delivered" && it.status != "failed"
            }
            if (hasActiveJobs) {
                snackbarHostState.showSnackbar("Peringatan: Selesaikan semua tugas pengiriman sebelum nonaktif.")
                return
            }
        }

        try {
            if (online) {
                val isRooted = SecurityUtils.isDeviceRooted(context)
                if (isRooted) {
                    snackbarHostState.showSnackbar("Akses ditolak: perangkat terdeteksi rooted.")
                    return
                }

                val location = getLastKnownDutyLocation(context)
                if (location == null) {
                    snackbarHostState.showSnackbar("Lokasi perangkat sedang dikunci.")
                    return
                }

                val dutyResult = orderViewModel.updateDutyStatus(
                    online = true,
                    latitude = location.latitude,
                    longitude = location.longitude,
                    accuracy = location.accuracy
                )
                dutyResult.onFailure { e ->
                    snackbarHostState.showSnackbar(e.message ?: "Lokasi belum memenuhi area operasional aktif.")
                    return
                }

                authSessionManager.setOnlineStatus(true)
                val intent = LocationTrackerService.startIntent(context)
                ContextCompat.startForegroundService(context, intent)
                snackbarHostState.showSnackbar("Status aktif. Tracking operasional berjalan.")

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackgroundLocationPermission(context)) {
                    showBackgroundLocationPermissionDialogState.value = true
                }
            } else {
                val dutyResult = orderViewModel.updateDutyStatus(online = false)
                dutyResult.onFailure { e ->
                    snackbarHostState.showSnackbar(e.message ?: "Gagal memperbarui status Off Duty.")
                    return
                }

                authSessionManager.setOnlineStatus(false)
                context.stopService(LocationTrackerService.stopIntent(context))
                snackbarHostState.showSnackbar("Status nonaktif. Tracking berhenti.")
            }
        } catch (e: Exception) {
            snackbarHostState.showSnackbar("Gagal memperbarui status tracking.")
        }
    }

    fun openFaceVerify(order: Order) {
        onSelectedOrderChange(order)
        onRouteStateChange(CourierRouteReducer.faceVerify(order.orderId))
    }

    fun openServiceFaceVerify(orderId: String, serviceType: String) {
        onRouteStateChange(CourierRouteReducer.faceVerify(orderId, returnToServiceType = serviceType))
    }

    fun openOrderDetail(order: Order) {
        onSelectedOrderChange(order)
        onRouteStateChange(CourierRouteReducer.detail(order.orderId))
    }

    fun openChat(order: Order) {
        onSelectedOrderChange(order)
        onRouteStateChange(CourierRouteReducer.chat(order.orderId))
    }

    fun openCall(order: Order, callId: String? = null) {
        onSelectedOrderChange(order)
        onRouteStateChange(CourierRouteReducer.call(order.orderId, callId, order.communicationCallTargetType()))
    }

    fun openScan(order: Order?, scanType: String = CourierProofTypes.PICKUP_SCAN) {
        onSelectedOrderChange(order)
        onRouteStateChange(CourierRouteReducer.scan(order?.orderId, scanType))
    }

    fun openProof(order: Order, proofMode: String) {
        onSelectedOrderChange(order)
        onRouteStateChange(CourierRouteReducer.proof(order.orderId, proofMode))
    }

    fun closeRoute() {
        onSelectedOrderChange(null)
        onRouteStateChange(CourierRouteReducer.home())
    }

    fun backToOrderOrHome(currentRouteState: com.tembus.courier.domain.CourierRouteState) {
        val newRoute = CourierRouteReducer.backFromChild(currentRouteState)
        onRouteStateChange(newRoute)
        if (newRoute.screen == com.tembus.courier.domain.CourierRouteScreen.HOME) {
            onSelectedOrderChange(null)
        }
    }

    fun requestDutyToggle(online: Boolean, pendingOnlineAfterForegroundPermission: MutableState<Boolean>, pendingDutySecurityTarget: MutableState<Boolean?>) {
        if (online && !hasForegroundLocationPermission(context)) {
            pendingOnlineAfterForegroundPermission.value = true
            showForegroundLocationPermissionDialogState.value = true
            return
        }

        if (online && localSecuritySettings.active) {
            pendingDutySecurityTarget.value = true
        } else {
            scope.launch { performDutyToggle(online, pendingOnlineAfterForegroundPermission.value) }
        }
    }
}