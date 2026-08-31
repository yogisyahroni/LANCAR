package com.tembus.courier.ui.screens

import android.content.Context
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import com.tembus.courier.R
import com.tembus.courier.data.model.CourierProfile
import com.tembus.courier.data.model.Order
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.security.LocalDeviceSecuritySettings
import com.tembus.courier.data.security.LocalDeviceSecurityManager
import com.tembus.courier.data.session.AuthSessionManager
import com.tembus.courier.domain.CourierRouteState
import com.tembus.courier.ui.screens.order.OrderViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import com.tembus.courier.domain.CourierRouteReducer
import com.tembus.courier.data.model.CourierPerformanceSummary
import com.tembus.courier.data.model.CourierCapabilityProfile

/**
 * ProfileContent parameter builder extracted from MainScreen.kt on 2026-08-30.
 * Eliminates duplicate ProfileContent parameter list (was repeated in tab 2 non-on-demand + tab 3).
 * Safe incremental extraction — pure function, zero side effects.
 *
 * Returns profileContentParams lambda ready spread into ProfileContent composable.
 */
data class ProfileContentParams(
    val courierProfile: CourierProfile?,
    val courierName: String,
    val courierRole: String,
    val localSecurityManager: LocalDeviceSecurityManager,
    val pendingSyncCount: Int,
    val todayEarningsIdr: Int,
    val totalEarningsIdr: Int,
    val performanceSummary: CourierPerformanceSummary?,
    val capabilityProfile: CourierCapabilityProfile?,
    val authToken: String?,
    val onCompleteTraining: () -> Unit,
    val onLogout: () -> Unit,
    val onSyncNow: () -> Unit,
    val onOptimizeBattery: () -> Unit,
    val onClearCache: () -> Unit,
    val onUpdateCapacity: (Double?, Int?) -> Unit,
    val onRequestServiceUpgrade: () -> Unit,
    val onUpdateRadius: (Int) -> Unit,
)

@Composable
fun buildProfileContentParams(
    context: Context,
    scope: CoroutineScope,
    snackbarHostState: SnackbarHostState,
    courierName: String,
    courierRole: String,
    courierProfile: CourierProfile?,
    localSecurityManager: LocalDeviceSecurityManager,
    roleOrders: List<Order>,
    allOrders: List<Order>,
    roleEarningsToday: Int,
    performanceSummary: CourierPerformanceSummary?,
    capabilityProfile: CourierCapabilityProfile?,
    authSessionManager: AuthSessionManager,
    orderViewModel: OrderViewModel,
    localSecuritySettings: LocalDeviceSecuritySettings,
    showLogoutDialog: MutableState<Boolean>,
    onRouteStateChange: (CourierRouteState) -> Unit,
): ProfileContentParams {
    return ProfileContentParams(
        courierProfile = courierProfile,
        courierName = courierName,
        courierRole = courierRole,
        localSecurityManager = localSecurityManager,
        pendingSyncCount = roleOrders.size,
        todayEarningsIdr = roleEarningsToday,
        totalEarningsIdr = courierProfile?.totalEarningsIdr ?: allOrders.sumOf { it.cleanPayoutIdr() },
        performanceSummary = performanceSummary,
        capabilityProfile = capabilityProfile,
        authToken = authSessionManager.getAuthTokenSync(),
        onCompleteTraining = {
            scope.launch {
                val result = orderViewModel.completeTraining()
                snackbarHostState.showSnackbar(result.getOrElse { it.message ?: "Training belum tersimpan." })
            }
        },
        onLogout = { showLogoutDialog.value = true },
        onSyncNow = { orderViewModel.syncPendingOrders() },
        onOptimizeBattery = {
            (context as? com.tembus.courier.ui.MainActivity)?.checkAndRequestBatteryWhitelist()
        },
        onClearCache = {
            try {
                val deleted = context.cacheDir.deleteRecursively()
                scope.launch {
                    snackbarHostState.showSnackbar(
                        if (deleted) "Optimalisasi: Berhasil membersihkan berkas cache."
                        else "Beberapa cache sedang digunakan dan dilewati."
                    )
                }
            } catch (e: Exception) {
                scope.launch { snackbarHostState.showSnackbar("Gagal merestart cache.") }
            }
        },
        onUpdateCapacity = { maxWeightKg, maxPackages ->
            scope.launch {
                val result = orderViewModel.updateCourierCapacity(maxWeightKg, maxPackages)
                snackbarHostState.showSnackbar(result.getOrElse { it.message ?: "Gagal update kapasitas" }.toString())
            }
        },
        onRequestServiceUpgrade = { onRouteStateChange(CourierRouteReducer.serviceUpgrade()) },
        onUpdateRadius = { radiusKm ->
            scope.launch {
                val result = orderViewModel.updateCourierRadius(radiusKm)
                snackbarHostState.showSnackbar(
                    result.fold(
                        onSuccess = { "Radius diubah ke $radiusKm km" },
                        onFailure = { it.message ?: "Gagal update radius" }
                    )
                )
            }
        }
    )
}

internal fun cleanPayoutIdrSum(allOrders: List<Order>): Int = allOrders.sumOf { it.cleanPayoutIdr() }