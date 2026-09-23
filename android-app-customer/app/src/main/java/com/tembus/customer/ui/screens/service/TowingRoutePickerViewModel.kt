package com.tembus.customer.ui.screens.service

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.LocationPayload
import com.tembus.customer.data.model.MapsGeocodeResult
import com.tembus.customer.data.model.MapsProviderConfig
import com.tembus.customer.data.repository.OrderRepository
import com.tembus.customer.ui.components.maps.LatLng
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class TowingRouteTarget {
    PICKUP,
    DROPOFF,
}

data class TowingRoutePoint(
    val label: String,
    val latitude: Double,
    val longitude: Double,
) {
    fun asLatLng(): LatLng = LatLng(latitude, longitude)
}

data class TowingRouteSelection(
    val pickup: TowingRoutePoint? = null,
    val dropoff: TowingRoutePoint? = null,
)

data class TowingRoutePickerUiState(
    val activeTarget: TowingRouteTarget = TowingRouteTarget.PICKUP,
    val pickup: TowingRoutePoint? = null,
    val dropoff: TowingRoutePoint? = null,
    val searchQuery: String = "",
    val searchResults: List<MapsGeocodeResult> = emptyList(),
    val mapsProviderConfig: MapsProviderConfig? = null,
    val isLoading: Boolean = false,
    val isResolvingPoint: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class TowingRoutePickerViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TowingRoutePickerUiState())
    val uiState: StateFlow<TowingRoutePickerUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            orderRepository.getMapsProviderConfig()
                .onSuccess { config -> _uiState.update { it.copy(mapsProviderConfig = config) } }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(error = error.localizedMessage ?: "Konfigurasi peta belum tersedia")
                    }
                }
        }
    }

    fun setActiveTarget(target: TowingRouteTarget) {
        _uiState.update {
            it.copy(
                activeTarget = target,
                searchQuery = "",
                searchResults = emptyList(),
                error = null,
            )
        }
    }

    fun updateSearchQuery(query: String) {
        _uiState.update {
            it.copy(
                searchQuery = query,
                searchResults = if (query.trim().length < 3) emptyList() else it.searchResults,
                error = null,
            )
        }
    }

    fun searchAddress() {
        val query = _uiState.value.searchQuery.trim()
        if (query.length < 3) {
            _uiState.update { it.copy(error = "Ketik minimal 3 karakter alamat") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, searchResults = emptyList()) }
            orderRepository.geocodeAddress(query)
                .onSuccess { results ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            searchResults = results,
                            error = if (results.isEmpty()) "Alamat tidak ditemukan. Coba kata kunci lain." else null,
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            searchResults = emptyList(),
                            error = error.localizedMessage ?: "Gagal mencari alamat",
                        )
                    }
                }
        }
    }

    fun selectSearchResult(result: MapsGeocodeResult) {
        if (!isUsablePoint(result.latitude, result.longitude)) {
            _uiState.update { it.copy(error = "Hasil alamat tidak memiliki titik koordinat valid") }
            return
        }
        assignPoint(
            target = _uiState.value.activeTarget,
            point = TowingRoutePoint(
                label = result.label.ifBlank { "Titik terpilih" },
                latitude = result.latitude,
                longitude = result.longitude,
            ),
        )
    }

    fun selectMapPoint(location: LatLng) {
        if (!isUsablePoint(location.latitude, location.longitude)) {
            _uiState.update { it.copy(error = "Titik peta tidak valid") }
            return
        }

        val target = _uiState.value.activeTarget
        val fallbackLabel = "Titik peta ${"%.5f".format(location.latitude)}, ${"%.5f".format(location.longitude)}"
        assignPoint(
            target = target,
            point = TowingRoutePoint(fallbackLabel, location.latitude, location.longitude),
            resolving = true,
        )

        viewModelScope.launch {
            orderRepository.reverseGeocodePoint(LocationPayload(location.latitude, location.longitude))
                .onSuccess { result ->
                    if (isUsablePoint(result.latitude, result.longitude)) {
                        assignPoint(
                            target = target,
                            point = TowingRoutePoint(
                                label = result.label.ifBlank { fallbackLabel },
                                latitude = result.latitude,
                                longitude = result.longitude,
                            ),
                            resolving = false,
                        )
                    } else {
                        _uiState.update { it.copy(isResolvingPoint = false) }
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            isResolvingPoint = false,
                            error = error.localizedMessage
                                ?: "Alamat titik peta belum terbaca. Titik tetap dapat digunakan.",
                        )
                    }
                }
        }
    }

    fun selection(): TowingRouteSelection = TowingRouteSelection(
        pickup = _uiState.value.pickup,
        dropoff = _uiState.value.dropoff,
    )

    fun setError(message: String) {
        _uiState.update { it.copy(error = message) }
    }

    private fun assignPoint(
        target: TowingRouteTarget,
        point: TowingRoutePoint,
        resolving: Boolean = false,
    ) {
        _uiState.update {
            when (target) {
                TowingRouteTarget.PICKUP -> it.copy(
                    pickup = point,
                    searchQuery = point.label,
                    searchResults = emptyList(),
                    isResolvingPoint = resolving,
                    error = null,
                )
                TowingRouteTarget.DROPOFF -> it.copy(
                    dropoff = point,
                    searchQuery = point.label,
                    searchResults = emptyList(),
                    isResolvingPoint = resolving,
                    error = null,
                )
            }
        }
    }
}

private fun Double.isValidCoordinate(): Boolean = this in -90.0..90.0

private fun Double.isValidLongitude(): Boolean = this in -180.0..180.0

private fun isUsablePoint(latitude: Double, longitude: Double): Boolean =
    latitude.isValidCoordinate() && longitude.isValidLongitude() && !(latitude == 0.0 && longitude == 0.0)
