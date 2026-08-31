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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.tembus.courier.R
import com.tembus.courier.data.model.Order
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
 * Side-effect handlers and action functions extracted from MainScreen.kt on 2026-08-30.
 * Implemented as top-level functions to avoid circular reference issues with @Composable init.
 * 
 * Usage: call directly with required params, or via rememberMainScreenActionState() for launcher state.
 */

@Composable
fun rememberMainScreenActionState(
    context: Context = LocalContext.current,
    scope: CoroutineScope = rememberCoroutineScope(),
): MainScreenActionState {
    var pendingOnlineAfterForegroundPermission by remember { mutableStateOf(false) }
    var pendingDutySecurityTarget by remember { mutableStateOf<Boolean?>(null) }
    var showForegroundLocationPermissionDialog by remember { mutableStateOf(false) }
    var showBackgroundLocationPermissionDialog by remember { mutableStateOf(false) }

    val foregroundLocationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val granted = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true ||
            hasForegroundLocationPermission(context)
        pendingOnlineAfterForegroundPermission = false
        if (!granted) {
            scope.launch {
                // Snackbar shown by caller
            }
        }
    }

    val backgroundLocationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        scope.launch {
            // Snackbar shown by caller
        }
    }

    return remember(context) {
        MainScreenActionState(
            context = context,
            scope = scope,
            pendingOnlineAfterForegroundPermission = { pendingOnlineAfterForegroundPermission },
            setPendingOnlineAfterForegroundPermission = { pendingOnlineAfterForegroundPermission = it },
            pendingDutySecurityTarget = { pendingDutySecurityTarget },
            setPendingDutySecurityTarget = { pendingDutySecurityTarget = it },
            showForegroundLocationPermissionDialog = { showForegroundLocationPermissionDialog },
            setShowForegroundLocationPermissionDialog = { showForegroundLocationPermissionDialog = it },
            showBackgroundLocationPermissionDialog = { showBackgroundLocationPermissionDialog },
            setShowBackgroundLocationPermissionDialog = { showBackgroundLocationPermissionDialog = it },
            foregroundLocationPermissionLauncher = foregroundLocationPermissionLauncher,
            backgroundLocationPermissionLauncher = backgroundLocationPermissionLauncher,
        )
    }
}

class MainScreenActionState(
    val context: Context,
    val scope: CoroutineScope,
    val pendingOnlineAfterForegroundPermission: () -> Boolean,
    val setPendingOnlineAfterForegroundPermission: (Boolean) -> Unit,
    val pendingDutySecurityTarget: () -> Boolean?,
    val setPendingDutySecurityTarget: (Boolean?) -> Unit,
    val showForegroundLocationPermissionDialog: () -> Boolean,
    val setShowForegroundLocationPermissionDialog: (Boolean) -> Unit,
    val showBackgroundLocationPermissionDialog: () -> Boolean,
    val setShowBackgroundLocationPermissionDialog: (Boolean) -> Unit,
    val foregroundLocationPermissionLauncher: ActivityResultLauncher<Array<String>>,
    val backgroundLocationPermissionLauncher: ActivityResultLauncher<String>,
) {
    suspend fun sendSafetyEvent(
        snackbarHostState: SnackbarHostState,
        orderViewModel: OrderViewModel,
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

    suspend fun performDutyToggle(
        snackbarHostState: SnackbarHostState,
        orderViewModel: OrderViewModel,
        authSessionManager: AuthSessionManager,
        allOrders: List<Order>,
        online: Boolean
    ) {
        if (!online) {
            val hasActiveJobs = allOrders.any { it.status != "delivered" && it.status != "failed" }
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

    fun requestDutyToggle(
        snackbarHostState: SnackbarHostState,
        online: Boolean,
        localSecuritySettings: LocalDeviceSecuritySettings,
        pendingDutySecurityTarget: MutableState<Boolean?>,
        allOrders: List<Order>,
        orderViewModel: OrderViewModel,
        authSessionManager: AuthSessionManager,
    ) {
        if (online && !hasForegroundLocationPermission(context)) {
            setPendingOnlineAfterForegroundPermission(true)
            setShowForegroundLocationPermissionDialog(true)
            return
        }

        if (online && localSecuritySettings.active) {
            setPendingDutySecurityTarget(true)
        } else {
            scope.launch { performDutyToggle(snackbarHostState, orderViewModel, authSessionManager, allOrders, online) }
        }
    }

    // Route functions — delegate state mutations to caller via callbacks
    fun openFaceVerify(routeStateSetter: (CourierRouteState) -> Unit, orderSetter: (Order?) -> Unit, order: Order) {
        orderSetter(order)
        routeStateSetter(CourierRouteReducer.faceVerify(order.orderId))
    }

    fun openServiceFaceVerify(routeStateSetter: (CourierRouteState) -> Unit, orderId: String, serviceType: String) {
        routeStateSetter(CourierRouteReducer.faceVerify(orderId, returnToServiceType = serviceType))
    }

    fun openOrderDetail(routeStateSetter: (CourierRouteState) -> Unit, orderSetter: (Order?) -> Unit, order: Order) {
        orderSetter(order)
        routeStateSetter(CourierRouteReducer.detail(order.orderId))
    }

    fun openChat(routeStateSetter: (CourierRouteState) -> Unit, orderSetter: (Order?) -> Unit, order: Order) {
        orderSetter(order)
        routeStateSetter(CourierRouteReducer.chat(order.orderId))
    }

    fun openCall(routeStateSetter: (CourierRouteState) -> Unit, orderSetter: (Order?) -> Unit, order: Order, callId: String? = null) {
        orderSetter(order)
        routeStateSetter(CourierRouteReducer.call(order.orderId, callId, order.communicationCallTargetType()))
    }

    fun openScan(routeStateSetter: (CourierRouteState) -> Unit, orderSetter: (Order?) -> Unit, order: Order?, scanType: String = CourierProofTypes.PICKUP_SCAN) {
        orderSetter(order)
        routeStateSetter(CourierRouteReducer.scan(order?.orderId, scanType))
    }

    fun openProof(routeStateSetter: (CourierRouteState) -> Unit, orderSetter: (Order?) -> Unit, order: Order, proofMode: String) {
        orderSetter(order)
        routeStateSetter(CourierRouteReducer.proof(order.orderId, proofMode))
    }

    fun closeRoute(routeStateSetter: (CourierRouteState) -> Unit, orderSetter: (Order?) -> Unit) {
        orderSetter(null)
        routeStateSetter(CourierRouteReducer.home())
    }

    fun backToOrderOrHome(
        routeStateSetter: (CourierRouteState) -> Unit,
        orderSetter: (Order?) -> Unit,
        currentRouteState: CourierRouteState
    ) {
        val newRoute = CourierRouteReducer.backFromChild(currentRouteState)
        routeStateSetter(newRoute)
        if (newRoute.screen == CourierRouteScreen.HOME) {
            orderSetter(null)
        }
    }
}