package com.tembus.courier.ui.screens.service

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.courier.data.repository.OrderRepository
import com.tembus.courier.data.repository.ServiceReportProofDraftStore
import com.tembus.courier.data.repository.ServiceReportProofUploader
import com.tembus.courier.data.model.distanceKmValue
import com.tembus.courier.data.model.cleanPayoutIdr
import com.tembus.courier.data.model.ServiceAdjustmentItem
import com.tembus.courier.data.model.estimatedNetEarningsIdr
import com.tembus.courier.domain.TambalBanFlowResolver
import com.tembus.courier.domain.TambalBanStage
import com.tembus.courier.domain.TambalBanNextActionType
import com.tembus.courier.ui.components.service.EarningsData
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.inject.Inject

data class TambalBanFlowUiState(
    val isLoading: Boolean = false,
    val currentStepIndex: Int = 0,
    val title: String = "",
    val instruction: String = "",
    val isCompleted: Boolean = false,
    val nextActionLabel: String = "",
    val nextActionType: TambalBanNextActionType = TambalBanNextActionType.NONE,
    val stage: TambalBanStage = TambalBanStage.NAVIGATING_TO_LOCATION,
    val earnings: EarningsData? = null,
    val error: String? = null,
    // Info pelanggan (standar industri: nama, telepon, alamat di halaman arrived)
    val customerName: String = "",
    val customerPhone: String = "",
    val activeAddress: String = "",
    // Resi publik (TMBSxxxxxx) — tampil utk kurir/customer, bukan UUID panjang
        val orderNumber: String = "",
        // Titik lokasi layanan (soft-gate arrival 100m)
        val pickupLatitude: Double? = null,
        val pickupLongitude: Double? = null,
        // Jenis kerusakan ban (design Stitch: Tubeless/Standar/Ganti/Isi Angin
        // → mekanisme existing: dipilih kurir saat inspeksi, dikirim di report)
        val damageType: String? = null,
        val materialsUsedItems: List<String> = emptyList(),
        val inspectionBeforePhotoUrl: String? = null,
        val adjustmentSubmitting: Boolean = false,
        val adjustmentMessage: String? = null,
        val adjustmentError: String? = null
    )

@HiltViewModel
class TambalBanFlowViewModel @Inject constructor(
    private val orderRepository: OrderRepository,
    private val proofUploader: ServiceReportProofUploader,
    private val proofDraftStore: ServiceReportProofDraftStore
) : ViewModel() {

    private var orderId: String = ""

    private val _uiState = MutableStateFlow(TambalBanFlowUiState())
    val uiState: StateFlow<TambalBanFlowUiState> = _uiState.asStateFlow()

    fun loadOrder(orderId: String) {
        this.orderId = orderId
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            try {
                val order = orderRepository.getOrderById(orderId)
                if (order != null) {
                    val flowState = TambalBanFlowResolver.resolve(order)
                    val distKm = order.distanceKmValue()
                    val payout = order.estimatedNetEarningsIdr().toLong()
                    val pb = order.pricingBreakdown
                                        val serviceFee = (pb?.serviceFeeIdr ?: 0).toLong()
                                        val travelFee = (pb?.travelFeeIdr ?: 0).toLong()
                                        // Komisi platform: pct dinamis dari admin (platform_commission_percent).
                                                            // Order lama tanpa field -> fallback 20 (default bisnis).
                                                            val platformPct = pb?.platformCommissionPct?.takeIf { it > 0 } ?: 20.0
                                        val platformCommissionAmt = Math.ceil(travelFee * platformPct / 100)
                                            .toLong()
                                        // Biaya layanan platform (fixed, dibayar customer — bukan pendapatan kurir)
                                        val platformServiceFee = (pb?.platformFeeIdr ?: 0).toLong()
                                        val baseFare = (pb?.baseFareIdr ?: 0).toLong()
                                        val perKmRate = (pb?.perKmIdr ?: 0).toLong()

                    _uiState.update {
                                            it.copy(
                                                isLoading = false,
                                                currentStepIndex = flowState.currentStepIndex,
                                                title = flowState.title,
                                                instruction = flowState.instruction,
                                                isCompleted = flowState.stage == TambalBanStage.COMPLETED,
                                                nextActionLabel = flowState.nextAction.label,
                                                nextActionType = flowState.nextAction.type,
                                                stage = flowState.stage,
                                                customerName = order.customerName,
                                                                            customerPhone = order.phoneNumber.orEmpty(),
                                                                            activeAddress = flowState.activeAddress,
                                                                                                        orderNumber = order.orderNumber.orEmpty(),
                                                                                                        pickupLatitude = order.pickupLatitude,
                                                                                                        pickupLongitude = order.pickupLongitude,
                                                                                                        inspectionBeforePhotoUrl = proofDraftStore.getBeforePhotoUrl(orderId, "tambal_ban"),
                                                damageType = proofDraftStore.getTireDamageType(orderId) ?: it.damageType,
                                                materialsUsedItems = proofDraftStore.getMaterialsUsed(orderId),
                                                earnings = EarningsData(
                                                            serviceFee = serviceFee,
                                                            baseFee = baseFare,
                                                            perKmRate = perKmRate,
                                                            distanceKm = distKm,
                                                            travelFee = travelFee,
                                                            tollCost = 0,
                                                            platformCommissionPct = platformPct,
                                                            platformCommissionAmt = platformCommissionAmt,
                                                            platformServiceFee = platformServiceFee,
                                                            estimatedNetEarnings = serviceFee + travelFee - platformCommissionAmt,
                                                            settlementModel = "per_km"
                                                        )
                        )
                    }
                } else {
                    _uiState.update {
                        it.copy(isLoading = false, error = "Order tidak ditemukan")
                    }
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Gagal memuat data")
                }
            }
        }
    }

    fun handleNextAction(actionType: TambalBanNextActionType) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }

            try {
                val order = orderRepository.getOrderById(orderId) ?: run {
                    _uiState.update { it.copy(isLoading = false, error = "Order tidak ditemukan") }
                    return@launch
                }

                when (actionType) {
                    TambalBanNextActionType.ACCEPT_OFFER -> {
                        orderRepository.acceptOnDemandOffer(order)
                            .onSuccess {
                                orderRepository.updateOrderStatus(orderId, "arriving")
                            }
                    }
                    TambalBanNextActionType.NAVIGATE_TO_LOCATION -> {
                        orderRepository.updateOrderStatus(orderId, "arrived")
                    }
                    TambalBanNextActionType.ARRIVED_AT_LOCATION -> {
                        // Skip face verification check — advance directly to verifying
                        orderRepository.updateOrderStatus(orderId, "verifying")
                    }
                    TambalBanNextActionType.VERIFY_FACE -> {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = "Verifikasi wajah wajib dilakukan dari layar kamera."
                            )
                        }
                    }
                    TambalBanNextActionType.CAPTURE_INSPECTION -> {
                        _uiState.update {
                            it.copy(
                                isLoading = false,
                                error = "Foto inspeksi awal wajib diambil sebelum layanan dimulai."
                            )
                        }
                    }
                    TambalBanNextActionType.START_SERVICE -> {
                        orderRepository.updateOrderStatus(orderId, "in_progress")
                    }
                    TambalBanNextActionType.COMPLETE_SERVICE -> {
                        orderRepository.updateOrderStatus(orderId, "service_complete")
                    }
                    TambalBanNextActionType.CAPTURE_COMPLETION -> {
                        // Submit tambal ban report — termasuk jenis kerusakan (jika dipilih)
                        val reportRequest = mutableMapOf<String, Any>(
                            "order_id" to orderId,
                            "service_type" to "tambal_ban",
                            "completed_at" to utcNowRfc3339()
                        )
                        _uiState.value.damageType?.let {
                            reportRequest["tire_damage_type"] = it
                        }
                        if (_uiState.value.materialsUsedItems.isNotEmpty()) {
                            reportRequest["materials_used_items"] = _uiState.value.materialsUsedItems
                        }
                        orderRepository.createTambalBanReport(orderId, reportRequest)
                            .onSuccess {
                                orderRepository.updateOrderStatus(orderId, "completed")
                            }
                    }
                    TambalBanNextActionType.CONTACT_SUPPORT -> {
                        // Handled by UI — just refresh
                    }
                    TambalBanNextActionType.NONE -> {}
                }

                // Reload flow state after action
                loadOrder(orderId)
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Gagal menjalankan aksi")
                }
            }
        }
    }

    fun setDamageType(damageType: String) {
        val normalized = damageType.trim()
        _uiState.update { it.copy(damageType = normalized) }
        if (orderId.isNotBlank()) proofDraftStore.saveTireDamageType(orderId, normalized)
    }

    fun setMaterialsUsed(materials: List<String>) {
        val normalized = materials.map(String::trim).filter(String::isNotBlank).distinct()
        _uiState.update { it.copy(materialsUsedItems = normalized) }
        if (orderId.isNotBlank()) proofDraftStore.saveMaterialsUsed(orderId, normalized)
    }

    fun captureInspection(beforePhoto: Bitmap) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val uploadResult = proofUploader.upload(
                orderId = orderId,
                serviceType = "tambal_ban",
                proofType = "tire_photo_before",
                bitmap = beforePhoto
            )
            if (uploadResult.isFailure) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        error = uploadResult.exceptionOrNull()?.message ?: "Foto inspeksi awal belum berhasil diunggah."
                    )
                }
                return@launch
            }

            val photoUrl = uploadResult.getOrNull().orEmpty()
            proofDraftStore.saveBeforePhotoUrl(orderId, "tambal_ban", photoUrl)
            orderRepository.updateOrderStatus(orderId, "in_progress")
            if (proofDraftStore.getServiceStartedAtMillis(orderId, "tambal_ban") == null) {
                proofDraftStore.saveServiceStartedAtMillis(orderId, "tambal_ban", System.currentTimeMillis())
            }
            loadOrder(orderId)
        }
    }

    fun proposeServiceAdjustment(reason: String, items: List<ServiceAdjustmentItem>) {
        if (!isValidServiceAdjustmentDraft(reason, items)) {
            _uiState.update { it.copy(adjustmentError = "Lengkapi alasan dan item adjustment dengan nominal yang valid.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(adjustmentSubmitting = true, adjustmentMessage = null, adjustmentError = null) }
            orderRepository.proposeServiceAdjustment(orderId, reason.trim(), items)
                .onSuccess { adjustment ->
                    _uiState.update {
                        it.copy(
                            adjustmentSubmitting = false,
                            adjustmentMessage = "Adjustment Rp ${adjustment.deltaIdr} terkirim. Menunggu persetujuan customer.",
                            adjustmentError = null
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update {
                        it.copy(
                            adjustmentSubmitting = false,
                            adjustmentError = error.localizedMessage ?: "Adjustment gagal dikirim"
                        )
                    }
                }
        }
    }

    private fun utcNowRfc3339(): String {
        return SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
    }
}
