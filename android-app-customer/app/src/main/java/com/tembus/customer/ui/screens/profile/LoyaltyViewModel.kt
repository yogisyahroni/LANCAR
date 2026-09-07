package com.tembus.customer.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tembus.customer.data.model.LoyaltyInfo
import com.tembus.customer.data.api.TEMBUSApiService
import com.tembus.customer.data.model.FoodMembershipEntitlement
import com.tembus.customer.data.model.FoodMembershipPlan
import com.tembus.customer.data.repository.ProfileRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// C9: ViewModel loyalty
@HiltViewModel
class LoyaltyViewModel @Inject constructor(
    private val repository: ProfileRepository,
    private val apiService: TEMBUSApiService
) : ViewModel() {

    private val _loyaltyInfo = MutableStateFlow<LoyaltyInfo?>(null)
    val loyaltyInfo: StateFlow<LoyaltyInfo?> = _loyaltyInfo.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _membership = MutableStateFlow<FoodMembershipEntitlement?>(null)
    val membership: StateFlow<FoodMembershipEntitlement?> = _membership.asStateFlow()
    private val _membershipPlans = MutableStateFlow<List<FoodMembershipPlan>>(emptyList())
    val membershipPlans: StateFlow<List<FoodMembershipPlan>> = _membershipPlans.asStateFlow()

    fun loadLoyaltyInfo() {
        viewModelScope.launch {
            _loading.value = true
            _error.value = null
            repository.getLoyaltyInfo()
                .onSuccess { info -> _loyaltyInfo.value = info }
                .onFailure { e -> _error.value = e.message ?: "Gagal memuat loyalty" }
            _loading.value = false
        }
    }

    fun loadFoodMembership() {
        viewModelScope.launch {
            apiService.getFoodMembership().takeIf { it.isSuccessful }?.body()?.let { _membership.value = it }
            apiService.listFoodMembershipPlans().takeIf { it.isSuccessful }?.body()?.get("plans")?.let { _membershipPlans.value = it }
        }
    }

    fun subscribeFoodMembership(planId: String) {
        viewModelScope.launch {
            _error.value = null
            val response = apiService.subscribeFoodMembership(
                java.util.UUID.randomUUID().toString(), mapOf("plan_id" to planId)
            )
            if (response.isSuccessful) _membership.value = response.body()
            else _error.value = "Pendaftaran membership belum berhasil (${response.code()})"
        }
    }
}
