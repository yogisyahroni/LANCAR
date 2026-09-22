package com.tembus.customer.ui.screens.main

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.FoodMerchant
import com.tembus.customer.data.model.GlobalBanner
import com.tembus.customer.data.model.Order
import com.tembus.customer.data.model.DeliveryServiceProduct
import com.tembus.customer.data.model.CustomerEligiblePromo
import com.tembus.customer.data.config.ExperienceBannerAnalytics
import com.tembus.customer.data.config.ExperienceBannerEvent
import com.tembus.customer.data.config.model.ExperienceConfigSnapshot
import com.tembus.customer.data.repository.NotificationRepository
import com.tembus.customer.data.repository.OrderRepository
import com.tembus.customer.data.repository.ProfileRepository
import com.tembus.customer.data.session.AuthSessionManager
import com.tembus.customer.domain.config.ExperienceConfigManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val notificationRepository: NotificationRepository,
    private val profileRepository: ProfileRepository,
    private val sessionManager: AuthSessionManager,
    private val experienceConfigManager: ExperienceConfigManager,
    private val experienceBannerAnalytics: ExperienceBannerAnalytics,
    private val apiService: TEMBUSApiService,
) : ViewModel() {
    private val technicalErrorMarkers = listOf("HTTP ", "Exception", "java.", "kotlin.", "retrofit", "okhttp", "timeout")

    val customerName: StateFlow<String?> = sessionManager.customerName
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), "Pelanggan")

    // FB-126: backend TIDAK memblokir order food kedua — UI harus
    // tampilkan SEMUA order aktif (list), bukan satu banner saja.
    private val _activeOrders = MutableStateFlow<List<Order>>(emptyList())
    val activeOrders = _activeOrders.asStateFlow()

    private val _recentCompletedOrder = MutableStateFlow<Order?>(null)
    val recentCompletedOrder = _recentCompletedOrder.asStateFlow()

    private val _incomingPackages = MutableStateFlow<List<Order>>(emptyList())
    val incomingPackages = _incomingPackages.asStateFlow()

    private val _services = MutableStateFlow<List<DeliveryServiceProduct>>(emptyList())
    val services = _services.asStateFlow()
    val experienceSnapshot = experienceConfigManager.snapshot

    fun recordExperienceBannerEvent(event: ExperienceBannerEvent) {
        viewModelScope.launch {
            experienceBannerAnalytics.record(event)
        }
    }

    suspend fun resolveExperienceAsset(snapshot: ExperienceConfigSnapshot, assetId: String): String? {
        val path = experienceConfigManager.resolveAssetPath(snapshot, assetId)
        if (!path.isNullOrBlank()) return path

        if (assetId.startsWith("http://") || assetId.startsWith("https://")) return assetId
        if (assetId.startsWith("/")) return "http://10.0.2.2:8080$assetId"

        val ref = snapshot.manifest.assetReferences.firstOrNull { it.assetId == assetId }
        if (ref != null && ref.uri.isNotBlank()) {
            return if (ref.uri.startsWith("/")) "http://10.0.2.2:8080${ref.uri}" else ref.uri
        }

        return "http://10.0.2.2:8080/uploads/banners/$assetId.jpg"
    }

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _dataError = MutableStateFlow<String?>(null)
    val dataError = _dataError.asStateFlow()

    // A4: global banner (pengumuman in-app platform-wide dari super_admin).
    private val _banners = MutableStateFlow<List<GlobalBanner>>(emptyList())
    val banners = _banners.asStateFlow()

    private val _notificationUnreadCount = MutableStateFlow(0)
    val notificationUnreadCount = _notificationUnreadCount.asStateFlow()

    private val _notificationUnreadByCategory = MutableStateFlow<Map<String, Int>>(emptyMap())
    val notificationUnreadByCategory = _notificationUnreadByCategory.asStateFlow()

    // Home wallet must be profile-backed; null means unavailable/loading rather
    // than a sample balance copied from a design frame.
    private val _walletBalance = MutableStateFlow<Long?>(null)
    val walletBalance = _walletBalance.asStateFlow()

    private val _availablePromoCount = MutableStateFlow<Int?>(null)
    val availablePromoCount = _availablePromoCount.asStateFlow()

    // The home hero is presentation for the canonical promo campaign. Keep
    // the campaign itself server-owned so the Figma copy never becomes a
    // second, hardcoded source of truth in the Android client.
    private val _featuredPromo = MutableStateFlow<CustomerEligiblePromo?>(null)
    val featuredPromo = _featuredPromo.asStateFlow()

    // DESIGN.md §12: rekomendasi kuliner dekatmu (maks 6, hanya yang buka).
    // Dimuat sekali per lokasi GPS; gagal diam-diam agar Home tidak diblokir.
    private val _recommendedMerchants = MutableStateFlow<List<FoodMerchant>>(emptyList())
    val recommendedMerchants = _recommendedMerchants.asStateFlow()

    init {
        refreshData()
        refreshNotificationCount()
    }

    fun refreshData() {
        viewModelScope.launch {
            _isLoading.value = true
            _dataError.value = null
            orderRepository.getOrderHistory().collectLatest { result ->
                _isLoading.value = false
                result.onSuccess { orders ->
                    // Keep every recoverable food/parcel order visible after
                    // process death; the repository is server-first and only
                    // falls back to the encrypted Room snapshot when offline.
                    _activeOrders.value = ActiveOrderRecoveryPolicy.recoverableOrders(orders)
                    _recentCompletedOrder.value = orders
                        .asSequence()
                        .filter { it.status.lowercase() in setOf("delivered", "completed", "arrived") }
                        .filterNot { order ->
                            order.serviceCategory.orEmpty().contains("towing", ignoreCase = true) ||
                                order.serviceCategory.orEmpty().contains("tambal", ignoreCase = true)
                        }
                        .maxByOrNull { it.updatedAt }
                }.onFailure { error ->
                    _activeOrders.value = emptyList()
                    _recentCompletedOrder.value = null
                    _dataError.value = userSafeMessage(
                        error.localizedMessage,
                        "Riwayat pengiriman belum dapat dimuat. Coba lagi."
                    )
                }
            }
        }
        viewModelScope.launch {
            orderRepository.getIncomingPackages().collectLatest { result ->
                result.onSuccess { packages ->
                    _incomingPackages.value = packages
                        .filter { it.status.lowercase() !in setOf("cancelled", "payment_failed", "no courier found", "no_courier_found") }
                        .take(5)
                }.onFailure { error ->
                    _incomingPackages.value = emptyList()
                    _dataError.value = userSafeMessage(
                        error.localizedMessage,
                        "Paket masuk belum dapat dimuat. Coba lagi."
                    )
                }
            }
        }
        viewModelScope.launch {
            orderRepository.getCustomerDeliveryServices().collectLatest { result ->
                result.onSuccess { services ->
                    _services.value = services
                        .filter { it.serviceCategory in setOf("on_demand", "regular", "food_delivery", "tambal_ban", "towing") && it.isEnabled } // FIX 2026-08-11: food_delivery, tambal_ban, towing category ikut muncul di grid
                        .sortedBy { it.displayOrder }
                }.onFailure { error ->
                    _services.value = emptyList()
                    _dataError.value = userSafeMessage(
                        error.localizedMessage,
                        "Layanan pengiriman belum dapat dimuat. Coba lagi."
                    )
                }
            }
        }
        // A4: global banner — failure tidak mengganggu dashboard (non-blokir).
        viewModelScope.launch {
            orderRepository.getBanners()
                .onSuccess { banners ->
                    _banners.value = banners.sortedByDescending { it.priority }
                }
                .onFailure { _banners.value = emptyList() }
        }
        viewModelScope.launch {
            profileRepository.getProfile().collectLatest { result ->
                result.onSuccess { profile -> _walletBalance.value = profile.walletBalance }
                    .onFailure { _walletBalance.value = null }
            }
        }
        viewModelScope.launch {
            runCatching { apiService.getCustomerEligiblePromos(limit = 20) }
                .onSuccess { response ->
                    if (response.isSuccessful) {
                        val promos = response.body()?.data.orEmpty()
                        _availablePromoCount.value = promos.size
                        _featuredPromo.value = promos.firstOrNull()
                    }
                }
        }
    }

    private fun userSafeMessage(raw: String?, fallback: String): String {
        val message = raw?.trim().orEmpty()
        if (message.isBlank()) return fallback
        return if (technicalErrorMarkers.any { marker -> message.contains(marker, ignoreCase = true) }) {
            fallback
        } else {
            message.take(160)
        }
    }

    fun refreshNotificationCount() {
        viewModelScope.launch {
            notificationRepository.getUnreadCount()
                .onSuccess { count ->
                    _notificationUnreadCount.value = count.total.coerceAtLeast(0)
                    _notificationUnreadByCategory.value = count.byCategory
                        .mapKeys { it.key.lowercase() }
                        .mapValues { it.value.coerceAtLeast(0) }
                }
        }
    }

    /**
     * DESIGN.md §12: rekomendasi kuliner. Dipanggil sekali per lokasi GPS
     * dari layar (bukan init) supaya tidak menembak API tanpa posisi.
     */
    fun loadFoodRecommendations(lat: Double, lng: Double) {
        if (_recommendedMerchants.value.isNotEmpty()) return
        viewModelScope.launch {
            runCatching {
                apiService.listFoodMerchants(lat, lng, null, null, null, null, 6, 0)
            }.onSuccess { res ->
                if (res.isSuccessful) {
                    _recommendedMerchants.value = (res.body()?.merchants ?: emptyList())
                        .filter { it.isOpen }
                        .take(6)
                }
            }
        }
    }
}
